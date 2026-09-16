/**
 * Artisan design-agent test — ONE end-to-end run against the real brain
 * (qwen2.5-coder:7b via Ollama) with every artifact written to a fresh folder:
 *
 *   agent-test-results/<stamp>/
 *     site/            the files the agent actually built
 *     sys-prompt.txt   the exact system prompt the agent received
 *     transcript.md    the agent's thinking + every tool call + result
 *     run.json         the raw run result (machine readable)
 *     REPORT.md        human readable verdict: sys_prompt / tools / skills / thinking
 *
 * Run: node --test tests/agent/design-agent.test.mjs   (or: npm run test:agent)
 * If no live model is reachable the test skips and still writes REPORT.md.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../../src/core/config.mjs';
import { EventBus } from '../../src/core/events.mjs';
import { createRouter } from '../../src/model/router.mjs';
import { createSkillRegistry } from '../../src/skills/registry.mjs';
import { runAgent } from '../../src/agent/agent.mjs';
import { buildAgentSystemPrompt } from '../../src/agent/prompts.mjs';
import { inspectWorkspace } from '../../src/workspace/scanner.mjs';
import { checkStructure } from '../../src/runtime/agent-build.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const RESULTS_DIR = path.join(ROOT, 'agent-test-results', STAMP);
const SITE_DIR = path.join(RESULTS_DIR, 'site');

const REQUEST = [
  'Build a small landing page for a coffee subscription brand called "Ember & Oak".',
  'Dark, editorial, premium. Sections: hero with the brand name and one CTA, three features, and a footer.',
  'Ship index.html + styles/main.css + scripts/main.js — separate files, not inline.',
].join(' ');

function writeArtifacts({ status, message, systemPrompt, run, events }) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  if (systemPrompt) fs.writeFileSync(path.join(RESULTS_DIR, 'sys-prompt.txt'), systemPrompt, 'utf8');
  if (run) fs.writeFileSync(path.join(RESULTS_DIR, 'run.json'), JSON.stringify(run, null, 2), 'utf8');

  const transcript = [];
  if (run?.transcript) {
    for (const entry of run.transcript) {
      if (entry.role === 'assistant') {
        transcript.push(`### step ${entry.step} — assistant\n\n**think:** ${entry.think || '(none)'}\n\n<details><summary>raw output</summary>\n\n\`\`\`\n${String(entry.text ?? '').slice(0, 6000)}\n\`\`\`\n\n</details>`);
      } else if (entry.role === 'tool') {
        transcript.push(`- **tool** \`${entry.tool}\` ${JSON.stringify(entry.args)} → ${JSON.stringify(entry.result)}`);
      } else {
        transcript.push(`- _${entry.role}_: ${entry.text}`);
      }
    }
  }
  fs.writeFileSync(path.join(RESULTS_DIR, 'transcript.md'), transcript.join('\n\n') || '(no transcript)', 'utf8');

  const tools = {};
  for (const action of run?.actions ?? []) tools[action.tool] = (tools[action.tool] ?? 0) + 1;
  const skillEvents = (events ?? []).filter((event) => event.type === 'skills.retrieved');
  const lines = [
    `# Agent build report — ${STAMP}`,
    '',
    `**status:** ${status}`,
    message ? `**note:** ${message}` : '',
    '',
    '## Request',
    '',
    REQUEST,
    '',
    '## Verdict (the four things under review)',
    '',
    '| Area | Evidence |',
    '|---|---|',
    `| sys_prompt | ${systemPrompt ? `${systemPrompt.length} chars written to \`sys-prompt.txt\`` : 'n/a'} |`,
    `| agent calling tools | ${Object.entries(tools).map(([name, count]) => `${name}×${count}`).join(', ') || 'no tool calls'} |`,
    `| agent using skills | injected into the prompt: ${(run?.skills?.ids ?? []).join(', ') || 'none'} — read on demand via readSkill: ${(run?.skillsRead ?? []).join(', ') || 'none'} |`,
    `| agent logic thinking | ${(run?.transcript ?? []).filter((entry) => entry.role === 'assistant' && entry.think).length} reasoning steps |`,
    `| model | ${run?.provider ?? 'n/a'} / ${run?.model ?? 'n/a'} — ${run?.stepCount ?? 0} tool calls in ${run?.ms ?? 0} ms |`,
    '',
    '## Files written',
    '',
    ...(run?.writes ?? []).map((write) => `- \`${write.rel}\` — ${write.bytes} bytes (${write.mode})`),
    (run?.writes ?? []).length ? '' : '- _none_',
    '',
    '## Structure check',
    '',
    run?.structure ? `${run.structure.ok ? 'PASS' : 'FAIL'} — ${run.structure.summary}` : 'n/a',
    ...(run?.structure?.issues ?? []).map((issue) => `- ${issue}`),
    '',
    '## Quality warnings (advisory)',
    '',
    ...((run?.structure?.warnings ?? []).length ? run.structure.warnings.map((warning) => `- ${warning}`) : ['- none']),
    '',
    '## Skill retrieval events',
    '',
    ...(skillEvents.length ? skillEvents.map((event) => `- ${(event.ids ?? []).join(', ')}`) : ['- none']),
    '',
    `## Agent summary`,
    '',
    run?.summary ? String(run.summary) : '(none)',
    '',
  ];
  fs.writeFileSync(path.join(RESULTS_DIR, 'REPORT.md'), lines.filter((line) => line !== undefined).join('\n'), 'utf8');
}

describe('design agent — live multi-file build', { timeout: 20 * 60 * 1000 }, () => {
  it('thinks, uses skills, calls tools and builds html + css + js in a fresh folder', async (t) => {
    fs.mkdirSync(SITE_DIR, { recursive: true });

    const config = loadConfig({ workspaceDir: SITE_DIR });
    const bus = new EventBus();
    const events = [];
    bus.on((event) => events.push({ type: event.type, ids: event.ids, rel: event.rel, tool: event.tool }));

    const router = createRouter({ config, bus });
    const brain = await router.activeBrain();

    // The agent loop needs a real model: the deterministic engine cannot tool-call.
    if (!(await router.hasLiveModel())) {
      writeArtifacts({
        status: 'skipped',
        message: `no live model — active brain is "${brain?.id}". Start Ollama and run \`ollama pull qwen2.5-coder:7b\`, then re-run.`,
        events,
      });
      t.skip(`no live model (${brain?.id ?? 'unknown'}) — see ${path.relative(ROOT, RESULTS_DIR)}/REPORT.md`);
      return;
    }

    const registry = createSkillRegistry({ skills: config.skills });
    const inspection = inspectWorkspace(SITE_DIR, config);
    const system = buildAgentSystemPrompt({
      skillsContext: '(retrieved per task at run time — the live prompt is what the model receives)',
      inspection,
      skillIndex: registry.list().map((skill) => ({ id: skill.id, category: skill.category, description: skill.description })),
    });

    const result = await runAgent(REQUEST, {
      workspaceDir: SITE_DIR,
      config,
      bus,
      router,
      registry,
      maxSteps: 10,
    });

    const structure = checkStructure(SITE_DIR, result.writes, result);

    writeArtifacts({
      status: result.status,
      message: `${brain?.label ?? ''} ${brain?.model ?? ''}`.trim(),
      systemPrompt: system,
      run: { ...result, structure },
      events,
    });

    // --- the assertions that matter: real multi-file output ------------------
    assert.ok(result.writes.length >= 2, `expected at least 2 files, got ${result.writes.length}: ${result.writes.map((write) => write.rel).join(', ')}`);
    assert.ok(result.writes.some((write) => write.rel.endsWith('.html')), 'expected an html file');
    assert.ok(result.writes.some((write) => write.rel.endsWith('.css')), 'expected a css file in its own file');
    assert.ok(result.writes.some((write) => /\.m?js$/.test(write.rel)), 'expected a js file in its own file');
    assert.ok(result.actions.length >= 2, 'expected the agent to make multiple tool calls');
    assert.ok(result.skills.ids.length >= 1, 'expected skills to be retrieved for the task');
    assert.equal(structure.ok, true, `structure check failed: ${structure.issues.join('; ')}`);

    // Reported, not asserted: whether the model chose to read extra skills itself.
    console.log(`agent skills read on demand: ${result.skillsRead.join(', ') || 'none'}`);
    console.log(`artifacts: ${path.relative(ROOT, RESULTS_DIR)}`);
  });
});
