/**
 * Workspace memory — Artisan remembers what it decided about a project so later
 * runs preserve the established design language instead of re-inventing it.
 * Stored at `<workspace>/.forge/memory.json`.
 */

import fs from 'node:fs';
import path from 'node:path';

const EMPTY = {
  version: 1,
  createdAt: undefined,
  updatedAt: undefined,
  runs: [],
  designLanguage: undefined,
  decisions: [],
  registry: { created: [], modified: [] },
  history: [],
};

export function memoryPath(workspaceDir, config) {
  const rel = config?.workspace?.memoryFile ?? '.forge/memory.json';
  return path.join(workspaceDir, rel);
}

export function readMemory(workspaceDir, config) {
  const file = memoryPath(workspaceDir, config);
  try {
    if (!fs.existsSync(file)) return { ...EMPTY };
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

export function writeMemory(workspaceDir, config, memory) {
  const file = memoryPath(workspaceDir, config);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = { ...EMPTY, ...memory };
  if (!payload.createdAt) payload.createdAt = new Date().toISOString();
  payload.updatedAt = new Date().toISOString();
  payload.runs = (payload.runs ?? []).slice(-25);
  payload.decisions = (payload.decisions ?? []).slice(-80);
  payload.history = (payload.history ?? []).slice(-50);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

/**
 * Merge a completed run into memory: records the design language, the decisions
 * that were taken and the files that were touched.
 */
export function recordRun(workspaceDir, config, run) {
  const memory = readMemory(workspaceDir, config);
  const entry = {
    id: run.id,
    request: run.request,
    taskType: run.understanding?.taskType,
    at: new Date().toISOString(),
    status: run.status,
    score: run.critique?.overall,
    skills: run.skills?.ids ?? [],
    files: (run.writes ?? []).map((write) => write.rel),
    direction: run.direction?.name,
  };
  memory.runs = [...(memory.runs ?? []).filter((item) => item.id !== run.id), entry];
  if (run.direction || run.tokens) {
    memory.designLanguage = {
      ...(memory.designLanguage ?? {}),
      direction: run.direction?.name ?? memory.designLanguage?.direction,
      tokens: run.tokens ?? memory.designLanguage?.tokens,
      updatedAt: new Date().toISOString(),
    };
  }
  memory.decisions = [...(memory.decisions ?? []), ...(run.decisions ?? []).map((decision) => ({ ...decision, runId: run.id }))];
  const created = new Set(memory.registry?.created ?? []);
  const modified = new Set(memory.registry?.modified ?? []);
  for (const write of run.writes ?? []) {
    if (write.mode === 'create') created.add(write.rel);
    else modified.add(write.rel);
  }
  memory.registry = { created: [...created], modified: [...modified] };
  memory.history = [...(memory.history ?? []), { id: run.id, request: run.request, at: entry.at, status: run.status, score: entry.score }];
  writeMemory(workspaceDir, config, memory);
  return memory;
}

/** Short prompt-ready digest of what Artisan already knows about this project. */
export function memoryDigest(memory, { maxRuns = 5 } = {}) {
  const lines = [];
  if (!memory) return '';
  if (memory.designLanguage?.direction) lines.push(`Established design direction: ${memory.designLanguage.direction}`);
  if (memory.designLanguage?.tokens) {
    const tokens = memory.designLanguage.tokens;
    lines.push(`Established tokens: accent ${tokens.accent ?? 'n/a'}, radius ${tokens.radius ?? 'n/a'}, font ${tokens.fontFamily ?? 'n/a'}`);
  }
  const recent = (memory.history ?? []).slice(-maxRuns);
  if (recent.length) {
    lines.push('Recent work:');
    for (const item of recent) lines.push(`- [${item.status}] ${item.request}${item.score ? ` (score ${item.score})` : ''}`);
  }
  const protectedFiles = memory.registry?.modified ?? [];
  if (protectedFiles.length) lines.push(`Files previously touched by Artisan: ${protectedFiles.slice(-8).join(', ')}`);
  return lines.join('\n');
}