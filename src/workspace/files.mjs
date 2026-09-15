/** Filesystem walking + classification helpers used by the workspace inspector. */

import fs from 'node:fs';
import path from 'node:path';
import { toPosix } from '../core/util.mjs';

export const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro',
  '.css', '.scss', '.sass', '.less', '.html', '.htm', '.json', '.md', '.mdx',
  '.svg', '.yml', '.yaml', '.toml', '.env', '.txt',
]);

export const COMPONENT_EXTENSIONS = new Set(['.tsx', '.jsx', '.vue', '.svelte', '.astro']);

export const STYLE_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);

export function makeIgnoreMatcher(ignore = []) {
  const exact = new Set();
  const patterns = [];
  for (const entry of ignore) {
    const raw = String(entry).trim();
    if (!raw) continue;
    if (raw.includes('*')) patterns.push(new RegExp(`^${raw.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i'));
    else exact.add(raw.toLowerCase());
  }
  return (relPath, name, isDir) => {
    if (isDir && (name.startsWith('.') && name !== '.forge' && !['.storybook'].includes(name))) return true;
    if (exact.has(name.toLowerCase())) return true;
    const posix = toPosix(relPath).toLowerCase();
    for (const pattern of patterns) if (pattern.test(posix) || pattern.test(name.toLowerCase())) return true;
    if (posix.startsWith('.forge/runs')) return true;
    return false;
  };
}

/**
 * Walk a workspace directory.
 * @returns {{files: Array<{path: string, rel: string, ext: string, size: number, mtimeMs: number}>, truncated: boolean}}
 */
export function walk(dir, { ignore = [], maxFiles = 4000, maxDepth = 12 } = {}) {
  const isIgnored = makeIgnoreMatcher(ignore);
  const files = [];
  let truncated = false;

  const visit = (current, depth) => {
    if (depth > maxDepth || truncated) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full);
      if (isIgnored(rel, entry.name, entry.isDirectory())) continue;
      if (entry.isDirectory()) {
        visit(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= maxFiles) {
        truncated = true;
        return;
      }
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      files.push({
        path: full,
        rel: toPosix(rel),
        ext: path.extname(entry.name).toLowerCase(),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    }
  };

  visit(dir, 0);
  files.sort((a, b) => a.rel.localeCompare(b.rel));
  return { files, truncated };
}

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

export function readText(file, maxBytes = 400000) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > maxBytes * 4) return fs.readFileSync(file, 'utf8').slice(0, maxBytes);
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

export function exists(file) {
  return fs.existsSync(file);
}

export function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

export function countLines(text) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

/** Component name from a file path: `src/components/HeroSection.tsx` -> `HeroSection`. */
export function componentNameFromPath(rel) {
  const base = path.basename(rel, path.extname(rel));
  if (base === 'index') return path.basename(path.dirname(rel));
  return base;
}

export function findFirst(files, candidates) {
  for (const candidate of candidates) {
    const hit = files.find((file) => file.rel.toLowerCase() === candidate.toLowerCase());
    if (hit) return hit;
  }
  return undefined;
}

export function findAny(files, predicate) {
  return files.filter(predicate);
}

export function packageScripts(pkg) {
  return pkg?.scripts ?? {};
}

export function allDependencies(pkg) {
  return {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
    ...(pkg?.peerDependencies ?? {}),
  };
}