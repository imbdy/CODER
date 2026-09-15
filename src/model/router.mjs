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
      : (models.order ?? ['openaiCompatible', 'deterministic']);
    const list = [];
    for (const id of order) {
      if (id === 'openaiCompatible') list.push(new OpenAICompatibleProvider(models.openaiCompatible ?? {}));
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
      if (id === 'ollama') continue;
      const provider = this.providers.find((entry) => entry.id === id);
      if (!provider) continue;
      if (!provider.ready) continue;
      const health = await this.#healthy(provider);
      if (health.ok || provider.id === 'deterministic') chain.push(provider);
    }
    if (!chain.length) chain.push(this.deterministic);
    return chain;
  }
  async activeChain() {
    if (this.preferred) return [this.preferred];
    const order = this.offline
      ? ['deterministic']
      : (this.config?.models?.order ?? ['openaiCompatible', 'deterministic']);
    return this.#healthyChain(order);
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
      temperature, phase = 'generate', code = false, languages,
    } = options;
    const chain = await this.activeChain();
    const errors = [];
    for (const provider of chain) {
      const started = Date.now();
      try {
        const response = await provider.generate({
          prompt,
          system: system ?? systemFor(kind),
          json: false,
          maxTokens,
          temperature,
          meta: { kind, payload },
        });
        if (!response.text?.trim()) {
          errors.push(`${provider.id}: empty response`);
          this.#emitCall({ provider, kind, phase, ok: false, note: 'empty' });
          continue;
        }
        this.#emitCall({ provider, kind, phase, response, started, ok: true });
        const text = code ? extractCodeBlock(response.text, languages) : response.text;
        return { text, provider: provider.id, model: provider.model, meta: response };
      } catch (error) {
        errors.push(`${provider.id}: ${error?.message ?? error}`);
        this.#emitCall({ provider, kind, phase, ok: false, error: String(error?.message ?? error) });
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
      return 'You are a senior frontend engineer analysing a request. Reply with STRICT JSON only. No prose, no markdown.';
    case 'plan':
      return 'You are a senior frontend architect. Reply with STRICT JSON only: {"steps":[{"id":string,"title":string,"goal":string,"files":string[],"skills":string[],"verification":string[]}]}. No prose.';
    case 'direction':
      return 'You are an award-winning art director. Reply with STRICT JSON only describing the chosen design direction.';
    case 'critique':
      return 'You are a ruthless design reviewer. Reply with STRICT JSON only: scores per dimension and concrete fixes.';
    case 'copy':
      return 'You are a senior copywriter for high-end product interfaces. Reply with STRICT JSON only. No prose, no markdown, no code fences.';
    case 'code':
      return 'You are an expert frontend engineer. Output complete, production-quality source files. No explanations.';
    default:
      return 'You are a precise senior frontend engineer. Reply with JSON only when JSON is requested.';
  }
}

export { systemFor };

export function createRouter(options) {
  return new ModelRouter(options);
}