/**
 * Model provider contract.
 *
 * Artisan never assumes a frontier model: every provider must be able to answer
 * small, well-formed JSON requests. Providers advertise what they can do so the
 * runtime can downgrade gracefully (e.g. honouring `canWriteCode: false`).
 */

export const CAPABILITY = {
  CHAT: 'chat',
  JSON: 'json',
  TOOLS: 'tools',
  CODE: 'code',
  LONG_CONTEXT: 'long-context',
};

export class ModelProvider {
  constructor({ id, label = id, model = '', capabilities = [CAPABILITY.CHAT, CAPABILITY.JSON] } = {}) {
    this.id = id;
    this.label = label;
    this.model = model;
    this.capabilities = new Set(capabilities);
    this.stats = { calls: 0, failures: 0, promptTokens: 0, completionTokens: 0, totalMs: 0 };
  }

  get ready() {
    return true;
  }

  supports(capability) {
    return this.capabilities.has(capability);
  }

  /* eslint-disable-next-line no-unused-vars */
  async generate(request) {
    throw new Error(`${this.id}: generate() not implemented`);
  }

  async complete(prompt, options = {}) {
    const response = await this.generate({
      messages: [{ role: 'user', content: prompt }],
      ...options,
    });
    return response.text;
  }

  /**
   * Ask for JSON and take responsibility for cleaning/parsing it.
   * Implemented by the router in practice; kept here for direct calls in tests.
   */
  async json(prompt, options = {}) {
    const { extractJson } = await import('./json.mjs');
    const text = await this.complete(prompt, { ...options, json: true });
    const parsed = extractJson(text);
    if (!parsed.ok) {
      const { ModelError } = await import('../core/errors.mjs');
      throw new ModelError(`${this.id}: response was not valid JSON`, { details: { text: text.slice(0, 400) } });
    }
    return parsed.value;
  }

  async health() {
    return { ok: true, provider: this.id, model: this.model };
  }

  recordSuccess({ promptTokens = 0, completionTokens = 0, ms = 0 } = {}) {
    this.stats.calls += 1;
    this.stats.promptTokens += promptTokens;
    this.stats.completionTokens += completionTokens;
    this.stats.totalMs += ms;
  }

  recordFailure() {
    this.stats.calls += 1;
    this.stats.failures += 1;
  }

  describe() {
    return {
      id: this.id,
      label: this.label,
      model: this.model,
      capabilities: [...this.capabilities],
      ready: this.ready,
      stats: { ...this.stats },
    };
  }
}

export function buildMessages({ system, user, history = [] }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push(...history);
  messages.push({ role: 'user', content: user });
  return messages;
}