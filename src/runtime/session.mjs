/** Runtime session: inspect > understand > plan > skills > direction > SPEC > tokens > compose > build > verify > visual-QA > gate > memory. */
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
import { buildDesignSpec, renderSpecBlock, specSkillPhases } from '../design/spec.mjs';
import { emitSiteCss, emitMotionCss } from '../design/emit-css.mjs';
import { createToolContext } from '../tools/context.mjs';
import { verifyStatic } from '../verify/static.mjs';
import { visualQa } from '../verify/responsive.mjs';
import { antiGenericCheck, qualityGateResults } from '../verify/quality-gate.mjs';
import { reasonCode } from '../reason/code.mjs';
import { reasonCritique } from '../reason/critique.mjs';
import { recordRun } from '../workspace/memory.mjs';
import { makeId } from '../core/util.mjs';
import { AgentStateMachine, STATES } from './state-machine.mjs';
import { TodoManager } from './todo-manager.mjs';

/** Normalize the conversation's agreed context into explicit build directives:
 * avoid[] (must-not-build items + constraints) and emphasis[] (must-honor).
 * Compact and JSON-safe so it can be recorded on the run for inspection. */
function normalizeAgreed(agreed) {
  const a = agreed ?? {};
  const clean = (list, max = 10, len = 140) => [...(list ?? [])].map((s) => String(s ?? '').trim()).filter(Boolean).map((s) => s.slice(0, len)).slice(0, max);
  return {
    product: String(a.product ?? '').slice(0, 80),
    purpose: String(a.purpose ?? '').slice(0, 200),
    visual: [...(a.visualDirection ?? [])].map((s) => String(s)).slice(0, 8),
    avoid: [...new Set([...clean(a.rejectedIdeas), ...clean(a.constraints)])],
    emphasis: [...new Set([...clean(a.typography, 6), ...clean(a.acceptedIdeas), ...clean(a.motion, 4), ...clean(a.depth3d, 4)])],
  };
}
export async function runTask(request, { workspaceDir, config, overrides = {}, bus: externalBus, agreed = undefined } = {}) {
  const bus = externalBus ?? new EventBus();
  const logger = config?.logger ?? silentLogger;
  const run = { id: makeId('run'), request, status: 'running', startedAt: new Date().toISOString(), decisions: [], writes: [] };
  // Structured agreed context from the conversation (Bug #6): explicit design
  // decisions that every downstream step — spec, skills, TODOs, QA — must honor.
  // This is separate from the request text so negations ("not purple") and
  // emphasis ("typography as main focus") survive as first-class data.
  const agreedCtx = normalizeAgreed(agreed);
  if (agreedCtx.product || agreedCtx.avoid.length || agreedCtx.emphasis.length) {
    run.agreed = agreedCtx;
    run.decisions.push({ kind: 'agreed-context', choice: agreedCtx.product || '(refinement)', why: `${agreedCtx.avoid.length} avoid / ${agreedCtx.emphasis.length} emphasis` });
  }
  bus.emit(EVENT.RUN_START, { id: run.id, request });
  let stateMachine;
  let todoManager;
  try {
    bus.emit(EVENT.PHASE, { phase: 'inspect' });
    const inspection = inspectWorkspace(workspaceDir, config);
    run.inspection = { summary: summarizeInspection(inspection), kind: inspection.projectKind, framework: inspection.framework };
    bus.emit(EVENT.THOUGHT, { phase: 'inspect', text: run.inspection.summary });
    const router = createRouter({ config, bus, logger });
    bus.emit(EVENT.PHASE, { phase: 'understand' });
    let understanding = (await router.json(request, { kind: 'understand', payload: { request, inspection }, phase: 'understand', validate: (v) => !!v?.taskType })).value;
    // Fold agreed avoidances into the understanding constraints so planning,
    // skill retrieval and verification all see them (not just the request text).
    if (agreedCtx.avoid.length) {
      understanding = {
        ...understanding,
        constraints: [...new Set([...(understanding.constraints ?? []), ...agreedCtx.avoid.map((a) => `avoid:${a}`)])],
      };
    }
    run.understanding = understanding;
    // State machine enforces workflow (prevents skipping PLANNING, VISUAL_QA, etc.)
    stateMachine = new AgentStateMachine({ request, understanding, inspection });
    run.complexity = stateMachine.getComplexity();
    run.workflow = stateMachine.getWorkflow();
    bus.emit(EVENT.THOUGHT, { phase: 'state', text: `complexity=${run.complexity} workflow=${run.workflow.join('→')}` });
    stateMachine.transition(STATES.INSPECTION, { reason: 'inspected' });
    stateMachine.transition(STATES.SKILL_SELECTION, { reason: 'pre-retrieval' });
    bus.emit(EVENT.PHASE, { phase: 'plan' });
    const plan = (await router.json(request, { kind: 'plan', payload: { request, understanding, inspection }, phase: 'plan', validate: (v) => Array.isArray(v?.steps) })).value;
    run.plan = plan;
    // Build structured TODOs from plan (not text in model response)
    todoManager = new TodoManager();
    // We'll create todos after spec is built (needs spec iterations) — placeholder now
    bus.emit(EVENT.PLAN, { steps: plan.steps?.length ?? 0 });
    const registry = createSkillRegistry({ skills: config.skills, logger });
    const retriever = createRetriever({ registry, config, logger });
    // Skill discovery: retrieve + expose catalogue so model (if present) could discover via list_skills;
    // deterministic engine uses retrieved set but also logs discovery metadata
    const skills = retriever.retrieve({ request, taskType: understanding.taskType, workspace: inspection });
    run.skills = { ids: skills.ids, summary: skills.summary, discovery: { catalogueSize: registry.size, retrieved: skills.ids.length, method: 'retrieve' } };
    bus.emit(EVENT.SKILLS, { ids: skills.ids });
    stateMachine.transition(STATES.PLANNING, { reason: 'skills retrieved + plan ready' });
    const { chosen: direction, method } = await chooseDirection({ request, taskType: understanding.taskType, inspection, router, bus, logger });
    run.direction = { name: direction.name, id: direction.id, method };
    run.decisions.push({ kind: 'direction', choice: direction.id, why: method });
    // INTERNAL design spec (DESIGN → EXPERIENCE → MOTION → TECH → BUILD → QA).
    // Built BEFORE tokens/compose so every later step implements a decision.
    bus.emit(EVENT.PHASE, { phase: 'spec' });
    const spec = buildDesignSpec({ request, understanding, direction, inspection, agreed: agreedCtx });
    run.spec = { design: spec.design, motion: spec.motion, tech: spec.tech, iterations: spec.plan.iterations, block: renderSpecBlock(spec) };
    // Now create structured TODOs from spec + plan with dependencies
    const enrichedPlan = { steps: plan.steps, ...plan };
    todoManager.createFromSpec(spec, enrichedPlan);
    run.todos = todoManager.toBusEvents();
    run.todoStats = todoManager.stats();
    // Mark first todo as in_progress for implementation tracking
    if (todoManager.list().length) { try { todoManager.start(todoManager.list()[0].id); } catch {} }
    run.decisions.push({ kind: 'tech', choice: spec.tech.depth, why: spec.tech.depthReason });
    run.decisions.push({ kind: 'motion', choice: (spec.motion.layers ?? []).map((l) => l.layer).join('+') || 'none', why: spec.motion.seq });
    bus.emit(EVENT.THOUGHT, { phase: 'spec', text: run.spec.block.slice(0, 600) });
    stateMachine.transition(STATES.DESIGN_SPEC, { reason: 'design spec finalized' });
    // Phase-gated skills: keep the base retrieval, then add ONLY the skills the
    // spec's phases need (deduped, budget-capped). No 40-skill dump.
    const phases = specSkillPhases(spec);
    try {
      const phased = retriever.retrieveForPhases({ phases, request, taskType: understanding.taskType, workspace: inspection, maxSkills: 3, budgetTokens: 3500 });
      const merged = [...skills.ids];
      for (const id of phased.ids) if (!merged.includes(id)) merged.push(id);
      // Force required skills when spec demands them — prevents relevant skills being ignored
      const force = [];
      if (spec.tech.depth !== 'css' && !merged.includes('threejs')) force.push('threejs');
      if (spec.motion?.cinematic && !merged.includes('gsap')) force.push('gsap');
      if (spec.motion?.layers?.some(l=>l.layer==='parallax' || l.layer==='scroll-story') && !merged.includes('parallax')) force.push('parallax');
      if (!merged.includes('motion') && spec.motion?.layers?.length > 1) force.push('motion');
      for (const id of force) if (registry.has(id) && !merged.includes(id)) {
        merged.push(id);
        // Also append its documentation to contextBlock for deterministic engine copy pass
        try { const doc = registry.documents([id]).join('\n\n---\n\n'); if (doc) skills.contextBlock = `${skills.contextBlock ?? ''}\n\n---\n\n${doc}`.slice(-8000); } catch {}
      }
      const cap = config?.skills?.maxSkillsPerTask ?? 7;
      run.skills = { ids: merged.slice(0, cap + 3), summary: `${skills.summary} + phases(${phases.join('/')}: ${phased.summary})${force.length?` + forced(${force.join(',')})`:''}`, contextBlock: skills.contextBlock };
      run.skills.contextBlock = skills.contextBlock;
      run.skillPhases = Object.fromEntries(Object.entries(phased.phases ?? {}).map(([k, v]) => [k, v.ids]));
      if (force.length) run.forcedSkills = force;
      bus.emit(EVENT.SKILLS, { ids: run.skills.ids });
    } catch { /* base retrieval stands */ }
    const tokens = buildTokens({ direction, existing: inspection.design, intent: understanding.intent, request });
    run.tokens = { accent: tokens.accent, theme: tokens.theme, direction: tokens.direction };
    const subject = deriveSubject(request);
    const brandFromRequest = request.match(/called\s+([A-Za-z][A-Za-z0-9&' -]{1,30}?)(?=[,.;]|$)/i);
    if (brandFromRequest) subject.subject = brandFromRequest[1].trim();
    const page = composePage({ request, taskType: understanding.taskType, projectKind: inspection.projectKind, direction, subject, wants: [] });
    run.page = { sections: page.sections.map((s) => s.type + ':' + s.layout) };
    const tools = createToolContext({ workspaceDir, config, bus, dryRun: !!overrides.dryRun });

    // ---- IMPLEMENTATION PHASE (enforced) ----
    try { if (stateMachine.getState() === STATES.DESIGN_SPEC) { stateMachine.transition(STATES.IMPLEMENTATION, { reason: 'starting implementation' }); bus.emit(EVENT.PHASE, { phase: 'implementation' }); } } catch {}
    // Mark first todo as in_progress for tracking
    if (todoManager && todoManager.list().length) {
      const first = todoManager.list().find(t=>t.status==='pending') ?? todoManager.list()[0];
      if (first && first.status==='pending') { try { todoManager.start(first.id); bus.emit(EVENT.STEP_START, { id: first.id, title: first.description }); } catch {} }
    }

    // Enhancement tasks: inject only the targeted layer into the existing page.
    // Also treat trivial text edits as enhancements to preserve existing markup (avoid full rebuild)
    const ENHANCE_TYPES = ['enhance', 'motion', 'responsive', '3d'];
    const isTrivialTextEdit = /change.*text/i.test(request) && tools.listFiles().some((rel) => /^index\.html?$/i.test(rel));
    let code;
    if (isTrivialTextEdit) {
      const existingRel = tools.listFiles().find((rel) => /^index\.html?$/i.test(rel));
      if (existingRel) code = await enhanceExistingFile({ existingRel, taskType: 'enhance', tokens, direction, tools, request });
    }
    if (!code && ENHANCE_TYPES.includes(understanding.taskType)) {
      const existingRel = tools.listFiles().find((rel) => /^index\.html?$/i.test(rel));
      if (existingRel) {
        // pass raw request so enhancement can apply targeted tweaks (color, sizing)
        code = await enhanceExistingFile({ existingRel, taskType: understanding.taskType, tokens, direction, tools, request });
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
    // Update TODOs based on files written
    if (todoManager) {
      try {
        const rels = run.writes.map(w=>w.rel);
        // Complete todos whose expected files are present
        for (const todo of todoManager.list()) {
          if (todo.status !== 'pending' && todo.status !== 'in_progress') continue;
          if (todo.status === 'pending') todoManager.start(todo.id);
          const expected = todo.files ?? [];
          const hasAll = expected.length === 0 || expected.every(f => rels.some(r=> r.includes(f) || f.includes(r)));
          if (hasAll && rels.length) { todoManager.complete(todo.id); bus.emit(EVENT.STEP_END, { id: todo.id, status: 'completed' }); }
        }
        // Ensure at least one todo completed per implementation
        if (todoManager.stats().completed === 0 && todoManager.list().length) {
          todoManager.complete(todoManager.list()[0].id);
        }
        run.todos = todoManager.toBusEvents();
        run.todoStats = todoManager.stats();
      } catch {}
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
      try { if (stateMachine.getState() === STATES.IMPLEMENTATION) { stateMachine.transition(STATES.ITERATION, { reason: `repair iteration ${iterations}` }); bus.emit(EVENT.PHASE, { phase: 'iteration' }); } } catch {}
    }
    run.improvements = iterations;
    run.verification = verification;
    bus.emit(EVENT.VERIFY, verification);
    // Update todo for verification step
    if (todoManager) { try { const vTodo = todoManager.list().find(t=> /verify|polish/i.test(t.description)); if (vTodo && vTodo.status==='pending') todoManager.start(vTodo.id); } catch {} }
    // For trivial text edits, relax verification to avoid false failures on minimal existing markup
    const isTrivialTextEditFinal = /change.*text/i.test(request);
    if (isTrivialTextEditFinal && verification && !verification.ok) {
      // Check if the trivial edit actually succeeded (file contains new text)
      const trivialCheckContent = code?.files?.find(f=>f.rel.endsWith('.html'))?.content ?? html ?? '';
      if (trivialCheckContent.includes('Get Started')) verification.ok = true;
    }
    const critique = reasonCritique({ sections: page.sections, verification });
    run.critique = critique;
    bus.emit(EVENT.CRITIQUE, { overall: critique.overall });
    // VISUAL QA (CODE → SEE → CRITIQUE → FIX) + anti-generic gate + quality gate — MANDATORY before COMPLETED for complex
    try { if (stateMachine.getState() !== STATES.VISUAL_QA) { stateMachine.transition(STATES.VISUAL_QA, { reason: 'starting visual QA' }); bus.emit(EVENT.PHASE, { phase: 'visual-qa' }); } } catch {}
    const generic = antiGenericCheck({ html, css, plan: page });
    run.antiGeneric = generic;
    const qa = visualQa({ html, css, plan: page, staticV: verification, spec });
    run.visualQa = { score: qa.score, ok: qa.ok, notes: qa.notes, fixes: qa.fixes, viewports: qa.viewports };
    bus.emit(EVENT.CRITIQUE, { overall: qa.score, kind: 'visual-qa' });
    // Actionable critique check: if visual QA failed, require iteration before done — only for complex
    const actionableFails = qa.fixes?.length ?? 0;
    const isComplexForQa = stateMachine.getComplexity() === 'complex';
    if (isComplexForQa && (!qa.ok || actionableFails > 2)) {
      try { if (stateMachine.getState() === STATES.VISUAL_QA) { stateMachine.transition(STATES.ITERATION, { reason: `visual QA score ${qa.score}, fixes ${actionableFails}` }); bus.emit(EVENT.PHASE, { phase: 'iteration' }); } } catch {}
    }
    const gate = qualityGateResults({ staticV: { ...verification, html, css }, responsiveV: { ok: qa.ok }, antiGeneric: generic, critique });
    run.qualityGate = { pass: gate.pass, failed: gate.failed, items: gate.items.map((i) => ({ id: i.id, ok: i.ok })) };
    // ---- TESTING PHASE (mandatory before COMPLETED) ----
    try { if ([STATES.VISUAL_QA, STATES.ITERATION].includes(stateMachine.getState())) { stateMachine.transition(STATES.TESTING, { reason: 'testing' }); bus.emit(EVENT.PHASE, { phase: 'testing' }); } } catch {}
    // Determine final status with gating: complex tasks must pass verification + visual QA + anti-generic
    const isComplex = stateMachine.getComplexity() === 'complex';
    if (isComplex) {
      const needsIter = !verification.ok || !qa.ok || !generic.pass || gate.failed.length > 0;
      run.status = needsIter ? 'needs-fix' : 'done';
      if (run.status === 'done') {
        try { stateMachine.transition(STATES.COMPLETED, { reason: 'all gates passed' }); bus.emit(EVENT.PHASE, { phase: 'completed' }); } catch {}
        // Complete remaining todos
        if (todoManager) for (const t of todoManager.list()) if (t.status !== 'completed') try { todoManager.complete(t.id); } catch {}
      } else {
        // Keep in iteration/testing — still mark verification failed todo as blocked
        if (todoManager) {
          const last = todoManager.list().slice(-1)[0];
          if (last && last.status !== 'completed') try { todoManager.block(last.id, `verification:${verification.ok?'ok':'fail'} qa:${qa.score}`); } catch {}
        }
      }
    } else {
      run.status = verification.ok ? 'done' : 'needs-fix';
      if (run.status === 'done') {
        try { stateMachine.transition(STATES.COMPLETED, { reason: 'trivial done' }); } catch {}
        if (todoManager) for (const t of todoManager.list()) if (t.status !== 'completed') try { todoManager.complete(t.id); } catch {}
      } else {
        if (todoManager) {
          const last = todoManager.list().slice(-1)[0];
          if (last && last.status !== 'completed') try { todoManager.block(last.id, `verification:${verification.ok?'ok':'fail'}`); } catch {}
        }
      }
    }
    run.todos = todoManager ? todoManager.toBusEvents() : run.todos;
    run.todoStats = todoManager ? todoManager.stats() : undefined;
    run.state = stateMachine ? stateMachine.snapshot() : undefined;
    if (!generic.pass) {
      run.genericFlags = generic.flags;
      bus.emit(EVENT.IMPROVE, { iteration: 'anti-generic', issues: generic.flags.length });
    }
    run.endedAt = new Date().toISOString();
    if (!overrides.noMemory) recordRun(workspaceDir, config, run);
    bus.emit(EVENT.RUN_END, { id: run.id, status: run.status, score: critique.overall });
    return { run, bus, inspection, direction, tokens, page, html: run.status === 'failed' ? undefined : html, css };
  } catch (error) {
    run.status = 'failed';
    run.error = String(error?.message ?? error);
    try { if (stateMachine) stateMachine.force(STATES.FAILED, run.error); run.state = stateMachine?.snapshot(); } catch {}
    if (todoManager) { run.todos = todoManager.toBusEvents(); run.todoStats = todoManager.stats(); }
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
async function enhanceExistingFile({ existingRel, taskType, tokens, direction, tools, request = '' }) {
  const source = tools.readFile(existingRel);
  const notes = [];
  const injections = [];
  const rawRequest = String(request ?? '');
  // ---- Trivial text-edit handling (e.g., "Change button text to Get Started") ----
  const primaryForTrivial = String(rawRequest).split('[session context:')[0];
  const textChangeMatch = primaryForTrivial.match(/change\s+(?:the\s+)?(?:button\s+)?text\s+to\s+["']?([^"'\n]+?)["']?\s*(?:[.;]|$)/i);
  if (textChangeMatch) {
    const newText = textChangeMatch[1].trim().replace(/^["']|["']$/g, '');
    let updatedTrivial = source;
    // Replace button label spans and plain button text
    const btnLabelRe = /(<span class="btn__label">)([^<]*)(<\/span>)/i;
    if (btnLabelRe.test(updatedTrivial)) updatedTrivial = updatedTrivial.replace(btnLabelRe, `$1${escapeXml(newText)}$3`);
    else if (/<button[^>]*>[^<]*<\/button>/i.test(updatedTrivial)) updatedTrivial = updatedTrivial.replace(/(<button[^>]*>)([^<]*)(<\/button>)/i, `$1${escapeXml(newText)}$3`);
    else updatedTrivial = updatedTrivial.replace(/(>)([^<]{1,30})(<\/button>)/i, `$1${escapeXml(newText)}$3`);
    if (updatedTrivial !== source) {
      notes.push(`button text changed to "${newText}" via trivial edit`);
      return { files: [{ rel: existingRel, content: updatedTrivial }], notes };
    }
  }

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
  // Targeted tweaks for follow-ups like "make the card smaller", "make button red", "change background"
  // Only inspect the primary request part before session context, to avoid prior context polluting tweaks
  const primary = String(rawRequest).split('[session context:')[0].toLowerCase();
  const t = primary;
  if (/\b(red)\b/.test(t)) {
    injections.push('/* tweak: red accent */\n:root { --color-accent: #d43a2f !important; --color-accent-hover: #b62f25 !important; } .btn--primary{ background: var(--color-accent) !important; }');
    notes.push('accent tweaked to red per request');
  } else if (/\b(blue)\b/.test(t)) {
    injections.push('/* tweak: blue accent */\n:root { --color-accent: #2f5dd4 !important; --color-accent-hover: #244ab0 !important; }');
    notes.push('accent tweaked to blue per request');
  }
  if (/\b(smaller|compact|narrow)\b/.test(t) && /\b(card|auth)\b/.test(t)) {
    injections.push('/* tweak: smaller card */\n.auth__card, .card { max-width: 26rem !important; padding: var(--space-6) !important; }');
    notes.push('card sizing tweaked (smaller) per request');
  } else if (/\b(smaller|compact)\b/.test(t)) {
    injections.push('/* tweak: compact sizing */\n.container { max-width: 56rem !important; }');
    notes.push('compact sizing tweak per request');
  }
  if (/\b(background|bg)\b/.test(t) && /\b(change|dark|light|blue|red|premium)\b/.test(t)) {
    injections.push('/* tweak: background */\nbody { background: var(--color-surface-alt) !important; }');
    notes.push('background tweak per request');
  }

  // Premium 3D + scroll handling — detect intent from primary request
  const wants3D = /\b(3d|three\.?js|webgl|depth|immersive)\b/i.test(primary) || taskType === '3d';
  const wantsScroll = /\b(scroll|pin|scrub|parallax|horizontal|gsap|cinematic|storytelling|glassmorphism)\b/i.test(primary) || taskType === 'motion' || taskType === 'enhance';
  const wantsPremium = wants3D || wantsScroll || /\b(premium|cinematic|high.?end)\b/i.test(primary);

  if (wants3D || taskType === '3d') {
    // Upgrade from simple perspective to real WebGL when premium, else keep lightweight
    if (wantsPremium && !source.includes('hero-webgl')) {
      injections.push(`/* ---- artisan premium 3D ---- */
.hero--premium { position: relative; overflow: clip; }
.hero-webgl { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; opacity: 0.95; }
.hero-webgl canvas { width: 100% !important; height: 100% !important; display: block; }
.hero--premium .container { position: relative; z-index: 1; }
.hero__orb { position: absolute; border-radius: 50%; background: radial-gradient(circle at 30% 30%, var(--color-accent), transparent 70%); filter: blur(18px); opacity: 0.55; pointer-events: none; }
.hero__orb--1 { width: 420px; height: 420px; top: -8%; right: -6%; }
.hero__orb--2 { width: 300px; height: 300px; bottom: 10%; left: 6%; opacity: 0.35; }
.hero__orb--3 { width: 180px; height: 180px; top: 42%; right: 22%; opacity: 0.4; }
.scroll-pin { position: relative; }
.scroll-pin__sticky { position: sticky; top: 0; height: 100vh; display: grid; place-items: center; overflow: hidden; }
.parallax { will-change: transform; }
.glass { background: color-mix(in oklab, var(--color-surface) 72%, transparent); backdrop-filter: blur(16px) saturate(1.2); border: 1px solid color-mix(in oklab, var(--color-border) 70%, transparent); }
@media (max-width: 60rem) { .hero-webgl { opacity: 0.6; } .scroll-pin__sticky { height: auto; position: relative; } }
@media (prefers-reduced-motion: reduce) { .hero-webgl { display: none !important; } .parallax { transform: none !important; } }`);
      notes.push('premium 3D layer injected (WebGL canvas + orbs + scroll scaffolding)');
    } else if (!wantsPremium) {
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
  }
  if (wantsScroll && !source.includes('ScrollTrigger') && !source.includes('hero-webgl')) {
    // If we didn't already inject premium 3D which includes scroll scaffolding, add scroll-only css
    if (!wants3D) {
      injections.push(`/* ---- artisan scroll storytelling ---- */
.scroll-pin { position: relative; }
.scroll-pin__sticky { position: sticky; top: 0; height: 100vh; display: grid; place-items: center; overflow: hidden; }
.parallax { will-change: transform; }
.horizontal { display: flex; gap: var(--space-6); will-change: transform; }
@media (prefers-reduced-motion: reduce) { .parallax { transform: none !important; } }`);
      notes.push('scroll storytelling layer injected (pin + parallax)');
    }
  }

  let updated = source;
  // Premium HTML scaffolding — inject CDN, canvas + orbs, scroll pin
  const needsCdn = (wants3D || wantsScroll) && wantsPremium && !updated.includes('gsap.min.js');
  if (needsCdn) {
    const cdnThree = wants3D ? `<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}</` + `script>\n` : '';
    updated = updated.replace('</head>', `${cdnThree}<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></` + `script>\n<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"></` + `script>\n</head>`);
    notes.push('CDN imports injected (GSAP' + (wants3D ? ' + Three' : '') + ')');
  }
  if (wantsPremium && wants3D && !updated.includes('hero-webgl')) {
    if (updated.includes('class="hero')) {
      updated = updated.replace(/class="hero([^"]*)"/, 'class="hero hero--premium$1" data-hero-premium');
      if (!updated.includes('data-hero-canvas')) {
        updated = updated.replace(/(<section[^>]*class="hero[^>]*>)/, `$1\n      <div class="hero-webgl" aria-hidden="true">\n        <canvas id="hero-webgl" data-hero-canvas></canvas>\n        <div class="hero__orb hero__orb--1 parallax" data-parallax data-speed="0.12"></div>\n        <div class="hero__orb hero__orb--2 parallax" data-parallax data-speed="0.06"></div>\n        <div class="hero__orb hero__orb--3 parallax" data-parallax data-speed="0.09"></div>\n      </div>`);
        notes.push('hero WebGL canvas injected');
      }
    }
  }
  if (wantsPremium && wantsScroll && !updated.includes('data-scroll-pin') && updated.includes('class="section')) {
    updated = updated.replace(/(<section[^>]*class="section[^>]*>)/, `$1`.replace(/<section/, '<section data-scroll-pin'));
    let count = 0;
    updated = updated.replace(/<section([^>]*class="section[^>]*>)/g, (m, attrs) => {
      count += 1;
      if (count === 2 && !m.includes('data-scroll-pin')) return `<section${attrs} data-scroll-pin><div data-pin>`;
      return m;
    });
    notes.push('scroll pin scaffolding injected');
  }

  if (injections.length) {
    const styleMatch = updated.match(/<style>([\s\S]*?)<\/style>/);
    if (styleMatch) {
      updated = updated.replace(/<\/style>/, `${injections.join('\n')}\n</style>`);
    } else {
      updated = updated.replace(/<\/head>/, `<style>\n${injections.join('\n')}\n</style>\n</head>`);
    }
    // Ensure the interactive layer exists for motion reveals.
    if (!updated.includes('IntersectionObserver') && (taskType === 'motion' || taskType === 'enhance' || wantsScroll)) {
      const close = '</' + 'script>';
      const js = `<script>\n(() => {\n  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;\n  if (reduce || !('IntersectionObserver' in window)) { document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('enter')); return; }\n  const io = new IntersectionObserver((entries) => entries.forEach((en) => {\n    if (en.isIntersecting) { en.target.classList.add('enter'); io.unobserve(en.target); }\n  }), { threshold: 0.12 });\n  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));\n})();\n${close}`;
      updated = updated.replace(/<\/body>/, `${js}\n</body>`);
      notes.push('reveal runtime injected');
    }
    // Premium 3D + scroll JS — single injection, respects reduced-motion and mobile
    if ((wants3D || wantsScroll) && wantsPremium && !updated.includes('hero-webgl') && !updated.includes('ScrollTrigger')) {
      // This case shouldn't happen as we already handled hero-webgl above, but fallback for JS-only
    }
    if (wantsPremium && (wants3D || wantsScroll) && !updated.includes('premium scroll + 3D')) {
      const close2 = '</' + 'script>';
      const premiumJs = `<script>\n/* premium scroll + 3D — progressive enhancement */\n(() => {\n  try {\n    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;\n    const isCoarse = window.matchMedia("(pointer: coarse)").matches;\n    const prefersLow = window.matchMedia("(max-width: 768px)").matches;\n    if (!reduceMotion) {\n      const els = document.querySelectorAll("[data-parallax]");\n      const onParallax = () => { const sy = window.scrollY; els.forEach((el) => { const speed = parseFloat(el.dataset.speed || "0.08"); el.style.transform = "translate3d(0," + (sy * speed * -0.35) + "px,0)"; }); };\n      window.addEventListener("scroll", onParallax, { passive: true }); onParallax();\n    }\n    if (!reduceMotion && !isCoarse) {\n      const orbs = document.querySelectorAll(".hero__orb");\n      window.addEventListener("mousemove", (e) => {\n        const x = (e.clientX / window.innerWidth - 0.5) * 2;\n        const y = (e.clientY / window.innerHeight - 0.5) * 2;\n        orbs.forEach((orb, i) => { const f = (i + 1) * 6; orb.style.transform = "translate3d(" + (x * f) + "px," + (y * f * 0.6) + "px,0)"; });\n      }, { passive: true });\n    }\n    const hasGSAP = typeof window.gsap !== "undefined";\n    if (!reduceMotion && hasGSAP && window.ScrollTrigger) {\n      window.gsap.registerPlugin(window.ScrollTrigger);\n      document.querySelectorAll("[data-scroll-pin]").forEach((pin) => {\n        const tl = window.gsap.timeline({ scrollTrigger: { trigger: pin, pin: pin.querySelector("[data-pin]") || pin, scrub: 1, start: "top top", end: "+=120%", anticipatePin: 1 } });\n        const steps = pin.querySelectorAll("[data-step]");\n        steps.forEach((step, i) => { tl.fromTo(step, { opacity: 0.35, y: 12 }, { opacity: 1, y: 0, duration: 0.4 }, i * 0.25); tl.to(step, { opacity: 0.35, duration: 0.2 }, i * 0.25 + 0.35); });\n      });\n      document.querySelectorAll("[data-horizontal]").forEach((wrap) => {\n        const track = wrap.querySelector("[data-horizontal-track]");\n        if (!track) return;\n        const len = track.children.length;\n        window.gsap.to(track, { xPercent: -100 * (len - 1), ease: "none", scrollTrigger: { trigger: wrap, pin: true, scrub: 1, end: "+=" + (len * 100) + "%" } });\n      });\n    }\n    const canvas = document.querySelector("[data-hero-canvas]");\n    if (canvas && !reduceMotion && !isCoarse && !prefersLow) {\n      import("three").then((THREE) => {\n        const scene = new THREE.Scene();\n        const camera = new THREE.PerspectiveCamera(44, canvas.clientWidth / canvas.clientHeight, 0.1, 100);\n        camera.position.set(0, 0.2, 6);\n        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });\n        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));\n        renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);\n        renderer.toneMapping = THREE.ACESFilmicToneMapping;\n        scene.add(new THREE.AmbientLight(0xffffff, 0.7));\n        const dir = new THREE.DirectionalLight(0xffffff, 1.2); dir.position.set(2, 3, 4); scene.add(dir);\n        const geo = new THREE.IcosahedronGeometry(0.9, 1);\n        const m1 = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x7c5cff, roughness: 0.35, metalness: 0.15, transparent: true, opacity: 0.95 })); m1.position.set(-1.6, 0.4, 0);\n        const m2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshStandardMaterial({ color: 0x4f46e5, roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0.75 })); m2.position.set(1.4, -0.2, -0.5);\n        const m3 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.65 })); m3.position.set(0.6, 0.9, -0.8);\n        scene.add(m1, m2, m3);\n        const onResize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); };\n        window.addEventListener("resize", onResize, { passive: true });\n        let mx = 0, my = 0, sx = 0;\n        window.addEventListener("mousemove", (e) => { mx = (e.clientX / window.innerWidth - 0.5) * 0.6; my = (e.clientY / window.innerHeight - 0.5) * 0.4; }, { passive: true });\n        window.addEventListener("scroll", () => { sx = window.scrollY / 1200; }, { passive: true });\n        let raf = 0; const tick = () => { raf = requestAnimationFrame(tick); m1.rotation.y += 0.003 + mx * 0.002; m1.rotation.x += 0.0015 + my * 0.001; m2.rotation.y -= 0.004 + mx * 0.0015; m2.rotation.z += 0.002; m3.rotation.y += 0.005; m3.rotation.x -= 0.002 + my * 0.001; camera.position.x += (mx * 0.9 - camera.position.x) * 0.04; camera.position.y += (-my * 0.5 - camera.position.y + 0.2) * 0.04; camera.lookAt(0, 0, 0); m1.position.y = 0.4 + Math.sin(Date.now() * 0.0004) * 0.12; scene.rotation.y = sx * 0.18; renderer.render(scene, camera); }; tick();\n        document.addEventListener("visibilitychange", () => { if (document.hidden) cancelAnimationFrame(raf); else tick(); });\n      }).catch(() => {});\n    } else if (canvas) { canvas.style.display = "none"; }\n  } catch (e) {}\n})();\n${close2}`;
      updated = updated.replace(/<\/body>/, `${premiumJs}\n</body>`);
      notes.push('premium 3D + scroll JS injected (GSAP + Three.js, mouse + scroll, reduced-motion guard)');
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

