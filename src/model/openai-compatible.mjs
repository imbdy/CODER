/**
 * Any OpenAI-compatible /chat/completions endpoint:
 * OpenAI, OpenRouter, Groq, Together, LM Studio, vLLM, llama.cpp server, Gemini's
 * OpenAI bridge, or `opencode` gateway. Configure with:
 *   ARTISAN_BASE_URL, ARTISAN_API_KEY, ARTISAN_MODEL
 */

import fs from 'node:fs';
import { ModelProvider, CAPABILITY } from './provider.mjs';
import { ModelError } from '../core/errors.mjs';

export class OpenAICompatibleProvider extends ModelProvider {
  constructor(config = {}) {
    super({
      id: 'openai-compatible',
      label: config.label ?? 'OpenAI-compatible',
      model: config.model ?? '',
      capabilities: [CAPABILITY.CHAT, CAPABILITY.JSON, CAPABILITY.CODE, CAPABILITY.TOOLS, CAPABILITY.LONG_CONTEXT],
    });
    this.baseUrl = String(config.baseUrl ?? '').replace(/\/$/, '');
    this.apiKey = config.apiKey ?? '';
    this.temperature = config.temperature ?? 0.35;
    this.timeoutMs = config.timeoutMs ?? 180000;
    this.extraHeaders = config.headers ?? {};
    // Explicit TPM beats discovery; Groq's free tier is 8k and must be paced.
    this.configuredTpm = Number(config.tokensPerMinute) || (/groq\.com/.test(this.baseUrl) ? 8000 : undefined);
    this.lastRateLimit = undefined;
    // Vision: explicit config wins; otherwise infer from well-known multimodal model names.
    this.vision = typeof config.vision === 'boolean' ? config.vision : /gpt-4o|gpt-4\.1|gpt-5|\bo[34]\b|claude|gemini|pixtral|llava|vision|qwen[\d.]*-?vl|minicpm-v|gemma-?3|grok|nova|phi-4-multimodal|omni/i.test(this.model);
  }

  get ready() {
    return Boolean(this.baseUrl && this.model);
  }

  async health() {
    if (!this.ready) {
      return { ok: false, provider: this.id, hint: 'Set ARTISAN_BASE_URL and ARTISAN_MODEL (and ARTISAN_API_KEY if required).' };
    }
    try {
      const response = await this.#fetch('/models', { method: 'GET' }, 10000);
      if (!response.ok) return { ok: false, provider: this.id, error: `HTTP ${response.status}` };
      return { ok: true, provider: this.id, model: this.model };
    } catch (error) {
      return { ok: false, provider: this.id, error: String(error?.message ?? error) };
    }
  }

  async #fetch(pathname, init, timeoutMs = this.timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${pathname}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
          ...this.extraHeaders,
          ...(init?.headers ?? {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async generate({ messages, system, prompt, temperature, maxTokens, json, images }) {
    if (!this.ready) throw new ModelError('openai-compatible provider is not configured');
    const chatMessages = [];
    if (system) chatMessages.push({ role: 'system', content: system });
    if (messages?.length) chatMessages.push(...messages);
    let imagesSent = false;
    if (prompt) {
      const parts = Array.isArray(images) && images.length && this.vision ? images.map(imagePart).filter(Boolean) : [];
      if (parts.length) {
        chatMessages.push({ role: 'user', content: [{ type: 'text', text: prompt }, ...parts] });
        imagesSent = true;
      } else {
        chatMessages.push({ role: 'user', content: prompt });
      }
    }

    const started = Date.now();
    let response;
    try {
      response = await this.#fetch('/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: this.model,
          messages: chatMessages,
          temperature: temperature ?? this.temperature,
          max_tokens: maxTokens ?? 4096,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } catch (error) {
      this.recordFailure();
      throw new ModelError(`openai-compatible request failed: ${error?.message ?? error}`);
    }

    if (!response.ok) {
      this.recordFailure();
      const body = await response.text().catch(() => '');
      throw new ModelError(`openai-compatible responded ${response.status}: ${body.slice(0, 300)}`);
    }

    // Token-per-minute accounting from the provider itself. Groq's free tier is
    // 8k TPM, which a prompt that re-sends skill bodies every turn blows through
    // in one call; the router uses this to pace instead of collecting 429s.
    this.lastRateLimit = readRateLimit(response.headers);
    const data = await response.json();
    // Groq compound puts reasoning in `message.reasoning` and sometimes content is a guide, not JSON
    const msg = data?.choices?.[0]?.message ?? {};
    let text = msg?.content ?? '';
    // If json mode was requested but content is not JSON, try reasoning (Groq compound) or combined
    if (json) {
      const reasoning = msg?.reasoning ?? '';
      const combined = `${reasoning}\n${text}`;
      // Prefer content if it already looks like JSON, otherwise try reasoning
      const hasJson = text.trim().startsWith('{') || text.trim().startsWith('[');
      if (!hasJson && reasoning) {
        // Check if reasoning contains JSON
        const jsonInReasoning = reasoning.match(/\{[\s\S]*"taskType"[\s\S]*\}/);
        if (jsonInReasoning) text = jsonInReasoning[0];
        else if (reasoning.trim().startsWith('{')) text = reasoning;
        else text = combined;
      }
    }
    const promptTokens = data?.usage?.prompt_tokens ?? 0;
    const completionTokens = data?.usage?.completion_tokens ?? 0;
    this.recordSuccess({ promptTokens, completionTokens, ms: Date.now() - started });
    return { text, provider: this.id, model: this.model, promptTokens, completionTokens, ms: Date.now() - started, raw: data, imagesSent, rateLimit: this.lastRateLimit };
  }

  /** Tokens per minute this endpoint allows, once a response has told us. */
  get tokensPerMinute() {
    return this.configuredTpm ?? this.lastRateLimit?.limitTokens;
  }

  /**
   * Pace against the provider's own token window instead of discovering the
   * limit with a 429. Returns the milliseconds waited (0 when no wait was owed).
   *
   * Every branch here must fail OPEN: if we cannot tell how big the window is or
   * how much is left, we call and let a real 429 tell us, because a wrong wait
   * is charged to every single call.
   */
  async awaitBudget(estimatedTokens = 0) {
    const limit = this.lastRateLimit;
    // `remaining: 0` is the case that most needs waiting, so test for a number
    // rather than for truthiness — but an UNKNOWN remaining must never wait.
    if (!limit || !Number.isFinite(limit.remainingTokens)) return 0;
    // Without a real window size there is no refill rate to compute, and
    // assuming one invents a wait for a provider that never published a limit.
    if (!Number.isFinite(limit.limitTokens) || limit.limitTokens <= 0) return 0;
    const needed = Math.ceil(estimatedTokens * 1.35); // reasoning models spend more than they show
    if (limit.remainingTokens >= needed) return 0;
    // Wait only for the shortfall to refill, not for a whole window: a rolling
    // bucket of `limitTokens` per minute refills at limit/60 tokens a second.
    const perSecond = Math.max(1, limit.limitTokens / 60);
    const shortfall = needed - limit.remainingTokens;
    const waitMs = Math.min(45000, Math.max(750, Math.ceil((shortfall / perSecond) * 1000) + 400));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.lastRateLimit = { ...limit, remainingTokens: Math.min(limit.limitTokens, limit.remainingTokens + shortfall) };
    return waitMs;
  }
}

/** Parse the standard `x-ratelimit-*` headers, tolerating "1m2.5s" durations. */
function readRateLimit(headers) {
  if (!headers?.get) return undefined;
  // A MISSING header is not zero. `headers.get()` returns null for one, and
  // Number(null) is 0, which read as "no tokens left in the window" — so every
  // provider that does not publish x-ratelimit-* (Ollama, OpenAI, Azure, any
  // mock) was paced 45 seconds before EVERY call. Absent must mean unknown.
  const num = (name) => {
    const raw = headers.get(name);
    if (raw === null || raw === undefined || String(raw).trim() === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const seconds = (name) => {
    const raw = headers.get(name);
    if (!raw) return undefined;
    const match = String(raw).match(/^(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/);
    if (match && (match[1] || match[2])) return (Number(match[1] ?? 0) * 60) + Number(match[2] ?? 0);
    const value = Number(String(raw).replace(/[^\d.]/g, ''));
    return Number.isFinite(value) ? value : undefined;
  };
  const limitTokens = num('x-ratelimit-limit-tokens');
  const remainingTokens = num('x-ratelimit-remaining-tokens');
  if (limitTokens === undefined && remainingTokens === undefined) return undefined;
  return {
    limitTokens,
    remainingTokens,
    resetTokensSeconds: seconds('x-ratelimit-reset-tokens'),
    limitRequests: num('x-ratelimit-limit-requests'),
    remainingRequests: num('x-ratelimit-remaining-requests'),
  };
}

/** { path | base64, mime } → OpenAI image_url content part (data URL). */
function imagePart(image) {
  try {
    const mime = image?.mime ?? 'image/png';
    let base64 = image?.base64;
    if (!base64 && image?.path) base64 = fs.readFileSync(image.path).toString('base64');
    if (!base64) return undefined;
    return { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: image?.detail ?? 'auto' } };
  } catch {
    return undefined;
  }
}
