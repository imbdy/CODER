/**
 * Small dependency-free helpers shared across Artisan.
 * Everything here must stay side-effect free and Node-version agnostic (>=20).
 */

import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';

/** Stable, short, sortable-ish ids for runs/steps. */
export function makeId(prefix = 'id') {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

export function shortHash(input) {
  return createHash('sha1').update(String(input)).digest('hex').slice(0, 10);
}

export function nowIso() {
  return new Date().toISOString();
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Rough token estimate (4 chars ~= 1 token). Good enough for context budgeting. */
export function estimateTokens(text) {
  return Math.ceil(String(text ?? '').length / 4);
}

export function unique(list) {
  return Array.from(new Set(list));
}

export function uniqueBy(list, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function groupBy(list, keyFn) {
  const out = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

export function truncate(text, maxChars, suffix = '\n... [truncated]') {
  const str = String(text ?? '');
  if (str.length <= maxChars) return str;
  return str.slice(0, Math.max(0, maxChars - suffix.length)) + suffix;
}

export function slugify(input, fallback = 'item') {
  const slug = String(input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

export function toPosix(p) {
  return String(p).split(path.sep).join('/');
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge(base, patch) {
  if (!isPlainObject(base)) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      out[key] = deepMerge(base[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export function getPath(obj, dottedPath, fallback = undefined) {
  const parts = String(dottedPath).split('.');
  let cursor = obj;
  for (const part of parts) {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') return fallback;
    cursor = cursor[part];
  }
  return cursor === undefined ? fallback : cursor;
}

export function setPath(obj, dottedPath, value) {
  const parts = String(dottedPath).split('.');
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!isPlainObject(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
  return obj;
}

/** Case-insensitive "does any needle appear in haystack" test. */
export function containsAny(haystack, needles) {
  const text = String(haystack ?? '').toLowerCase();
  return needles.some((needle) => text.includes(String(needle).toLowerCase()));
}

export function countMatches(text, pattern) {
  const matches = String(text ?? '').match(pattern);
  return matches ? matches.length : 0;
}

export function sum(list, fn = (x) => x) {
  return list.reduce((acc, item) => acc + fn(item), 0);
}

export function average(list, fn = (x) => x) {
  return list.length ? sum(list, fn) / list.length : 0;
}

/** Weighted, deterministic pick (used by the design engine for direction selection). */
export function weightedPick(entries, seed = 0) {
  const total = sum(entries, (entry) => entry.weight);
  if (total <= 0) return entries[0]?.value;
  let target = ((seed % 1000) / 1000) * total;
  for (const entry of entries) {
    target -= entry.weight;
    if (target <= 0) return entry.value;
  }
  return entries[entries.length - 1]?.value;
}

/** Deterministic pseudo random generator (mulberry32) — keeps runs reproducible. */
export function createRandom(seedInput = 1) {
  let a = typeof seedInput === 'string' ? parseInt(shortHash(seedInput), 16) : Math.floor(seedInput) || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(list, random = Math.random) {
  if (!list.length) return undefined;
  return list[Math.floor(random() * list.length) % list.length];
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

export function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseList(value) {
  return toArray(value)
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}
