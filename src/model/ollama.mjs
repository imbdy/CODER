/** Ollama provider (local models + ollama.com cloud models through the same API). */

import fs from 'node:fs';
import { ModelProvider, CAPABILITY } from './provider.mjs';
import { ModelError } from '../core/errors.mjs';

export class OllamaProvider extends ModelProvider {
  constructor(config = {}) {
    super({
      id: 'ollama',
      label: 'Ollama',
      model: config.model ?? 'qwen2.5-coder:7b',
      capabilities: [CAPABILITY.CHAT, CAPABILITY.JSON, CAPABILITY.CODE, CAPABILITY.TOOLS],
    });
    this.host = String(config.host ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
    this.temperature = config.temperature ?? 0.35;
    this.numCtx = config.numCtx ?? 16384;
    this.timeoutMs = config.timeoutMs ?? 240000;
    this.keepAlive = config.keepAlive ?? '30m';
    this.available = undefined;
    this.vision = typeof config.vision === 'boolean' ? config.vision : /llava|vision|qwen[\d.]*-?vl|minicpm-v|gemma3|moondream|bakllava|llama3\.2-vision|granite.*vision|mistral-small3|pixtral/i.test(this.model);
  }

  async health() {
    try {
      const response = await this.#fetch('/api/tags', { method: 'GET' }, 5000);
      const data = await response.json();
      const models = (data.models ?? []).map((model) => model.name);
      this.available = models;
      const hasModel = models.some((name) => name === this.model || name.startsWith(`${this.model}:`) || name.split(':')[0] === this.model.split(':')[0]);
      return {
        ok: hasModel,
        provider: this.id,
        model: this.model,
        models,
        hint: hasModel ? undefined : `model "${this.model}" not found. Run: ollama pull ${this.model}`,
      };
    } catch (error) {
      this.available = [];
      return { ok: false, provider: this.id, error: String(error?.message ?? error), hint: 'Is `ollama serve` running?' };
    }
  }

  async #fetch(pathname, init, timeoutMs = this.timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${this.host}${pathname}`, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async generate({ messages, system, prompt, temperature, maxTokens, json, numCtx, onToken, images }) {
    const chatMessages = [];
    if (system) chatMessages.push({ role: 'system', content: system });
    if (messages?.length) chatMessages.push(...messages);
    let imagesSent = false;
    if (prompt) {
      const encoded = Array.isArray(images) && images.length && this.vision ? images.map(encodeImage).filter(Boolean) : [];
      if (encoded.length) { chatMessages.push({ role: 'user', content: prompt, images: encoded }); imagesSent = true; }
      else chatMessages.push({ role: 'user', content: prompt });
    }

    const started = Date.now();
    const useStream = typeof onToken === 'function';
    let response;
    try {
      response = await this.#fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: chatMessages.map((message) => ({ role: message.role === 'system' ? 'system' : message.role, content: message.content, ...(message.images ? { images: message.images } : {}) })),
          stream: useStream,
          keep_alive: this.keepAlive,
          format: json ? 'json' : undefined,
          options: {
            temperature: temperature ?? this.temperature,
            num_ctx: numCtx ?? this.numCtx,
            num_predict: maxTokens ?? 2048,
          },
        }),
      });
    } catch (error) {
      this.recordFailure();
      throw new ModelError(`ollama request failed: ${error?.message ?? error}`, { hint: 'Check `ollama serve` and the model name.' });
    }

    if (!response.ok) {
      this.recordFailure();
      const body = await response.text().catch(() => '');
      throw new ModelError(`ollama responded ${response.status}: ${body.slice(0, 300)}`);
    }

    if (useStream && response.body) {
      // Stream NDJSON: each line is JSON with {message:{content}, done}
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let lastData = null;
      const consume = (line) => {
        if (!line.trim()) return;
        const obj = JSON.parse(line);
        if (obj.error) throw new ModelError(String(obj.error));
        lastData = obj;
        const piece = obj.message?.content ?? '';
        if (piece) { fullText += piece; onToken(piece); }
      };
      try {
        for await (const chunk of response.body) {
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) consume(line);
        }
        consume(buffer + decoder.decode());
        if (!lastData?.done) throw new ModelError('stream ended without a completion marker');
      } catch (error) {
        this.recordFailure();
        throw new ModelError(`ollama stream failed: ${error?.message ?? error}`);
      }
      const data = lastData ?? {};
      this.recordSuccess({
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        ms: Date.now() - started,
      });
      return {
        text: fullText,
        provider: this.id,
        model: this.model,
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        ms: Date.now() - started,
        raw: data,
        imagesSent,
      };
    }

    const data = await response.json();
    const text = data?.message?.content ?? '';
    if (useStream && text) { try { onToken(text); } catch {} }
    this.recordSuccess({
      promptTokens: data.prompt_eval_count ?? 0,
      completionTokens: data.eval_count ?? 0,
      ms: Date.now() - started,
    });
    return {
      text,
      provider: this.id,
      model: this.model,
      promptTokens: data.prompt_eval_count ?? 0,
      completionTokens: data.eval_count ?? 0,
      ms: Date.now() - started,
      raw: data,
      imagesSent,
    };
  }
}

function encodeImage(image) {
  try {
    if (image?.base64) return image.base64;
    if (image?.path) return fs.readFileSync(image.path).toString('base64');
  } catch { /* skip unreadable image */ }
  return undefined;
}