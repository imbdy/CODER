/** Event bus used to stream agent activity to the terminal, run logs and tests. */

import { nowIso } from './util.mjs';

export const EVENT = {
  RUN_START: 'run.start',
  RUN_END: 'run.end',
  PHASE: 'phase',
  THOUGHT: 'thought',
  DECISION: 'decision',
  SKILLS: 'skills.retrieved',
  PLAN: 'plan.created',
  STEP_START: 'step.start',
  STEP_END: 'step.end',
  TOOL_CALL: 'tool.call',
  TOOL_RESULT: 'tool.result',
  FILE_WRITE: 'file.write',
  MODEL_CALL: 'model.call',
  VERIFY: 'verify.result',
  CRITIQUE: 'critique.result',
  IMPROVE: 'improve.iteration',
  WARN: 'warn',
  ERROR: 'error',
  LOG: 'log',
};

export class EventBus {
  constructor({ historyLimit = 5000 } = {}) {
    this.listeners = new Set();
    this.history = [];
    this.historyLimit = historyLimit;
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Subscribe to a single event type. */
  onType(type, listener) {
    return this.on((event) => {
      if (event.type === type) listener(event);
    });
  }

  emit(type, payload = {}) {
    const event = { type, at: nowIso(), ...payload };
    this.history.push(event);
    if (this.history.length > this.historyLimit) this.history.shift();
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* a broken listener must never break the run */
      }
    }
    return event;
  }

  eventsOfType(type) {
    return this.history.filter((event) => event.type === type);
  }

  count(type) {
    return this.eventsOfType(type).length;
  }
}