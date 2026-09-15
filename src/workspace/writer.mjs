/**
 * Safe file writing: path jail, dry-run, backups, unified diffs, patch application
 * (search/replace and full rewrites) with precise failure reasons so the runtime can
 * ask for a targeted repair instead of guessing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { toPosix } from '../core/util.mjs';
import { ToolError, WorkspaceError } from '../core/errors.mjs';

/** Resolve a workspace-relative path and refuse anything that escapes the root. */
export function resolveInWorkspace(root, rel) {
  const cleaned = String(rel ?? '').replace(/^[a-zA-Z]:/, '').replace(/^[/\\]+/, '');
  const full = path.resolve(root, cleaned);
  const relative = path.relative(path.resolve(root), full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new WorkspaceError(`path escapes workspace: ${rel}`, { details: { root, rel } });
  }
  return full;
}

export function readWorkspaceFile(root, rel) {
  const full = resolveInWorkspace(root, rel);
  if (!fs.existsSync(full)) return undefined;
  return fs.readFileSync(full, 'utf8');
}

export function writeWorkspaceFile(root, rel, content, { dryRun = false, backup = true } = {}) {
  const full = resolveInWorkspace(root, rel);
  const existed = fs.existsSync(full);
  const previous = existed ? fs.readFileSync(full, 'utf8') : undefined;
  const cleanRel = toPosix(path.relative(root, full));

  if (previous === content) {
    return { rel: cleanRel, mode: 'unchanged', bytes: content.length, diff: [] };
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (existed && backup) {
      const backupDir = path.join(root, '.forge', 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(path.join(backupDir, `${cleanRel.replace(/[\\/]/g, '__')}.bak`), previous ?? '');
    }
    const temp = `${full}.artisan-tmp`;
    fs.writeFileSync(temp, content);
    fs.renameSync(temp, full);
  }
  return {
    rel: cleanRel,
    mode: existed ? 'update' : 'create',
    bytes: content.length,
    lines: content.split(/\r?\n/).length,
    diff: previous === undefined ? [] : buildDiff(previous, content, cleanRel),
  };
}

/**
 * Minimal unified diff (line based, 3 lines of context). Enough for terminal
 * display and run reports without pulling in a diff library.
 */
export function buildDiff(before, after, label = '', context = 3) {
  const a = String(before ?? '').split(/\r?\n/);
  const b = String(after ?? '').split(/\r?\n/);
  if (a.length * b.length > 4_000_000) {
    return [{ type: 'meta', text: `${label}: file too large to diff (${a.length} -> ${b.length} lines)` }];
  }

  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'same', text: a[i], aLine: i + 1, bLine: j + 1 });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ type: 'removed', text: a[i], aLine: i + 1 });
      i += 1;
    } else {
      ops.push({ type: 'added', text: b[j], bLine: j + 1 });
      j += 1;
    }
  }
  while (i < n) { ops.push({ type: 'removed', text: a[i], aLine: i + 1 }); i += 1; }
  while (j < m) { ops.push({ type: 'added', text: b[j], bLine: j + 1 }); j += 1; }

  // Keep only changed regions with context.
  const keep = new Array(ops.length).fill(false);
  ops.forEach((op, index) => {
    if (op.type === 'same') return;
    for (let k = Math.max(0, index - context); k <= Math.min(ops.length - 1, index + context); k += 1) keep[k] = true;
  });

  const out = [];
  let lastKept = -1;
  ops.forEach((op, index) => {
    if (!keep[index]) return;
    if (lastKept !== -1 && index - lastKept > 1) out.push({ type: 'meta', text: '@@ ...' });
    out.push(op);
    lastKept = index;
  });
  return out;
}

export function renderDiff(diff, { color = false, maxLines = 200 } = {}) {
  const paint = (code, text) => (color ? `\u001b[${code}m${text}\u001b[0m` : text);
  const lines = [];
  for (const entry of diff.slice(0, maxLines)) {
    if (entry.type === 'added') lines.push(paint('32', `+ ${entry.text}`));
    else if (entry.type === 'removed') lines.push(paint('31', `- ${entry.text}`));
    else if (entry.type === 'meta') lines.push(paint('36', entry.text));
    else lines.push(`  ${entry.text}`);
  }
  if (diff.length > maxLines) lines.push(paint('90', `... ${diff.length - maxLines} more diff lines`));
  return lines.join('\n');
}

/**
 * Apply a patch expressed as search/replace blocks. Used when a model edits part of
 * a file: far more reliable than asking for a full rewrite of a large file.
 */
export function applySearchReplace(original, blocks, { requireAll = true } = {}) {
  let text = String(original ?? '');
  const applied = [];
  const failed = [];

  for (const block of blocks ?? []) {
    const search = String(block.search ?? '');
    const replace = String(block.replace ?? '');
    if (!search) {
      failed.push({ reason: 'empty search', search: '' });
      continue;
    }
    const occurrences = countOccurrences(text, search);
    if (occurrences === 0) {
      const fuzzy = fuzzyLocate(text, search);
      if (!fuzzy) {
        failed.push({ reason: 'search text not found', search: search.slice(0, 160) });
        continue;
      }
      text = `${text.slice(0, fuzzy.start)}${replace}${text.slice(fuzzy.end)}`;
      applied.push({ fuzzy: true });
      continue;
    }
    if (occurrences > 1) {
      failed.push({ reason: `search text is ambiguous (${occurrences} matches)`, search: search.slice(0, 160) });
      continue;
    }
    text = text.replace(search, replace);
    applied.push({ fuzzy: false });
  }

  if (requireAll && failed.length) {
    throw new ToolError(`patch failed: ${failed.map((entry) => entry.reason).join('; ')}`, { details: { failed } });
  }
  return { text, applied, failed };
}

function countOccurrences(text, needle) {
  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Whitespace/line-ending tolerant locate for near-miss search blocks. */
function fuzzyLocate(text, search) {
  const sourceLines = text.split(/\r?\n/);
  const searchLines = String(search)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/^\n+|\n+$/g, '')
    .split('\n');
  if (!searchLines.length) return undefined;

  for (let i = 0; i <= sourceLines.length - searchLines.length; i += 1) {
    let matched = true;
    for (let j = 0; j < searchLines.length; j += 1) {
      if (sourceLines[i + j].trim() !== searchLines[j].trim()) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    const before = sourceLines.slice(0, i);
    const start = before.join('\n').length + (i > 0 ? 1 : 0);
    const end = sourceLines.slice(0, i + searchLines.length).join('\n').length;
    return { start, end };
  }
  return undefined;
}

export function listWorkspaceFiles(root, { ignore = [], max = 500 } = {}) {
  const out = [];
  const visit = (dir) => {
    if (out.length >= max) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ignore.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else out.push(toPosix(path.relative(root, full)));
    }
  };
  visit(root);
  return out;
}

/** Copy a file inside the workspace (used when scaffolding from templates). */
export function copyWorkspaceFile(root, fromRel, toRel, { dryRun = false } = {}) {
  const from = resolveInWorkspace(root, fromRel);
  const to = resolveInWorkspace(root, toRel);
  if (!fs.existsSync(from)) throw new WorkspaceError(`source missing: ${fromRel}`);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  return { rel: toPosix(toRel), mode: 'copy' };
}
export function deleteWorkspaceFile(root, rel, { dryRun = false } = {}) {
  const full = resolveInWorkspace(root, rel);
  if (!fs.existsSync(full)) return { rel: toPosix(rel), mode: 'missing' };
  if (!dryRun) fs.unlinkSync(full);
  return { rel: toPosix(rel), mode: 'delete' };
}