/** Runtime session: inspect > understand > plan > skills > direction > tokens > compose > build > verify > critique > improve > memory. */
import path from 'node:path';
import { EventBus, EVENT } from '../core/events.mjs';
import { silentLogger } from '../core/logger.mjs';
import { inspectWorkspace, summarizeInspection } from '../workspace/scanner.mjs';
import { createSkillRegistry } from '../skills/registry.mjs';
import { createRetriever } from '../skills/retriever.mjs';
import { createRouter } from '../model/router.mjs';
import { chooseDirection } from '../design/directions.mjs';
import { buildTokens } from '../design/tokens.mjs';
import { composePage, deriveSubject } from '../design/compose.mjs';
import { emitSiteCss, emitMotionCss } from '../design/emit-css.mjs';
import { createToolContext } from '../tools/context.mjs';
import { verifyStatic } from '../verify/static.mjs';
import { reasonCode } from '../reason/code.mjs';
import { reasonCritique } from '../reason/critique.mjs';
import { recordRun } from '../workspace/memory.mjs';
import { makeId } from '../core/util.mjs';
export async function runTask(request, { workspaceDir, config, overrides = {} } = {}) {
  const bus = new EventBus();
  const logger = config?.logger ?? silentLogger;
  const run = { id: makeId('run'), request, status: 'running', startedAt: new Date().toISOString(), decisions: [], writes: [] };
  bus.emit(EVENT.RUN_START, { id: run.id, request });
  try {
    bus.emit(EVENT.PHASE, { phase: 'inspect' });
    const inspection = inspectWorkspace(workspaceDir, config);
    run.inspection = { summary: summarizeInspection(inspection), kind: inspection.projectKind, framework: inspection.framework };
    bus.emit(EVENT.THOUGHT, { phase: 'inspect', text: run.inspection.summary });
    const router = createRouter({ config, bus, logger });
    bus.emit(EVENT.PHASE, { phase: 'understand' });
    const understanding = (await router.json(request, { kind: 'understand', payload: { request, inspection }, phase: 'understand', validate: (v) => !!v?.taskType })).value;
    run.understanding = understanding;
    bus.emit(EVENT.PHASE, { phase: 'plan' });
    const plan = (await router.json(request, { kind: 'plan', payload: { request, understanding, inspection }, phase: 'plan', validate: (v) => Array.isArray(v?.steps) })).value;
    run.plan = plan;
    bus.emit(EVENT.PLAN, { steps: plan.steps?.length ?? 0 });
    const registry = createSkillRegistry({ skills: config.skills, logger });
    const retriever = createRetriever({ registry, config, logger });
    const skills = retriever.retrieve({ request, taskType: understanding.taskType, workspace: inspection });
    run.skills = { ids: skills.ids, summary: skills.summary };
    bus.emit(EVENT.SKILLS, { ids: skills.ids });
    const { chosen: direction, method } = await chooseDirection({ request, taskType: understanding.taskType, inspection, router, bus, logger });
    run.direction = { name: direction.name, id: direction.id, method };
    run.decisions.push({ kind: 'direction', choice: direction.id, why: method });
    const tokens = buildTokens({ direction, existing: inspection.design, intent: understanding.intent, request });
    run.tokens = { accent: tokens.accent, theme: tokens.theme, direction: tokens.direction };
    const subject = deriveSubject(request);
    const brandFromRequest = request.match(/called\s+([A-Za-z][A-Za-z0-9&' -]{1,30}?)(?=[,.;]|$)/i);
    if (brandFromRequest) subject.subject = brandFromRequest[1].trim();
    const page = composePage({ request, taskType: understanding.taskType, projectKind: inspection.projectKind, direction, subject, wants: [] });
    run.page = { sections: page.sections.map((s) => s.type + ':' + s.layout) };
    const tools = createToolContext({ workspaceDir, config, bus, dryRun: !!overrides.dryRun });

    // Enhancement tasks: inject only the targeted layer into the existing page.
    const ENHANCE_TYPES = ['enhance', 'motion', 'responsive', '3d'];
    let code;
    if (ENHANCE_TYPES.includes(understanding.taskType)) {
      const existingRel = tools.listFiles().find((rel) => /^index\.html?$/i.test(rel));
      if (existingRel) {
        code = await enhanceExistingFile({ existingRel, taskType: understanding.taskType, tokens, direction, tools });
      }
    }
    if (!code) {
      const title = page.kind === 'component-demo'
        ? `${page.component.charAt(0).toUpperCase() + page.component.slice(1)} — demo`
        : (page.title ?? 'Artisan site');
      code = await reasonCode({ direction, plan: page, tokens, inspection, title, skills: { ids: skills.ids, contextBlock: skills.contextBlock }, router });
    }
    run.codeNotes = code.notes;
    for (const file of code.files) {
      const res = tools.writeFile(file.rel, file.content);
      run.writes.push(res);
    }
    const html = code.files.find((f) => f.rel.endsWith('.html'))?.content ?? '';
    const cssMatch = html.match(/<style>\n([\s\S]*?)\n<\/style>/);
    const css = cssMatch ? cssMatch[1] : emitSiteCss(tokens, { direction, plan: page });
    let verification = verifyStatic({ html, css, plan: page });
    // Repair loop: deterministic fixes from verification issues, then re-verify.
    let iterations = 0;
    const maxIterations = overrides.maxIterations ?? 2;
    while (!verification.ok && iterations < maxIterations) {
      iterations += 1;
      const repaired = repairHtml({ html, issues: verification.issues, tokens, direction, page });
      if (!repaired) break;
      const res = tools.writeFile('index.html', repaired);
      run.writes.push(res);
      const newCssMatch = repaired.match(/<style>\n([\s\S]*?)\n<\/style>/);
      verification = verifyStatic({ html: repaired, css: newCssMatch ? newCssMatch[1] : css, plan: page });
      bus.emit(EVENT.IMPROVE, { iteration: iterations, issues: verification.issues.length });
    }
    run.improvements = iterations;
    run.verification = verification;
    run.verification = verification;
    bus.emit(EVENT.VERIFY, verification);
    const critique = reasonCritique({ sections: page.sections, verification });
    run.critique = critique;
    bus.emit(EVENT.CRITIQUE, { overall: critique.overall });
    run.status = verification.ok ? 'done' : 'needs-fix';
    run.endedAt = new Date().toISOString();
    if (!overrides.noMemory) recordRun(workspaceDir, config, run);
    bus.emit(EVENT.RUN_END, { id: run.id, status: run.status, score: critique.overall });
    return { run, bus, inspection, direction, tokens, page, html: run.status === 'failed' ? undefined : html, css };
  } catch (error) {
    run.status = 'failed';
    run.error = String(error?.message ?? error);
    bus.emit(EVENT.ERROR, { message: run.error });
    bus.emit(EVENT.RUN_END, { id: run.id, status: 'failed' });
    return { run, bus, error };
  }
}

/* ---------------------------------------------------- enhancement passes ---- */

/**
 * Inject a targeted layer into an existing page without touching its markup.
 * Returns the same shape as reasonCode: { files, notes }.
 */
async function enhanceExistingFile({ existingRel, taskType, tokens, direction, tools }) {
  const source = tools.readFile(existingRel);
  const notes = [];
  const injections = [];

  if (taskType === 'motion' || taskType === 'enhance') {
    injections.push('/* ---- artisan motion layer ---- */\n' + emitMotionCss());
    notes.push('motion layer injected (durations, easings, reveal, reduced-motion)');
  }
  if (taskType === 'responsive' || taskType === 'enhance') {
    injections.push(`/* ---- artisan responsive layer ---- */
@media (max-width: 60rem) {
  .container { padding-inline: var(--space-5); }
  [class*='__inner'], .grid { grid-template-columns: 1fr !important; }
}
@media (max-width: 40rem) {
  body { font-size: var(--text-base); }
  .section, section { padding-block: var(--space-12); }
}`);
    notes.push('responsive layer injected (tablet + mobile breakpoints)');
  }
  if (taskType === '3d') {
    injections.push(`/* ---- artisan depth layer ---- */
#main, main { perspective: 1200px; }
.hero, section:first-of-type {
  transform-style: preserve-3d;
  position: relative;
}
.hero::before, section:first-of-type::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(120% 90% at 50% 0%, var(--color-accent-soft), transparent 60%);
  transform: translateZ(-60px);
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  #main, main { perspective: none; }
  .hero::before, section:first-of-type::before { transform: none; background: none; }
}`);
    notes.push('depth layer injected (one atmospheric effect + reduced-motion guard)');
  }

  let updated = source;
  if (injections.length) {
    const styleMatch = updated.match(/<style>([\s\S]*?)<\/style>/);
    if (styleMatch) {
      updated = updated.replace(/<\/style>/, `${injections.join('\n')}\n</style>`);
    } else {
      updated = updated.replace(/<\/head>/, `<style>\n${injections.join('\n')}\n</style>\n</head>`);
    }
    // Ensure the interactive layer exists for motion reveals.
    if (!updated.includes('IntersectionObserver') && (taskType === 'motion' || taskType === 'enhance')) {
      const close = '</' + 'script>';
      const js = `<script>\n(() => {\n  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;\n  if (reduce || !('IntersectionObserver' in window)) { document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('enter')); return; }\n  const io = new IntersectionObserver((entries) => entries.forEach((en) => {\n    if (en.isIntersecting) { en.target.classList.add('enter'); io.unobserve(en.target); }\n  }), { threshold: 0.12 });\n  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));\n})();\n${close}`;
      updated = updated.replace(/<\/body>/, `${js}\n</body>`);
      notes.push('reveal runtime injected');
    }
    notes.push(`enhancement applied to ${existingRel} (markup preserved)`);
  } else {
    notes.push('nothing to inject for this task type; existing page left intact');
  }
  return { files: [{ rel: existingRel, content: updated }], notes };
}

/* ---------------------------------------------------------- repair pass ---- */

/** Deterministic repairs for the exact issues verifyStatic reports. */
function repairHtml({ html, issues, tokens, direction, page }) {
  let out = html;
  let changed = false;
  const has = (check) => issues.some((issue) => issue.check === check);
  if (!out) return undefined;

  if (has('title')) {
    out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeXml(page?.sections?.find((s) => s.type === 'hero')?.content?.headline ?? 'Artisan site')}</title>`);
    changed = true;
  }
  if (has('lang')) {
    out = out.replace(/<html(?! lang)[^>]*>/, '<html lang="en">');
    changed = true;
  }
  if (has('viewport')) {
    out = out.replace(/<\/head>/, '<meta name="viewport" content="width=device-width, initial-scale=1" />\n</head>');
    changed = true;
  }
  if (has('skip-link')) {
    out = out.replace(/<body[^>]*>/, (m) => `${m}\n<a class="visually-hidden" href="#main">Skip to content</a>`);
    changed = true;
  }
  if (has('reduced-motion')) {
    out = out.replace(/<\/style>/, '@media (prefers-reduced-motion: reduce) {\n  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }\n  [data-reveal] { opacity: 1 !important; transform: none !important; }\n}\n</style>');
    changed = true;
  }
  if (has('labels')) {
    out = out.replace(/<input([^>]*?)>/g, (m, attrs) => (/aria-label=/.test(m) ? m : `<input aria-label="field"${attrs}>`));
    changed = true;
  }
  return changed ? out : undefined;
}

function escapeXml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

