/**
 * End-to-end harness: real runs against a scratch workspace.
 * Usage: node ./scripts/e2e.mjs [--keep]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/runtime/facade.mjs';

const keep = process.argv.includes('--keep');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'artisan-e2e-'));
const quiet = true;

const TASKS = [
  { request: 'Build me a simple red button', expect: { taskType: 'create-component', writes: true } },
  { request: 'Build me a premium login screen', expect: { taskType: 'create-page', writes: true } },
  { request: 'Make the login screen feel more premium', expect: { taskType: 'enhance' } },
  { request: 'Add subtle motion', expect: { taskType: 'motion' } },
  { request: 'Add floating 3D depth', expect: { taskType: '3d' } },
  { request: 'Make the whole thing responsive', expect: { taskType: 'responsive' } },
  { request: 'Redesign this hero completely while preserving the existing brand', expect: { taskType: 'redesign' } },
];

let failures = 0;
const { loadConfig } = await import('../src/core/config.mjs');
const config = loadConfig({ workspaceDir: workspace, overrides: { models: { order: ['deterministic'] } } }); // regression harness stays offline-fast
const { session, events } = createSession({ workspaceDir: workspace, config, verbose: false });
if (!quiet) {
  const { createRenderer } = await import('../src/terminal/render.mjs');
  createRenderer({ bus: events, color: process.stdout.isTTY });
}

console.log(`e2e workspace: ${workspace}\n`);
for (const task of TASKS) {
  const outcome = await session.run(task.request, { noMemory: false });
  const run = outcome.run ?? outcome; // facade spreads run fields at top level
  const ok = [];
  if (outcome.error) ok.push(`errored: ${outcome.error}`);
  if (run.status === 'failed') ok.push(`run failed: ${run.error}`);
  if (run.understanding?.taskType !== task.expect.taskType) ok.push(`taskType ${run.understanding?.taskType} != ${task.expect.taskType}`);
  if (task.expect.writes && !(run.writes?.length)) ok.push('no files written');
  if (run.verification && !run.verification.ok) ok.push(`verification failed: ${run.verification.summary}`);
  const status = ok.length ? 'FAIL' : 'PASS';
  if (ok.length) failures += 1;
  console.log(`${status}  "${task.request}"  ->  ${run.understanding?.taskType ?? '?'} | writes: ${(run.writes ?? []).map((w) => w.rel).join(', ') || 'none'} | verify: ${run.verification?.ok ? 'ok' : run.verification?.summary} | score: ${run.critique?.overall ?? 'n/a'}${ok.length ? `\n      ${ok.join('\n      ')}` : ''}`);
}

const finalHtmlPath = path.join(workspace, 'index.html');
if (fs.existsSync(finalHtmlPath)) {
  const html = fs.readFileSync(finalHtmlPath, 'utf8');
  fs.writeFileSync(path.join(os.tmpdir(), 'artisan-e2e-last.html'), html);
  console.log(`\nfinal artifact: ${finalHtmlPath} (${(html.length / 1024).toFixed(1)} KB) — copy in %TEMP%\\artisan-e2e-last.html`);
}

if (!keep) fs.rmSync(workspace, { recursive: true, force: true });
console.log(failures ? `\nE2E RESULT: ${failures} failure(s)` : '\nE2E RESULT: all tasks passed');
process.exit(failures ? 1 : 0);
