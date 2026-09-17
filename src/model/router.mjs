/**
 * Model router: provider chain, health probing, JSON validation, retries, fallback.
 *
 * The router is the only place that talks to providers. Callers ask for a
 * *kind* of reasoning (`json(prompt, { kind, payload })`); the router guarantees
 * that a well-formed result comes back, falling down the chain
 * (openai-compatible -> deterministic heuristics) as needed.
 */

import { extractJson, extractCodeBlock } from './json.mjs';
import { OllamaProvider } from './ollama.mjs';
import { OpenAICompatibleProvider } from './openai-compatible.mjs';
import { DeterministicProvider } from './deterministic.mjs';
import { normalizeProviderId } from '../core/config.mjs';
import { EVENT } from '../core/events.mjs';
import { ModelError } from '../core/errors.mjs';

export class ModelRouter {
  constructor({ config, logger, bus, offline = false } = {}) {
    this.config = config;
    this.logger = logger;
    this.bus = bus;
    this.offline = offline;
    this.preferred = undefined;
    this.providers = this.#build();
    this.healthCache = new Map();
    this.trace = [];
  }

    #build() {
    const models = this.config?.models ?? {};
    const order = this.offline
      ? ['deterministic']
      : (models.order ?? ['ollama', 'openaiCompatible', 'deterministic']).map(normalizeProviderId);
    const list = [];
    for (const id of order) {
      if (id === 'ollama') list.push(new OllamaProvider(models.ollama ?? {}));
      else if (id === 'openai-compatible' || id === 'openaiCompatible') list.push(new OpenAICompatibleProvider(models.openaiCompatible ?? models['openai-compatible'] ?? {}));
      else if (id === 'deterministic') list.push(new DeterministicProvider(models.deterministic ?? {}));
    }
    if (!list.length) list.push(new DeterministicProvider());
    return list;
  }

  get deterministic() {
    return this.providers.find((provider) => provider.id === 'deterministic');
  }

  /** Force a provider (used by `--brain` / `--offline`). */
  use(id) {
    const provider = this.providers.find((entry) => entry.id === id);
    if (!provider) throw new ModelError(`unknown provider "${id}". Available: ${this.providers.map((p) => p.id).join(', ')}`);
    this.preferred = provider;
    return provider;
  }

  async #healthy(provider) {
    if (this.healthCache.has(provider.id)) return this.healthCache.get(provider.id);
    let result;
    try {
      result = await provider.health().catch((error) => ({ ok: false, provider: provider.id, error: String(error?.message ?? error) }));
    } catch (error) {
      result = { ok: false, provider: provider.id, error: String(error?.message ?? error) };
    }
    this.healthCache.set(provider.id, result);
    if (!result.ok && this.logger) {
      this.logger.debug(`provider ${provider.id} unavailable`, { hint: result.hint, error: result.error });
    }
    return result;
  }

    /** Providers that are usable right now, best first. */
  async #healthyChain(order) {
    const chain = [];
    for (const id of order) {
      const provider = this.providers.find((entry) => entry.id === id);
      if (!provider) continue;
      if (!provider.ready) continue;
      const health = await this.#healthy(provider);
      if (health.ok || provider.id === 'deterministic') chain.push(provider);
    }
    if (!chain.length) {
      const fallback = this.deterministic ?? this.providers.find(p => p.id === 'deterministic');
      if (fallback) chain.push(fallback);
    }
    return chain.filter(Boolean);
  }
  async activeChain() {
    if (this.preferred) return [this.preferred];
    const order = this.offline
      ? ['deterministic']
      : (this.config?.models?.order ?? ['ollama', 'openaiCompatible', 'deterministic']).map(normalizeProviderId);
    return this.#healthyChain(order);
  }

  /**
   * Is a *real* language model usable right now?
   *
   * The deterministic design engine cannot drive a tool-calling loop (it answers
   * from local heuristics), so the agent runtime asks this before handing a
   * request to `runAgent` and falls back to the deterministic pipeline when false.
   */
  async hasLiveModel() {
    if (this.preferred) return this.preferred.id !== 'deterministic';
    const chain = await this.activeChain();
    return chain.some((provider) => provider && provider.id !== 'deterministic');
  }

  /** Human-readable description of the brain that would answer right now. */
  async activeBrain() {
    const chain = await this.activeChain();
    const provider = chain[0];
    return provider ? { id: provider.id, label: provider.label, model: provider.model, offline: provider.id === 'deterministic' } : undefined;
  }

  async describe({ probe = true } = {}) {
    const out = [];
    for (const provider of this.providers) {
      const health = probe ? await this.#healthy(provider) : undefined;
      out.push({ ...provider.describe(), health });
    }
    return out;
  }

  /**
   * Ask for structured JSON. Walks the provider chain until one returns parseable,
   * schema-valid JSON. Throws only if every provider failed.
   *
   * @param {string} prompt
   * @param {{kind?: string, payload?: object, system?: string, maxTokens?: number,
   *          temperature?: number, validate?: (value: any) => boolean, phase?: string,
   *          attempts?: number}} options
   * @returns {Promise<{value: any, provider: string, model: string, strategy: string}>}
   */
  async json(prompt, options = {}) {
    const {
      kind = 'json', payload = {}, system, maxTokens = 2048,
      temperature, validate, phase = 'reason', attempts = 1,
    } = options;
    const chain = await this.activeChain();
    const errors = [];

    for (const provider of chain) {
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const started = Date.now();
        try {
          const response = await provider.generate({
            prompt,
            system: system ?? systemFor(kind),
            json: true,
            maxTokens,
            temperature: attempt === 1 ? temperature : Math.max(0, (temperature ?? 0.35) - 0.2),
            meta: { kind, payload },
          });
          const parsed = extractJson(response.text);
          if (!parsed.ok) {
            this.#emitCall({ provider, kind, phase, response, started, ok: false, attempt, note: 'invalid JSON' });
            errors.push(`${provider.id}: ${parsed.error}`);
            continue;
          }
          if (validate && !validate(parsed.value)) {
            this.#emitCall({ provider, kind, phase, response, started, ok: false, attempt, note: 'schema mismatch' });
            errors.push(`${provider.id}: schema validation failed (${parsed.strategy})`);
            continue;
          }
          this.#emitCall({ provider, kind, phase, response, started, ok: true, attempt });
          return { value: parsed.value, provider: provider.id, model: provider.model, strategy: parsed.strategy, meta: response };
        } catch (error) {
          errors.push(`${provider.id}: ${error?.message ?? error}`);
          this.#emitCall({ provider, kind, phase, ok: false, attempt, error: String(error?.message ?? error) });
        }
      }
    }

    throw new ModelError(`no provider produced valid JSON for "${kind}"`, {
      details: { errors },
      hint: 'Run `artisan doctor`; or force the offline brain with --brain deterministic.',
    });
  }

    /** Free-form (or code-block) text generation. */
  async text(prompt, options = {}) {
    const {
      kind = 'chat', payload = {}, system, maxTokens = 4096,
      temperature, phase = 'generate', code = false, languages, messages, onToken, liveOnly = false,
    } = options;
    const fullChain = await this.activeChain();
    const chain = fullChain.filter((provider) => provider && (!liveOnly || provider.id !== 'deterministic'));
    const errors = [];
    // Root-cause visibility: an empty chain means NO provider was usable.
    // This happens when liveOnly=true is requested but no live model is reachable
    // (ollama down / openai-compatible unhealthy) — the deterministic engine was
    // explicitly excluded. Callers must route discussion locally in that case
    // instead of treating this as a generic generation failure.
    if (!chain.length) {
      const health = await this.describe({ probe: false }).catch(() => []);
      throw new ModelError(`no provider produced text for "${kind}"`, {
        details: {
          errors,
          liveOnly,
          chain: fullChain.map((p) => p?.id),
          providers: health.map?.((h) => ({ id: h.id, ready: h.ready })) ?? [],
        },
        hint: liveOnly
          ? 'No live model available (active chain is empty after excluding deterministic). Start `ollama serve` + `ollama pull qwen2.5-coder:7b`, or set ARTISAN_API_KEY / ARTISAN_BASE_URL + ARTISAN_MODEL. Discussion turns must be handled locally when offline — do not send them through the liveOnly provider path.'
          : 'Run `artisan doctor`; or force the offline brain with --brain deterministic.',
      });
    }
    let emitted = false;
    for (const provider of chain) {
      const started = Date.now();
      for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await provider.generate({
          prompt: messages ? undefined : prompt,
          messages,
          onToken: onToken ? (text) => { emitted = true; onToken(text); } : undefined,
          system: system ?? systemFor(kind),
          json: false,
          maxTokens,
          temperature,
          meta: { kind, payload },
        });
        if (!response.text?.trim()) {
          errors.push(`${provider.id}: empty response`);
          this.#emitCall({ provider, kind, phase, ok: false, note: 'empty' });
          break;
        }
        this.#emitCall({ provider, kind, phase, response, started, ok: true });
        const text = code ? extractCodeBlock(response.text, languages) : response.text;
        return { text, provider: provider.id, model: provider.model, meta: response };
      } catch (error) {
        const msg = String(error?.message ?? error);
        const isRate = msg.includes('429') || msg.includes('413') || msg.includes('Rate limit') || msg.includes('TPM') || msg.includes('Request too large');
        errors.push(`${provider.id}: ${msg}`);
        this.#emitCall({ provider, kind, phase, ok: false, error: msg });
        if (emitted) throw error;
        if (isRate && attempt === 1) {
          const waitMs = (msg.match(/try again in ([\d.]+)s/)?.[1] ? parseFloat(msg.match(/try again in ([\d.]+)s/)[1]) * 1000 : 20000);
          await new Promise(r => setTimeout(r, Math.min(waitMs + 2000, 30000)));
          continue;
        }
        break;
      }
      }
    }
    throw new ModelError(`no provider produced text for "${kind}"`, { details: { errors } });
  }

  #emitCall({ provider, kind, phase, response, started, ok, attempt = 1, note, error }) {
    const entry = {
      provider: provider.id,
      model: provider.model,
      kind,
      phase,
      attempt,
      ok,
      ms: Date.now() - (started ?? Date.now()),
      note,
      error,
      promptTokens: response?.promptTokens ?? 0,
      completionTokens: response?.completionTokens ?? 0,
    };
    this.trace.push(entry);
    this.bus?.emit(EVENT.MODEL_CALL, entry);
    this.logger?.debug(`${provider.id}/${kind}${ok ? '' : ' FAILED'}`, { ms: entry.ms, note, error });
  }

  summary() {
    const byProvider = {};
    for (const entry of this.trace) {
      byProvider[entry.provider] = byProvider[entry.provider] ?? { calls: 0, failures: 0, ms: 0 };
      byProvider[entry.provider].calls += 1;
      if (!entry.ok) byProvider[entry.provider].failures += 1;
      byProvider[entry.provider].ms += entry.ms;
    }
    return {
      calls: this.trace.length,
      failures: this.trace.filter((entry) => !entry.ok).length,
      byProvider,
      usedProviders: [...new Set(this.trace.filter((entry) => entry.ok).map((entry) => entry.provider))],
      providers: this.providers.map((provider) => provider.describe()),
    };
  }
}

function systemFor(kind) {
  switch (kind) {
    case 'understand':
      return 'You are a senior frontend engineer classifying a request. Reply with STRICT JSON only: {"taskType": string, "intent": string, "subject": string, "scope": "component"|"page"|"app", "constraints": string[], "summary": string, "confidence": number}. taskType must be one of: create-page, create-component, create-app, enhance, redesign, motion, responsive, 3d, performance, accessibility, fix, review, library. No prose, no markdown.';
    case 'plan':
      return 'You are a senior frontend architect. Plan the work. Reply with STRICT JSON only: {"steps":[{"id":string,"title":string,"goal":string,"files":string[],"skills":string[],"verification":string[]}]}. No prose, no markdown.';
    case 'direction':
      return 'You are an award-winning art director choosing a visual direction. Reply with STRICT JSON only: {"id": string, "why": string}. Only use ids from the candidates provided. No prose, no markdown.';
    case 'critique':
      return 'You are a ruthless design reviewer. Reply with STRICT JSON only: {"overall": number, "scores": {"typography":number,"spacing":number,"hierarchy":number,"interaction":number,"responsive":number,"accessibility":number}, "fixes": [{"area":string,"fix":string}]}. overall is 0-100. No prose, no markdown.';
    case 'copy':
      return 'You are a senior copywriter for high-end product interfaces. Reply with STRICT JSON only: {"sections":[{"type":string,"headline"?:string,"subhead"?:string,"heading"?:string,"lead"?:string,"eyebrow"?:string,"body"?:string,"items"?:string[]}]}. Follow the expertise (skills) block. No prose, no markdown, no code fences.';
    case 'code':
      return 'You are Artisan, an autonomous frontend design agent. You build real, production-quality websites. You are given a request, workspace inspection, skills context, and tools. THINK first, then ACT using tools to read, write, patch files, and run builds. Build complete, self-contained code: HTML+CSS+JS, or JSX/React/Next.js if the project uses them. Follow the skills block for design principles.\n\nALWAYS respond with a JSON array of tool calls inside a ```json code block. Example:\n```json\n[\n  {"tool": "listFiles", "args": {}},\n  {"tool": "writeFile", "args": {"rel": "index.html", "content": "<!DOCTYPE html><html>..."}}\n]\n```\nBatch independent calls. Never use exec to write files. When done, emit [{"done":true,"summary":"..."}].\n\nDecide what to build based on the workspace: if the workspace has a package.json with react/next dependencies, write JSX/React/Next.js. Otherwise write plain HTML + CSS + JS. Never emit HTML-only — always include CSS and JS where appropriate.';
    default:
      return 'You are a precise senior frontend engineer. Reply with JSON only when JSON is requested.';
  }
}

export { systemFor };

export function createRouter(options) {
  return new ModelRouter(options);
}