/**
 * The required end-to-end conversation: discuss → agree → "build it" → the
 * executor works (skills, spec, TODOs, implementation, REAL browser visual QA,
 * iteration, tests, completion) → follow-up refinement in the SAME session.
 *
 * Runs against a scripted OpenAI-compatible mock model (tests/helpers/mock-model.mjs)
 * so it is deterministic; the browser render is real when Chrome/Edge is installed.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMockModel } from '../helpers/mock-model.mjs';
import { loadConfig } from '../../src/core/config.mjs';
import { createInteractiveState, executeTurn } from '../../src/runtime/interactive.mjs';
import { browserAvailability } from '../../src/verify/browser.mjs';

const browser = browserAvailability({});
let mock;
let ws;
let config;

before(async () => {
  mock = await startMockModel();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), 'artisan-flow-'));
  config = loadConfig({ workspaceDir: ws, overrides: { models: { order: ['openaiCompatible'], openaiCompatible: { baseUrl: mock.baseUrl, apiKey: 'test', model: mock.model } } } });
});
after(async () => { await mock?.close(); try { fs.rmSync(ws, { recursive: true, force: true }); } catch {} });

describe('conversation flow (scripted live model)', { timeout: 240000 }, () => {
  it('"build it" with no context is refused and writes nothing', async () => {
    const state = createInteractiveState({ workspaceDir: ws, config });
    const res = await executeTurn('build it', state);
    assert.equal(res.kind, 'answer');
    assert.equal(res.refusal, true);
    assert.match(res.text, /haven't decided what we're building/i);
    assert.deepEqual(fs.readdirSync(ws), []);
  });

  it('greeting, capability question, design discussion, context accumulation', async () => {
    const state = createInteractiveState({ workspaceDir: ws, config });
    const hi = await executeTurn('hi', state);
    assert.equal(hi.kind, 'answer');
    assert.match(hi.text, /ready when you are/i);
    assert.ok(!/```/.test(hi.text), 'control JSON must never leak to the user');
    const cap = await executeTurn('What can you do?', state);
    assert.equal(cap.kind, 'answer');
    assert.match(cap.text, /render|critique|iterate/i);
    for (const line of ['I want a landing page for an AI developer tool.', 'I want it premium and cinematic.', 'But not the usual purple AI SaaS design.', 'Use subtle 3D depth and smooth motion.']) {
      const r = await executeTurn(line, state);
      assert.equal(r.kind, 'answer', line);
      assert.notEqual(r.intent, 'build');
    }
    assert.deepEqual(fs.readdirSync(ws), [], 'discussion must not touch files');
    const last = await executeTurn('I want typography to remain the main visual focus.', state);
    assert.equal(last.kind, 'answer');
    assert.equal(last.ready, true);
    const a = state.agreed;
    assert.match(a.project, /landing page/i);
    assert.match(a.product, /AI developer tool/i);
    assert.ok(a.visualDirection.includes('premium') && a.visualDirection.includes('cinematic'));
    assert.ok(a.rejected.some((r) => /purple/i.test(r)), 'rejection preserved');
    assert.ok(a.accepted.some((r) => /typography/i.test(r)), 'acceptance preserved');
    assert.match(a.typography, /typography is the primary/i);
    assert.match(a.depth3d, /depth/i);
    assert.match(a.motion, /motion/i);
    globalThis.__flowState = state;
  });

  it('"Okay, go build it." executes the agreed design through the full workflow', async () => {
    const state = globalThis.__flowState;
    const progress = [];
    const res = await executeTurn('Okay, go build it.', state, { onProgress: (p) => progress.push(p) });
    assert.equal(res.kind, 'task', JSON.stringify(res).slice(0, 400));
    const run = res.run;
    assert.equal(run.engine, 'agent');
    assert.equal(run.mode, 'create');
    // context flowed into the build
    assert.ok(run.agreedSnapshot.rejected.some((r) => /purple/i.test(r)));
    assert.ok(run.agreedSnapshot.accepted.some((r) => /typography/i.test(r)));
    // skills: discovered, model-selected, loaded, required enforced
    assert.equal(run.skills.method, 'model');
    assert.equal(run.report.skills.catalogueSize, 46);
    for (const id of ['typography', 'visual-design', 'anti-slop']) assert.ok(run.skills.loaded.includes(id), `skill ${id} loaded`);
    assert.ok(!run.skills.loaded.includes('threejs'), 'no 3D skill for a CSS-depth design');
    // structured TODOs from the model + runtime-required QA
    assert.equal(run.plan.source, 'model');
    assert.ok(run.todos.length >= 6);
    for (const t of run.todos) { assert.ok(t.id && t.description && t.priority && Array.isArray(t.dependencies) && typeof t.completionCondition === 'string'); }
    assert.ok(run.todos.some((t) => t.id === 'QA'), 'runtime adds the visual QA task');
    assert.ok(run.todos.every((t) => t.status === 'completed'), `all todos completed: ${run.todos.map((t) => `${t.id}:${t.status}`).join(',')}`);
    // spec carries the actual decisions
    assert.equal(run.spec.source, 'model');
    assert.ok(run.spec.design.avoid.some((r) => /purple/i.test(r)));
    assert.match(run.spec.design.typography, /typography is the primary/i);
    assert.equal(run.spec.tech.depth, 'css');
    // implementation prompt received the decisions (what the model was actually sent)
    const impl = mock.record.prompts.find((p) => /IMPLEMENTATION phase/.test(p.full.system));
    assert.ok(impl, 'implementation prompt was sent');
    assert.match(impl.full.system, /REJECTED \(must NOT do\): .*purple/i);
    assert.match(impl.full.system, /hero_concept: typography-led/i);
    assert.match(impl.full.system, /LOADED SKILLS \(.*typography/i);
    assert.match(impl.full.system, /TODOS \(structured/);
    const plan = mock.record.prompts.find((p) => /^DESIGN SPEC \+ PLAN/.test(p.full.user));
    assert.match(plan.full.user, /AI developer tool/);
    assert.match(plan.full.user, /REJECTED \(must NOT do\)/);
    // files written through the proper workflow
    const files = run.writes.map((w) => w.rel);
    for (const f of ['index.html', 'styles/main.css', 'scripts/main.js']) assert.ok(files.includes(f), `wrote ${f}`);
    assert.ok(fs.existsSync(path.join(ws, 'index.html')));
    // visual QA + iteration + testing + completion
    assert.ok(run.visualQa.rounds >= 1, 'visual QA ran');
    if (browser.available) {
      assert.equal(run.visualQa.rendered, true, 'visual QA rendered with a real browser');
      assert.equal(run.visualQa.rounds, 2, 'weak round triggered one iteration');
      const round1 = run.report.qa.history[0];
      assert.equal(round1.verdict, 'iterate');
      const r1 = res.run.report.qa;
      assert.ok(r1.history[1].verdict === 'pass', `round 2 passes: ${JSON.stringify(r1.history)}`);
      assert.ok(fs.existsSync(run.visualQa.screenshots[0]), 'screenshot exists');
      assert.ok(mock.record.prompts.some((p) => /^VISUAL QA CRITIQUE/.test(p.full.user) && /HORIZONTAL OVERFLOW/.test(p.full.user)), 'critique saw the measured overflow');
      assert.ok(!fs.readFileSync(path.join(ws, 'styles/main.css'), 'utf8').includes('width: 600px'), 'iteration fixed the overflow');
      assert.ok(progress.some((p) => p.type === 'iterate'), 'iteration reported');
    } else {
      assert.equal(run.visualQa.rendered, false);
      assert.match(run.visualQa.reason ?? '', /browser|Node 22/i);
    }
    assert.equal(run.testing.ok, true, `tests: ${JSON.stringify(run.testing)}`);
    assert.equal(run.status, 'done');
    assert.equal(run.state.current, 'COMPLETED');
    for (const phase of ['skills', 'plan', 'implementation', 'visual-qa', 'testing']) assert.ok(progress.some((p) => p.type === 'phase' && p.text.startsWith(phase)), `phase ${phase} reported`);
    assert.match(res.summary, /^Done — built via openai-compatible/);
    assert.match(res.summary, /Skills loaded \(model\)/);
    // session state after the build
    assert.ok(state.agreed.build, 'build recorded in the agreed context');
    assert.deepEqual(state.agreed.changeRequests, []);
    assert.ok(state.skillsUsed.includes('typography'));
    assert.ok(state.todoItems.length >= 6);
  });

  it('follow-up: "Make the hero more immersive." is discussed, not executed', async () => {
    const state = globalThis.__flowState;
    const before = fs.statSync(path.join(ws, 'index.html')).mtimeMs;
    const res = await executeTurn('Make the hero more immersive.', state);
    assert.equal(res.kind, 'answer');
    assert.match(res.text, /say "do it"/i);
    assert.ok(state.agreed.changeRequests.some((c) => /immersive/i.test(c)), 'change request recorded');
    assert.equal(fs.statSync(path.join(ws, 'index.html')).mtimeMs, before, 'no file touched during discussion');
  });

  it('follow-up: "Do it." refines the existing implementation in place', async () => {
    const state = globalThis.__flowState;
    const jsBefore = fs.readFileSync(path.join(ws, 'scripts/main.js'), 'utf8');
    const res = await executeTurn('Do it.', state);
    assert.equal(res.kind, 'task', JSON.stringify(res).slice(0, 300));
    const run = res.run;
    assert.equal(run.mode, 'refine');
    assert.equal(run.engine, 'agent');
    const written = run.writes.map((w) => `${w.rel}:${w.mode}`);
    assert.ok(written.includes('index.html:update'), `edited index.html: ${written}`);
    assert.ok(!written.some((w) => w.endsWith(':create')), 'nothing recreated');
    assert.equal(fs.readFileSync(path.join(ws, 'scripts/main.js'), 'utf8'), jsBefore, 'untouched files preserved');
    assert.ok(fs.readFileSync(path.join(ws, 'index.html'), 'utf8').includes('layer--c'), 'targeted change applied');
    const impl = mock.record.prompts.filter((p) => /IMPLEMENTATION phase/.test(p.full.system)).at(-1);
    assert.match(impl.full.system, /REFINEMENT of an existing build/);
    assert.match(impl.full.system, /EXISTING FILES: /);
    assert.match(impl.full.system, /REJECTED \(must NOT do\): .*purple/i, 'earlier decisions still flow into refinements');
    assert.equal(run.status, 'done');
    assert.deepEqual(state.agreed.changeRequests, [], 'applied change requests are folded in');
    assert.ok(state.agreed.accepted.some((a) => /applied: make the hero more immersive/i.test(a)));
    assert.ok(state.agreed.rejected.some((r) => /purple/i.test(r)), 'decisions never forgotten');
  });

  it('"do it" with nothing new is refused instead of rebuilding', async () => {
    const state = globalThis.__flowState;
    const res = await executeTurn('do it', state);
    assert.equal(res.kind, 'answer');
    assert.equal(res.refusal, true);
    assert.match(res.text, /already reflects everything/i);
  });
});
