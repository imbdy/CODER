/**
 * Deterministic ("heuristic brain") provider.
 *
 * Artisan must be useful with no model at all: a local 7B may be slow, an API key
 * may be absent, a run may need to be reproducible in CI. This provider implements
 * the same contract as the LLM providers, but answers from Artisan's own reasoning
 * modules (classification tables, design direction library, audit rules) instead of
 * a neural net.
 *
 * It is selected either explicitly (`--brain deterministic`) or automatically as the
 * last fallback in the provider chain, so a run never dead-ends.
 */

import { ModelProvider, CAPABILITY } from './provider.mjs';
import { ModelError } from '../core/errors.mjs';

export class DeterministicProvider extends ModelProvider {
  constructor(config = {}) {
    super({
      id: 'deterministic',
      label: 'Artisan design engine',
      model: 'artisan-heuristics-v1',
      capabilities: [CAPABILITY.CHAT, CAPABILITY.JSON, CAPABILITY.CODE],
    });
    this.enabled = config.enabled !== false;
  }

  get ready() {
    return this.enabled;
  }

  async health() {
    return { ok: this.enabled, provider: this.id, model: this.model, hint: 'Offline design engine — always available.' };
  }

  async generate({ meta, prompt }) {
    if (!this.enabled) throw new ModelError('deterministic provider disabled');
    const started = Date.now();
    const kind = meta?.kind ?? 'chat';
    const payload = meta?.payload ?? {};
    let text;

    switch (kind) {
      case 'understand': {
        const { reasonUnderstand } = await import('../reason/understand.mjs');
        text = JSON.stringify(reasonUnderstand(payload));
        break;
      }
      case 'plan': {
        const { reasonPlan } = await import('../reason/plan.mjs');
        text = JSON.stringify(reasonPlan(payload));
        break;
      }
      case 'direction': {
        const { reasonDirections } = await import('../reason/directions.mjs');
        text = JSON.stringify(reasonDirections(payload));
        break;
      }
      case 'compose': {
        const { reasonCompose } = await import('../reason/compose.mjs');
        text = JSON.stringify(reasonCompose(payload));
        break;
      }
      case 'critique': {
        const { reasonCritique } = await import('../reason/critique.mjs');
        text = JSON.stringify(reasonCritique(payload));
        break;
      }
      case 'repair': {
        const { reasonRepair } = await import('../reason/repair.mjs');
        text = JSON.stringify(reasonRepair(payload));
        break;
      }
      case 'code': {
        const { reasonCode } = await import('../reason/code.mjs');
        const result = await reasonCode(payload);
        text = typeof result === 'string' ? result : JSON.stringify(result);
        break;
      }
      default: {
        const { reasonGeneric } = await import('../reason/generic.mjs');
        text = JSON.stringify(reasonGeneric({ prompt, ...payload }));
      }
    }

    this.recordSuccess({ ms: Date.now() - started });
    return { text, provider: this.id, model: this.model, ms: Date.now() - started, heuristic: true };
  }
}