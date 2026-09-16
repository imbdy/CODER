/**
 * Live showcase run: hand the agent a demanding brief and let it work.
 *
 *   node run-showcase.mjs
 *
 * Writes the build into ./agent-live-demo/ and a full log into
 * ./agent-live-demo/RUN-LOG.md so you can see exactly what it did.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './src/core/config.mjs';
import { EventBus } from './src/core/events.mjs';
import { createRouter } from './src/model/router.mjs';
import { createSkillRegistry } from './src/skills/registry.mjs';
import { runAgent } from './src/agent/agent.mjs';
import { checkStructure } from './src/verify/agent-output.mjs';

const workspace = path.resolve(process.cwd(), 'agent-live-demo');
fs.mkdirSync(workspace, { recursive: true });

const BRIEF = `Build the complete landing page for "Ember & Oak" — a premium small-batch coffee subscription.

I am testing your visual design ability, so DO NOT play it safe. Generic AI output gets rejected on sight: if this could pass as a template, you failed.

MANDATORY BAR:
- Dark editorial identity, one accent colour used with restraint, real typographic hierarchy (display serif vs workhorse sans), fluid type with clamp(), an intentional spacing scale — all as CSS custom properties in :root.
- Asymmetric hero with an oversized display headline, a supporting line that actually says something, and one clear CTA. NO centered-heading-+-two-buttons cliché.
- A marquee-grade features section (three offers, but NOT three identical cards — vary the composition).
- A subscription/pricing section with three tiers where the middle one is visually promoted.
- A testimonials row and an FAQ accordion (real, working, keyboard accessible).
- Footer with a newsletter form: label, hint, inline validation, success + error states, no alert().
- Scroll-triggered reveals with IntersectionObserver, hover micro-interactions, and a @media (prefers-reduced-motion: reduce) block that disables all of it.
- Fully responsive at 1440px, 834px and 390px — rethink the layout for mobile, do not just stack it.

NON-NEGOTIABLE:
- Semantic HTML, one h1, labels bound to inputs, alt text, visible :focus-visible states.
- Every var(--x) you use must be defined in :root. Undefined variables = bug.
- Real copy everywhere: brand voice, specific, no lorem ipsum, no "coming soon", no TODOs.
- Ship index.html + styles/main.css + scripts/main.js as SEPARATE files. index.html must link the stylesheet and load the script as a module. No inline CSS, no inline JS.
- Then READ BACK what you wrote and fix: undefined tokens, unguarded querySelector, missing reduced-motion block, missing responsive breakpoints.

When you are done, tell me exactly what you built and which skills you applied.`;

const config = loadConfig({ workspaceDir: workspace });
const bus = new EventBus();
const events = [];

bus.on((event) => {
  events.push(event);
  switch (event.type) {
    case 'thought': console.log(`[think] ${String(event.text ?? '').split('\n')[0].slice(0, 110)}`); break;
    case 'skills.retrieved': console.log(`[skills] ${(event.ids ?? []).join(', ')}`); break;
    case 'tool.call': console.log(`[tool] ${event.tool}`); break;
    case 'file.write': console.log(`[write] ${event.rel} (${event.bytes ?? '?'} bytes)`); break;
    case 'error': console.log(`[error] ${event.message}`); break;
    default: break;
  }
});

const registry = createSkillRegistry({ skills: config.skills });
const router = createRouter({ config, bus });
const brain = await router.activeBrain();
console.log(`brain: ${brain?.label} ${brain?.model} | workspace: ${workspace}\n`);

const started = Date.now();
const result = await runAgent(BRIEF, {
  workspaceDir: workspace,
  config,
  bus,
  router,
  registry,
  maxSteps: 24,
});
const structure = checkStructure(workspace, result.writes, result);
const ms = Date.now() - started;

// Persist a readable log of the whole run.
const log = [
  `# Agent showcase run — ${new Date().toISOString()}`,
  '',
  `brain: ${brain?.label} ${brain?.model} | status: ${result.status} | ${result.stepCount} tool calls | ${(ms / 1000).toFixed(1)}s`,
  '',
  '## Brief', '', BRIEF, '',
  '## Skills retrieved', '', (result.skills?.ids ?? []).join(', '), '',
  '## Files written', '',
  ...result.writes.map((write) => `- \`${write.rel}\` — ${write.bytes} bytes (${write.mode})`), '',
  '## Structure check', '', `${structure.ok ? 'PASS' : 'FAIL'} — ${structure.summary}`, '',
  ...structure.issues.map((issue) => `- ISSUE: ${issue}`),
  ...structure.warnings.map((warning) => `- warning: ${warning}`), '',
  '## Transcript', '',
  ...result.transcript.map((entry) => {
    if (entry.role === 'assistant') return `### step ${entry.step} — think\n${entry.think ?? '(none)'}\n\n<details><summary>raw</summary>\n\n\`\`\`\n${String(entry.text ?? '').slice(0, 8000)}\n\`\`\`\n\n</details>`;
    if (entry.role === 'tool') return `- tool \`${entry.tool}\` ${JSON.stringify(entry.args)} → ${JSON.stringify(entry.result)}`;
    return `- _${entry.role}_: ${entry.text}`;
  }),
  '',
  '## Agent summary', '', result.summary || '(none)', '',
].join('\n');
fs.writeFileSync(path.join(workspace, 'RUN-LOG.md'), log, 'utf8');

console.log(`\nstatus: ${result.status} | files: ${result.writes.map((write) => write.rel).join(', ')}`);
console.log(`structure: ${structure.ok ? 'PASS' : 'FAIL'} — ${structure.summary}`);
for (const warning of structure.warnings) console.log(`warning: ${warning}`);
console.log(`skills read on demand: ${result.skillsRead.join(', ') || 'none'}`);
console.log(`log: ${path.join(workspace, 'RUN-LOG.md')}`);
