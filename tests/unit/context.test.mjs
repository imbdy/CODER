import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAgreedContext, extractContextHeuristically, mergeContextPatch, contextReadiness, renderAgreedContext, recordBuild, directivesFromContext } from '../../src/runtime/agreed-context.mjs';
import { isExplicitTrigger, decideExecution, matchMeta, isDiscussFirst } from '../../src/runtime/triggers.mjs';
import { parseConversationReply } from '../../src/runtime/conversation.mjs';
import { TodoManager } from '../../src/runtime/todo-manager.mjs';

describe('triggers: discussion vs execution', () => {
  it('recognises explicit execution commands', () => {
    for (const t of ['build it', 'Go build it.', 'Okay, go build it.', 'Do it.', 'implement it', "Let's build", 'go ahead', 'start working', 'finish it', 'ship it', 'make it', 'That sounds good. Build it.', 'yes go ahead']) assert.equal(isExplicitTrigger(t), true, t);
  });
  it('never executes on ideas, questions, agreement or bare acknowledgements', () => {
    for (const t of ['ok', 'yes', "Yeah, that's exactly what I want.", 'Maybe we could use a liquid 3D effect.', 'What if the hero had subtle 3D depth?', 'I want it cinematic', 'Make the hero more immersive.', "Let's discuss the hero first", "Don't build yet, what do you think about a serif?"]) {
      assert.equal(isExplicitTrigger(t), false, t);
      assert.equal(decideExecution({ text: t }).execute, false, `offline: ${t}`);
    }
    assert.equal(decideExecution({ text: 'Make the hero more immersive.', modelIntent: 'build' }).execute, false, 'model cannot force execution without an execution verb');
    assert.equal(decideExecution({ text: 'What if we build it with Three.js?', modelIntent: 'build' }).execute, false, 'discuss-first beats model intent');
    assert.equal(decideExecution({ text: 'Alright, implement the hero change now', modelIntent: 'build' }).execute, true);
    assert.equal(decideExecution({ text: 'Build a landing page for my coffee brand' }).execute, true, 'detailed imperative request offline');
  });
  it('classifies session meta', () => {
    assert.equal(matchMeta('hi'), 'greeting');
    assert.equal(matchMeta('what can you do?'), 'capabilities');
    assert.equal(matchMeta('which folder are you working in?'), 'workspace');
    assert.equal(matchMeta('Build a hero section'), null);
    assert.equal(isDiscussFirst("let's discuss it first"), true);
  });
});

describe('agreed context', () => {
  it('starts empty and refuses to build', () => {
    const c = createAgreedContext();
    assert.equal(contextReadiness(c).ready, false);
    assert.equal(contextReadiness(c).reason, 'empty-context');
  });
  it('accumulates the required e2e conversation deterministically', () => {
    let c = createAgreedContext();
    for (const t of ['I want a landing page for an AI developer tool.', 'I want it premium and cinematic.', 'But not the usual purple AI SaaS design.', 'Use subtle 3D depth and smooth motion.', 'I want typography to remain the main visual focus.', 'Okay, go build it.']) c = extractContextHeuristically(c, t);
    assert.equal(c.project, 'landing page for AI developer tool');
    assert.equal(c.product, 'AI developer tool');
    assert.deepEqual(c.visualDirection, ['cinematic', 'premium']);
    assert.ok(c.rejected.some((r) => /purple AI SaaS/i.test(r)));
    assert.ok(c.accepted.includes('typography as the main focus'));
    assert.match(c.depth3d, /3D depth/);
    assert.match(c.motion, /motion/);
    assert.ok(!c.accepted.some((a) => /build it/i.test(a)), 'triggers are not decisions');
    const r = contextReadiness(c);
    assert.equal(r.ready, true);
    assert.equal(r.mode, 'create');
    const block = renderAgreedContext(c);
    assert.match(block, /REJECTED \(must NOT do\): purple AI SaaS design/);
    assert.match(block, /Typography: typography is the primary visual element/);
    const d = directivesFromContext(c);
    assert.ok(d.avoid.includes('purple AI SaaS design') && d.emphasis.some((e) => /typography/.test(e)));
  });
  it('merges model patches, keeps rejections authoritative, tracks change requests after a build', () => {
    let c = mergeContextPatch(createAgreedContext(), { project: 'portfolio site', accepted: ['glass cards'], visualDirection: ['minimal'] });
    c = mergeContextPatch(c, { rejected: ['glass cards'] });
    assert.deepEqual(c.accepted, []);
    assert.deepEqual(c.rejected, ['glass cards']);
    c = recordBuild(c, { files: ['index.html'], summary: 'built', mode: 'create' });
    assert.equal(contextReadiness(c).ready, false);
    assert.equal(contextReadiness(c).reason, 'nothing-new');
    c = extractContextHeuristically(c, 'Make the hero more immersive.');
    assert.deepEqual(c.changeRequests, ['Make the hero more immersive.']);
    assert.equal(contextReadiness(c).mode, 'refine');
    c = recordBuild(c, { files: ['index.html'], summary: 'refined', mode: 'refine' });
    assert.deepEqual(c.changeRequests, []);
    assert.ok(c.accepted.some((a) => a.startsWith('applied: ')));
    assert.equal(c.build.builds, 2);
  });
});

describe('conversation reply parsing', () => {
  it('splits the human reply from the trailing control block', () => {
    const parsed = parseConversationReply('Sounds good — typography leads.\n```json\n{"intent":"discuss","ready":true,"context":{"typography":"serif display","rejected":["purple"]}}\n```');
    assert.equal(parsed.reply, 'Sounds good — typography leads.');
    assert.equal(parsed.intent, 'discuss');
    assert.equal(parsed.ready, true);
    assert.deepEqual(parsed.patch.rejected, ['purple']);
  });
  it('tolerates a missing control block', () => {
    const parsed = parseConversationReply('Just a plain answer.');
    assert.equal(parsed.reply, 'Just a plain answer.');
    assert.equal(parsed.intent, undefined);
  });
});

describe('structured TODOs', () => {
  it('validates model TODOs and adds runtime-required tasks', () => {
    const { manager, warnings } = TodoManager.fromModel([
      { id: 'I1', description: 'Structure', priority: 'high', files: ['index.html'], completionCondition: 'renders' },
      { id: 'I2', description: 'Type', dependencies: ['I1', 'nope'], skills: ['typography'] },
      { description: 'no id' },
      'garbage',
    ]);
    assert.equal(manager.list().length, 3);
    assert.ok(warnings.some((w) => /unknown dependencies nope/.test(w)));
    assert.equal(manager.get('I3').description, 'no id');
    const added = manager.ensureRequired({ complexity: 'complex', mode: 'create' });
    assert.deepEqual(added, ['R1', 'QA']);
    assert.throws(() => manager.complete('I2'), /dependency I1/);
    assert.deepEqual(manager.missingFiles('I1', () => false), ['index.html']);
    manager.complete('I1');
    manager.complete('I2');
    assert.match(manager.render(), /\[x\] I1 \(high\)/);
  });
});
