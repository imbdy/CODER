/**
 * Any OpenAI-compatible /chat/completions endpoint:
 * OpenAI, OpenRouter, Groq, Together, LM Studio, vLLM, llama.cpp server, Gemini's
 * OpenAI bridge, or `opencode` gateway. Configure with:
 *   ARTISAN_BASE_URL, ARTISAN_API_KEY, ARTISAN_MODEL
 */

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

  async generate({ messages, system, prompt, temperature, maxTokens, json }) {
    if (!this.ready) throw new ModelError('openai-compatible provider is not configured');
    const chatMessages = [];
    if (system) chatMessages.push({ role: 'system', content: system });
    if (messages?.length) chatMessages.push(...messages);
    if (prompt) chatMessages.push({ role: 'user', content: prompt });

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
    return { text, provider: this.id, model: this.model, promptTokens, completionTokens, ms: Date.now() - started, raw: data };
  }
}