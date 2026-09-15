/** Leveled logger with optional JSON-lines sink and pluggable sinks (terminal renderer, run log). */

import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from './util.mjs';

export const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };

export class Logger {
  constructor({ level = 'info', sinks = [], scope = 'artisan' } = {}) {
    this.level = LEVELS[level] ?? LEVELS.info;
    this.sinks = sinks;
    this.scope = scope;
  }

  child(scope) {
    return new Logger({ level: Object.keys(LEVELS).find((k) => LEVELS[k] === this.level) ?? 'info', sinks: this.sinks, scope: `${this.scope}:${scope}` });
  }

  addSink(sink) {
    this.sinks.push(sink);
    return this;
  }

  log(level, message, data = undefined) {
    if ((LEVELS[level] ?? LEVELS.info) > this.level) return;
    const record = { at: nowIso(), level, scope: this.scope, message, data };
    for (const sink of this.sinks) {
      try {
        sink(record);
      } catch {
        /* sinks are best effort */
      }
    }
  }

  error(message, data) { this.log('error', message, data); }
  warn(message, data) { this.log('warn', message, data); }
  info(message, data) { this.log('info', message, data); }
  debug(message, data) { this.log('debug', message, data); }
  trace(message, data) { this.log('trace', message, data); }

  step(message) {
    this.info(message);
  }
}

/** Sink that appends JSON lines to a file; used for `.forge/runs/<id>/events.jsonl`. */
export function createFileSink(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const stream = fs.createWriteStream(filePath, { flags: 'a' });
  return (record) => {
    stream.write(`${JSON.stringify(record)}\n`);
  };
}

/** Sink that collects records in memory (useful for tests and report generation). */
export function createMemorySink(store = []) {
  store.records = store.records ?? [];
  const sink = (record) => store.records.push(record);
  sink.records = store.records;
  return sink;
}

export function createLogger(options) {
  return new Logger(options);
}

export const silentLogger = new Logger({ level: 'silent' });
