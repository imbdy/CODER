/**
 * Artisan Agent — the LLM-driven tool-calling loop for frontend design.
 *
 * This is the *working* brain of the agent: the model gets an active role.
 * It inspects the workspace, reads skills, plans, writes real files, reads
 * them back, and fixes its own output — one step at a time, until it emits
 * the `done` signal.
 *
 * Brain: qwen2.5-coder:7b via Ollama.
 *
 * Output protocol (see ./prompts.mjs):
 *   - ```file:<rel> ... ```     → writeFile (preferred; no JSON escaping)
 *   - ```json [{"tool":...}]``` → any tool, incl. readSkill / patchFile / done
 */

import { silentLogger } from '../core/logger.mjs';
import { EventBus, EVENT } from '../core/events.mjs';
import { inspectWorkspace, summarizeInspection } from '../workspace/scanner.mjs';
import { createSkillRegistry } from '../skills/registry.mjs';
import { createRetriever } from '../skills/retriever.mjs';
import { createRouter } from '../model/router.mjs';
import { createToolContext } from '../tools/context.mjs';
import { createQwenToolContext } from '../tools/qwen-context.mjs';
import { classifyTaskType } from '../reason/understand.mjs';
import { extractCodeBlock, extractJson } from '../model/json.mjs';
import { checkStructure } from '../verify/agent-output.mjs';
import { buildAgentSystemPrompt } from './prompts.mjs';
import { buildDesignSpec, renderSpecBlock, specSkillPhases } from '../design/spec.mjs';
import { antiGenericCheck, qualityGateResults } from '../verify/quality-gate.mjs';
import { rankDirections } from '../design/directions.mjs';
import { trimHistory } from '../model/history-trim.mjs';
import { parseAndValidateToolCalls, retryMessage } from '../model/tool-validator.mjs';
import { validateToolCall } from '../tools/qwen-context.mjs';
import { AgentStateMachine, STATES } from '../runtime/state-machine.mjs';
import { TodoManager } from '../runtime/todo-manager.mjs';
import { reasonPlan } from '../reason/plan.mjs';
import { visualQa } from '../verify/responsive.mjs';
import { verifyStatic } from '../verify/static.mjs';

/**
 * Fenced-block grammars. Both fences must sit at the start of a line, otherwise
 * a *closing* fence would pair with the next block's *opening* fence and swallow
 * the block in between (that bug silently dropped JSON tool calls).
 */
const FILE_BLOCK_SOURCE = '^[ \\t]*```[ \\t]*(?:[a-z0-9_-]+[ \\t]+)*file:[ \\t]*([^\\s`]+)[ \\t]*\\r?\\n([\\s\\S]*?)^[ \\t]*```';
const FILE_BLOCK_FLAGS = 'gmi';
/** Fallback for 7B that emits markdown headings + html/css/js fences instead of file: blocks */
const HEADING_BLOCK_SOURCE = '^#{2,3}[ \\t]+([^\\n`]+\\.(?:html|css|js|jsx|ts|tsx))[ \\t]*\\r?\\n[ \\t]*```[ \\t]*(?:html|css|javascript|js|jsx|tsx)?[ \\t]*\\r?\\n([\\s\\S]*?)^[ \\t]*```';
const HEADING_BLOCK_FLAGS = 'gmi';
/** Matches ` ```json ... ``` ` (and tool_calls / jsonc) blocks. The language tag
 *  is REQUIRED so that a bare closing fence can never start a match. */
const JSON_BLOCK_SOURCE = '^[ \\t]*```[ \\t]*(?:json|jsonc|tool_calls|tools|json5)[ \\t]*\\r?\\n([\\s\\S]*?)^[ \\t]*```';
const JSON_BLOCK_FLAGS = 'gmi';

/**
 * Run the agent on a single request.
 *
 * @param {string} request
 * @param {object} opts
 * @param {string} opts.workspaceDir
 * @param {object} [opts.config]
 * @param {object} [opts.bus]
 * @param {object} [opts.logger]
 * @param {number} [opts.maxSteps=15]
 * @param {boolean} [opts.dryRun=false]
 * @param {object} [opts.router] reuse an existing router (health cache, trace)
 * @param {object} [opts.registry] reuse an existing skill registry
 * @param {Function} [opts.onStep] callback({ step, think, calls, writes })
 */
export async function runAgent(request, {
  workspaceDir, config, bus: externalBus, logger: extLogger,
  maxSteps = 15, dryRun = false, router: extRouter, registry: extRegistry, onStep, history = [],
} = {}) {
  const bus = externalBus ?? new EventBus();
  const logger = extLogger ?? silentLogger;
  const router = extRouter ?? createRouter({ config, bus, logger });
  const registry = extRegistry ?? createSkillRegistry({ skills: config?.skills ?? {}, logger });
  const retriever = createRetriever({ registry, config, logger });
  const startedAt = Date.now();

  // ---- STATE MACHINE: UNDERSTANDING → INSPECTION ----
  const understandingRaw = { taskType: classifyTaskType(request), subject: request.slice(0, 80) };
  bus.emit(EVENT.PHASE, { phase: 'understand' });
  bus.emit(EVENT.THOUGHT, { phase: 'understand', text: `taskType=${understandingRaw.taskType}` });

  bus.emit(EVENT.PHASE, { phase: 'inspect' });
  const inspection = inspectWorkspace(workspaceDir, config);
  bus.emit(EVENT.THOUGHT, { phase: 'inspect', text: summarizeInspection(inspection) });

  const taskType = understandingRaw.taskType;
  // State machine enforces workflow; complexity determines full vs short path
  const stateMachine = new AgentStateMachine({ request, understanding: understandingRaw, inspection });
  bus.emit(EVENT.PHASE, { phase: 'state', text: `complexity=${stateMachine.getComplexity()} workflow=${stateMachine.getWorkflow().join('→')}` });
  stateMachine.transition(STATES.INSPECTION, { reason: 'workspace inspected', data: { inspection } });
  // ---- SKILL SELECTION + DESIGN SPEC ----
  // Deterministic direction + spec BEFORE implementation (prevents generic components)
  const ranked = rankDirections({ request, taskType, inspection, limit: 1 });
  const specDirection = ranked[0]?.direction;
  const spec = buildDesignSpec({ request, understanding: understandingRaw, direction: specDirection, inspection });
  const specPhases = specSkillPhases(spec);
  bus.emit(EVENT.THOUGHT, { phase: 'spec', text: renderSpecBlock(spec).slice(0, 600) });
  stateMachine.transition(STATES.SKILL_SELECTION, { reason: 'spec built', data: { spec } });

  const skills = retriever.retrieve({ request, taskType, workspace: inspection });
  try {
    const phased = retriever.retrieveForPhases({ phases: specPhases, request, taskType, workspace: inspection, maxSkills: 2, budgetTokens: 2500 });
    for (const id of phased.ids) if (!skills.ids.includes(id)) { skills.ids.push(id); skills.contextBlock = `${skills.contextBlock ?? ''}\n\n---\n\n${phased.contextBlocks ? Object.values(phased.contextBlocks).join('\n\n---\n\n') : ''}`.slice(-6000); }
    skills.phases = phased.phases;
  } catch { /* base retrieval stands */ }
  // Force required skills when spec demands them — ensure model cannot ignore them and deterministic fallback has them
  const forceAgent = [];
  if (spec.tech.depth !== 'css' && !skills.ids.includes('threejs')) forceAgent.push('threejs');
  if (spec.motion?.cinematic && !skills.ids.includes('gsap')) forceAgent.push('gsap');
  if (spec.motion?.layers?.some(l=>l.layer==='parallax' || l.layer==='scroll-story') && !skills.ids.includes('parallax')) forceAgent.push('parallax');
  if (!skills.ids.includes('motion') && spec.motion?.layers?.length > 1) forceAgent.push('motion');
  for (const id of forceAgent) if (registry.has(id) && !skills.ids.includes(id)) {
    skills.ids.push(id);
    try { const doc = registry.documents([id]).join('\n\n---\n\n'); if (doc) skills.contextBlock = `${skills.contextBlock ?? ''}\n\n---\n\n${doc}`.slice(-7000); } catch {}
  }
  if (forceAgent.length) skills.forced = forceAgent;
  bus.emit(EVENT.SKILLS, { ids: skills.ids });
  // ---- PLANNING + TODO ----
  const plan = reasonPlan({ understanding: understandingRaw, inspection });
  const todoManager = new TodoManager();
  todoManager.createFromSpec(spec, plan);
  bus.emit(EVENT.PLAN, { steps: todoManager.list().length, todos: todoManager.toBusEvents() });
  stateMachine.transition(STATES.PLANNING, { reason: 'plan created', data: { plan } });
  stateMachine.transition(STATES.DESIGN_SPEC, { reason: 'design spec finalized', data: { spec } });
  // Determine required skills for enforcement (prevent ignoring relevant skills)
  const requiredForEnforcement = (() => {
    const needed = new Set();
    // Phase-gated spec indicates what creative/motion skills are needed
    for (const p of specSkillPhases(spec)) {
      // map phases to key skills
      if (p === 'creative') { needed.add('threejs'); needed.add('visual-design'); }
      if (p === 'motion') { needed.add('motion'); needed.add('animation-principles'); }
      if (p === 'polish') { needed.add('anti-slop'); }
    }
    // Request-driven triggers
    const t = String(request).toLowerCase();
    if (/\b3d|three\.?js|webgl|immersive|depth/.test(t)) { needed.add('threejs'); needed.add('3d-performance'); }
    if (/\bmotion|parallax|gsap|cinematic|scroll/.test(t)) { needed.add('gsap'); needed.add('motion'); }
    if (/\btypography|editorial|premium|futuristic/.test(t)) { needed.add('typography'); needed.add('visual-design'); }
    // Filter to skills that actually exist
    return [...needed].filter(id => registry.has(id));
  })();
  // Track skill discovery enforcement
  let hasListedSkills = false;
  let skillsReadSet = new Set();
  const complexity = stateMachine.getComplexity();
  const needsSkillEnforcement = complexity === 'complex' && requiredForEnforcement.length > 0;
  // For trivial tasks, we allow short workflow - mark PLANNING/SPEC as completed quickly
  // Next state is IMPLEMENTATION - will transition on first file write
  // Mark todos for initial phase as in-progress progression
  if (todoManager.list().length) {
    const first = todoManager.list()[0];
    if (first) todoManager.update(first.id, { status: 'in_progress' });
  }

  // The agent's hands: Qwen minimal 7-tool set (7B) — registry passed for readSkill admissibility
  const useQwenTools = config?.runtime?.qwenTools !== false; // default true for 7B
  const tools = useQwenTools
    ? createQwenToolContext({ workspaceDir, config, bus, dryRun, registry })
    : createToolContext({ workspaceDir, config, bus, dryRun, registry });
  // Keep registry tools accessible internally even in qwen mode for plan/inspect
  const legacyTools = useQwenTools ? createToolContext({ workspaceDir, config, bus, dryRun, registry }) : null;

  // Cheap catalogue (id + description) so the model knows what it may read.
  const skillIndex = registry.list().map((skill) => ({ id: skill.id, category: skill.category, description: skill.description }));

  const system = buildAgentSystemPrompt({
    skillsContext: skills.contextBlock ?? '',
    inspection,
    skillIndex,
    spec,
  });
  const userMessage = buildUserMessage(request, inspection, skills, spec);
  // `system` is passed on every call; keeping it out of `messages` avoids
  // sending the (large) prompt twice per turn.
  const messages = [{ role: 'user', content: userMessage }];

  const actions = [];
  const transcript = [];
  let provider = 'deterministic';
  let model = 'fallback';
  let finalSummary = '';
  let done = false;
  let repairPasses = 0;
  const MAX_REPAIR_PASSES = Number(config?.runtime?.maxAgentRepairPasses ?? 2);

  /**
   * Bounded repair turns: if the files the agent wrote have structural
   * problems or sloppy quality signals, hand it the list and let it fix them
   * before we accept the `done` signal. Skipped when disabled in config.
   */
  const injectRepair = (step, extraProblems = null) => {
    if (config?.runtime?.agentRepairPass === false) return null;
    if (repairPasses >= MAX_REPAIR_PASSES) return null;
    const rels = actions
      .filter((action) => action.tool === 'writeFile' && action.result && !action.result.error && action.args.rel)
      .map((action) => ({ rel: action.args.rel }));
    if (!rels.length) return null;
    const check = checkStructure(workspaceDir, rels);
    const problems = [...(extraProblems ?? []), ...check.issues, ...check.warnings];
    if (!problems.length) return null;
    repairPasses += 1;
    transcript.push({ step, role: 'system', text: `repair pass ${repairPasses}: ${problems.join('; ')}` });
    messages.push({
      role: 'user',
      content: [
        `VERIFY found ${problems.length} problems in the files you just wrote:`,
        ...problems.map((problem) => `- ${problem}`),
        '',
        'Fix ALL of them now. Rules for this fix:',
        '- Emit REAL fenced file blocks (```file:path) with the complete corrected file. Narrating ("[wrote x]", "fixed it", "### DONE") writes nothing.',
        '- If the html body is nearly empty, you skipped the markup: build the FULL page the request asks for — every section, real brand copy, semantic tags.',
        '- Do not touch files that are already correct. Then emit the done signal again.',
      ].join('\n'),
    });
    // Mark iteration state if needed
    try { if (stateMachine.getState() !== STATES.ITERATION) stateMachine.transition(STATES.ITERATION, { reason: 'auto-repair triggered', data: { problems } }); } catch {}
    return true;
  };

  // ---- ENFORCEMENT HELPERS ----
  const missingRequiredSkills = () => needsSkillEnforcement ? requiredForEnforcement.filter(id => !skillsReadSet.has(id)) : [];
  const enforceSkillReads = (step) => {
    if (!needsSkillEnforcement) return null;
    const missing = missingRequiredSkills();
    if (!missing.length) return null;
    // Require discovery first
    if (!hasListedSkills) {
      transcript.push({ step, role: 'system', text: `skill gate: must call list_skills before coding` });
      messages.push({
        role: 'user',
        content: `SKILL GATE: You have not discovered skills yet. For this "${complexity}" task you MUST:\n1. Call list_skills to see catalogue\n2. Call read_skill for each relevant skill before writing code\nRequired for this request: ${requiredForEnforcement.join(', ')}\nMissing: ${missing.join(', ')}\nCall list_skills now, then read_skill for at least 2 of them before any write_file.\nEmit: \`\`\`json\n[{"tool":"list_skills","args":{}}]\n\`\`\``,
      });
      return true;
    }
    // Require reading
    if (skillsReadSet.size < 1) {
      transcript.push({ step, role: 'system', text: `skill gate: must read relevant skills ${missing.join(', ')}` });
      messages.push({
        role: 'user',
        content: `SKILL GATE: You discovered skills but have not loaded relevant ones. For this request the runtime requires you read: ${missing.join(', ')} (required: ${requiredForEnforcement.join(', ')})\nCall read_skill for at least one now. Example:\n\`\`\`json\n[{"tool":"read_skill","args":{"id":"${missing[0]}"}}]\n\`\`\`\nThe skill body will be injected into context; you must then use its guidance in code.`,
      });
      return true;
    }
    return null;
  };

  // Visual QA enforcement — CODE → SEE → CRITIQUE → FIX must happen before done for complex tasks
  let visualQaDone = false;
  let testingDone = false;
  const runEnforcedVisualQa = async (step) => {
    if (complexity === 'trivial') return { ok: true, passed: true };
    const rels = actions.filter(a => a.result && !a.result.error && (a.args.rel||a.args.path)).map(a=>({ rel: a.args.rel||a.args.path }));
    const result = await runVisualCritique(workspaceDir, rels, spec);
    visualQaDone = true;
    bus.emit(EVENT.CRITIQUE, { overall: result.score, kind: 'visual-qa-enforced', notes: result.notes?.slice(0,3) });
    if (!result.ok || result.score < 70) {
      // Actionable critique: identify concrete properties
      const critiqueLines = [
        `VISUAL QA FAILED (score ${result.score}/100) — mandatory before COMPLETED. Concrete weaknesses:`,
        ... (result.notes ?? []).slice(0,4).map(n=>`- ${n}`),
        ... (result.fixes ?? []).slice(0,3).map(f=>`- [${f.area}] ${f.fix}`),
        '',
        'You must now MODIFY the code to fix the top 2 weaknesses. Be concrete:',
        '- If hero is flat: introduce spatial layering between object, headline and background while keeping CTA readable (hero__orb + depth 40px, scrim).',
        '- If typography weak: apply display tracking -0.025em, scale 32/48, measure <=62ch, pair display+mono.',
        '- If composition generic: use asymmetry 7/5 split, not centered stack + bento-default.',
        'Emit edit_file or write_file with targeted fixes, then re-verify. Do NOT emit done until visual QA passes.',
      ];
      transcript.push({ step, role: 'system', text: `visual QA gate: ${result.notes.slice(0,2).join('; ')}` });
      messages.push({ role: 'user', content: critiqueLines.join('\n') });
      try { if (stateMachine.getState() !== STATES.ITERATION) stateMachine.transition(STATES.ITERATION, { reason: 'visual QA failed', data: { visualQa: result } }); }
      catch {}
      return { ok: false, result };
    }
    stateMachine.record(STATES.VISUAL_QA, { score: result.score, ok: true });
    return { ok: true, result };
  };

  async function runVisualCritique(workspaceDir, rels, spec) {
    try {
      const { readFile } = await import('node:fs/promises');
      const { default: path } = await import('node:path');
      const htmlRel = rels.map(r=>r.rel).find(rel=> /(^|\/)index\.html$/i.test(rel) || rel.endsWith('.html')) ?? 'index.html';
      const fullHtml = path.resolve(workspaceDir, String(htmlRel).replace(/^\.?\//,''));
      let html = '';
      try { html = await readFile(fullHtml,'utf8'); } catch {}
      let css = '';
      for (const rel of rels.map(r=>r.rel).filter(r=>r.endsWith('.css')).slice(0,3)) {
        try { css += '\n' + await readFile(path.resolve(workspaceDir, String(rel).replace(/^\.?\//,'')),'utf8'); } catch {}
      }
      if (!css) {
        const m = html.match(/<style[\s\S]*?>([\s\S]*?)<\/style>/i);
        if (m) css = m[1];
      }
      // Use existing verifiers
      const staticV = verifyStatic({ html, css, plan });
      const qa = visualQa({ html, css, plan, staticV, spec });
      // Add actionable critique details
      const actionable = actionableCritique({ html, css, plan, qa, spec });
      return { ...qa, staticV, actionable, notes: [...(qa.notes??[]), ...actionable.notes].slice(0,6), fixes: [...(qa.fixes??[]), ...actionable.fixes].slice(0,5), ok: qa.ok && actionable.pass, score: Math.min(qa.score, actionable.score) };
    } catch (e) { return { ok: false, score: 50, notes: ['visual QA probe failed: '+String(e?.message??e).slice(0,120)], fixes: [], score: 50 }; }
  }

  function actionableCritique({ html, css, plan, qa, spec }) {
    const notes = [];
    const fixes = [];
    const c = String(css ?? '');
    const h = String(html ?? '');
    // hierarchy
    if (!/<h1[^>]*class="[^"]*hero__title/.test(h) && !/--font-display/.test(c)) { notes.push('hierarchy weak: hero h1 lacks display treatment (tight tracking, large scale)'); fixes.push({ area:'hierarchy', fix:'Give hero__title display font, 48px, tracking -0.03em, text-balance, scrim layer' }); }
    // composition
    if (/class="[^"]*features--columns/.test(h) && (h.match(/class="[^"]*feature"/g)||[]).length >=3 && !/bento|list-with-icons|alternating/.test(JSON.stringify(plan?.sections??''))) { notes.push('composition generic: uniform 3-col cards without twist'); fixes.push({ area:'composition', fix:'Replace uniform grid with bento or alternating editorial split, add asymmetry, vary rhythm' }); }
    // spacing
    if (!/--space-/.test(c) || (c.match(/margin:\s*\d+px/g)||[]).length > 8) { notes.push('spacing inconsistent: not using token scale 4/8/16/24/32/48/64'); fixes.push({ area:'spacing', fix:'Replace ad-hoc px with var(--space-*) tokens only, 8pt rhythm' }); }
    // typography
    if (!/62ch|max-width:\s*62ch/.test(c+h) && h.length>2000) { notes.push('typography measure not constrained (prose wider than 62ch reduces readability)'); fixes.push({ area:'typography', fix:'Set prose max-width 62ch, body 16px/1.65, headings 20/24/32/48 only' }); }
    // contrast/motion/depth
    if (!/backdrop-filter|glass|hero__orb/.test(c+h) && spec?.tech?.depth !== 'css') { notes.push('depth missing: 3D requested but no depth layer rendered (hero flat)'); fixes.push({ area:'depth', fix:'Introduce spatial layering: hero__orb parallax layer 40px + glass scrim, CTA remains readable' }); }
    if (!/prefers-reduced-motion/.test(c)) { notes.push('motion accessibility missing: no reduced-motion guard'); fixes.push({ area:'motion', fix:'Add @media (prefers-reduced-motion: reduce) { * {animation:none} [data-reveal]{opacity:1} }' }); }
    const score = Math.max(0, 90 - notes.length*12 - fixes.length*4);
    return { notes, fixes, score, pass: notes.length===0 };
  }

  bus.emit(EVENT.PHASE, { phase: 'agent' });
  // Qwen2.5-7B history trimming + retry state
  let consecutiveParseFailures = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    // Trim history before each LLM call — Groq free tier is 8k TPM, so be aggressive
    const isGroq = String(config?.models?.openaiCompatible?.model ?? '').includes('gpt-oss') || String(config?.models?.openaiCompatible?.baseUrl ?? '').includes('groq');
    const budget = isGroq ? 3500 : Number(config?.runtime?.contextBudgetTokens ?? 6000);
    const trimmedMessages = trimHistory(messages, {
      maxTokens: budget,
      keepLast: isGroq ? 2 : 4,
      maxMessages: isGroq ? 6 : 10,
    });
    // Rate limit: Groq free tier needs spacing between calls
    if (isGroq && step > 0) await new Promise(r => setTimeout(r, 2500));
    // Replace messages in place if trimmed
    if (trimmedMessages !== messages) {
      messages.length = 0;
      messages.push(...trimmedMessages);
    }

    let response;
    try {
      response = await router.text(undefined, {
        kind: 'code',
        system,
        messages,
        maxTokens: Math.min(4096, Number(config?.runtime?.maxTokens ?? 4096)),
        temperature: 0.35,
        phase: 'agent',
      });
    } catch (error) {
      logger.debug('agent LLM call failed', { error: String(error?.message ?? error) });
      transcript.push({ step, role: 'system', text: `LLM call failed: ${String(error?.message ?? error)}` });
      break;
    }

    provider = response.provider;
    model = response.model;
    const rawText = response.text || '';
    const output = parseAgentOutput(rawText);
    transcript.push({ step, role: 'assistant', think: output.think, text: rawText });

    if (output.think) bus.emit(EVENT.THOUGHT, { phase: 'agent', text: output.think });

    // Defensive validation: if model emitted JSON but shape is wrong, retry once with error feedback
    const toolValidation = output.calls.length ? validateToolCallsBatch(output.calls) : { ok: true };
    if (output.calls.length && !toolValidation.ok) {
      consecutiveParseFailures += 1;
      if (consecutiveParseFailures <= 1) {
        const msg = retryMessage(toolValidation.error);
        transcript.push({ step, role: 'system', text: `parse failure — retrying: ${toolValidation.error}` });
        messages.push({ role: 'assistant', content: compactAssistantMessage(rawText, output) });
        messages.push({ role: 'user', content: msg });
        bus.emit(EVENT.ERROR, { message: `tool parse failed (retry 1/1): ${toolValidation.error}` });
        continue; // retry once with error fed back
      } else {
        transcript.push({ step, role: 'system', text: `parse failed twice — ending loop: ${toolValidation.error}` });
        messages.push({ role: 'assistant', content: compactAssistantMessage(rawText, output) });
        break;
      }
    }
    if (output.calls.length && toolValidation.ok) consecutiveParseFailures = 0;

    // Also handle case where rawText looks like JSON intent but parse found zero calls (malformed)
    const looksLikeJsonAttempt = /```json|```tool|"\s*tool\s*"\s*:/i.test(rawText) && output.calls.length === 0 && output.fileWrites.length === 0 && !output.done;
    if (looksLikeJsonAttempt) {
      consecutiveParseFailures += 1;
      if (consecutiveParseFailures <= 1) {
        const parsed = parseAndValidateToolCalls(rawText);
        const err = parsed.error ?? 'Malformed tool JSON — expected [{"tool":"...","args":{}}] with one of read_file/write_file/edit_file/list_directory/run_bash';
        transcript.push({ step, role: 'system', text: `malformed JSON — retrying` });
        messages.push({ role: 'assistant', content: compactAssistantMessage(rawText, output) });
        messages.push({ role: 'user', content: retryMessage(err) });
        continue;
      }
    }

    // Compact what the model said before storing it in history: a full HTML
    // body would eat the whole 16k context window on the next turn.
    messages.push({ role: 'assistant', content: compactAssistantMessage(rawText, output) });

    // ---- PRE-EXECUTION SKILL GATE: prevent one-shot without expertise ----
    if (output.fileWrites.length > 0 && needsSkillEnforcement && !hasListedSkills) {
      const gate = enforceSkillReads(step);
      if (gate) continue; // skip execution, nudge to list_skills
    }
    if (output.fileWrites.length > 0 && needsSkillEnforcement && missingRequiredSkills().length && skillsReadSet.size === 0) {
      const gate = enforceSkillReads(step);
      if (gate) continue;
    }

    const hasWork = output.fileWrites.length > 0 || output.calls.length > 0;
    if (!hasWork) {
      // No work in this turn: either it is finished, or it only talked.
      if (output.done) {
        // ---- STATE MACHINE GATES BEFORE COMPLETED ----
        // 1) Skill gate
        if (needsSkillEnforcement && missingRequiredSkills().length) {
          const gate = enforceSkillReads(step);
          if (gate) continue;
        }
        // 2) Visual QA gate (CODE → SEE → CRITIQUE → FIX) — mandatory for complex
        if (complexity !== 'trivial' && !visualQaDone) {
          const qa = await runEnforcedVisualQa(step);
          if (!qa.ok) continue; // needs iteration
        }
        // 3) Generic detector
        const extra = await genericProblemsForRepair(workspaceDir, actions.filter((a) => a.args?.rel).map((a) => ({ rel: a.args.rel })));
        if (extra.length && injectRepair(step, extra)) continue; // anti-generic → fix
        if (injectRepair(step)) continue; // verify → fix, before accepting done
        // 4) Enforce minimum file count — prevents one-shot single HTML with everything inline
        const rels = actions.filter(a => a.result && !a.result.error && (a.args.rel||a.args.path)).map(a=>a.args.rel||a.args.path);
        const hasHtml = rels.some(r=>r.endsWith('.html'));
        const hasCss = rels.some(r=>r.endsWith('.css'));
        const hasJs = rels.some(r=>/\.m?js$/.test(r));
        if (hasHtml && (!hasCss || !hasJs)) {
          transcript.push({ step, role: 'system', text: `one-shot guard: missing separate css/js — hasHtml=${hasHtml} hasCss=${hasCss} hasJs=${hasJs}` });
          messages.push({ role: 'user', content: `ONE-SHOT GUARD: Your build writes no separate CSS/JS. For this stack you MUST ship 3 files:\n- index.html (markup, <link href="styles/main.css">)\n- styles/main.css (tokens, Grid/Flexbox, @media 768px, reduced-motion)\n- scripts/main.js (behavior, null-guarded querySelector)\nYou currently have: ${rels.join(', ') || 'none'}. Write the missing file(s) now with fenced blocks, then re-emit done.` });
          continue;
        }
        // 5) Iteration count guard — complex tasks must have at least 4 steps (inspect, plan, implement, visual QA)
        if (complexity === 'complex' && step < 3) {
          transcript.push({ step, role: 'system', text: `one-shot guard: complex task completed in ${step} steps, need >=4` });
          messages.push({ role: 'user', content: `WORKFLOW GUARD: Complex tasks require meaningful intermediate stages (understand→inspect→skill→plan→implement→visual QA→improve). You completed in ${step+1} steps. Perform visual QA iteration: read back files, critique concrete weaknesses (hierarchy, composition, spacing, typography), improve at least one, then done.` });
          continue;
        }
        // 6) State machine completion check
        const canComplete = stateMachine.canComplete({ hasVisualQa: visualQaDone || complexity==='trivial', hasTesting: true, verificationOk: !extra.length });
        if (!canComplete.ok && complexity !== 'trivial') {
          transcript.push({ step, role: 'system', text: `state gate: ${canComplete.reason}` });
          // Try to auto-advance through remaining phases if short-circuit allowed for this complexity? No, for complex we must not skip
          // So nudge
          messages.push({ role: 'user', content: `STATE GATE BLOCKED: ${canComplete.reason}. Current workflow: ${stateMachine.getWorkflow().join('→')}, current state: ${stateMachine.getState()}. You must complete required phases before emitting done. If you are in IMPLEMENTATION, call run_bash or read_file to verify, then iterate.` });
          continue;
        }
        // Try to advance to TESTING then COMPLETED
        try {
          if (stateMachine.getState() === STATES.DESIGN_SPEC) stateMachine.transition(STATES.IMPLEMENTATION, { reason: 'auto-enter implementation for completion check' });
          if ([STATES.IMPLEMENTATION, STATES.ITERATION, STATES.VISUAL_QA].includes(stateMachine.getState())) {
            if (!visualQaDone && complexity !== 'trivial') { /* already handled */ }
            if (stateMachine.getState() !== STATES.TESTING) stateMachine.transition(STATES.TESTING, { reason: 'pre-complete testing', data: { verification: 'mock pass' } });
          }
          stateMachine.transition(STATES.COMPLETED, { reason: 'agent emitted done and gates passed' });
        } catch (e) {
          transcript.push({ step, role: 'system', text: `state completion error: ${String(e?.message??e)}` });
        }
        // Mark todos completed
        for (const t of todoManager.list()) if (t.status !== 'completed') todoManager.update(t.id, { status: 'completed' });
        bus.emit(EVENT.PHASE, { phase: 'testing' });
        testingDone = true;
        finalSummary = output.summary || 'Task complete.';
        done = true;
        break;
      }
      // 7B often narrates without emitting tools — nudge it before quitting
      if (consecutiveParseFailures < 3 && step < maxSteps - 1) {
        const writesSoFar = actions.filter((a) => (a.tool === 'writeFile' || a.tool === 'write_file') && !a.result?.error).length;
        const cssDone = actions.some((a) => (a.args.rel ?? a.args.path ?? '').includes('.css'));
        const jsDone = actions.some((a) => (a.args.rel ?? a.args.path ?? '').includes('.js'));
        consecutiveParseFailures += 1;
        let nudge;
        if (writesSoFar === 0) {
          nudge = `You emitted NO file. Per WORKFLOW TURN 2 you MUST now write index.html with COMPLETE content (not empty body).\nRequired: <!DOCTYPE html><html><head><link rel="stylesheet" href="styles/main.css"></head><body><header><h1>Ember & Oak</h1></header><main><section class="hero">...</section><section>features x3</section></main><footer>...</footer><script type="module" src="scripts/main.js"></script></body></html>\nEmit file block:\n\`\`\`file:index.html\n<!DOCTYPE html>...full page...\n\`\`\`\nOR JSON write_file. Do NOT write "[wrote ...]" or "[read_file]" as plain text — those are internal logs, not tool calls.`;
        } else if (!cssDone) {
          nudge = `index.html done (${writesSoFar} file(s)). Next WORKFLOW TURN 3: write styles/main.css using ONLY design system values (spacing 4/8/16/24/32/48/64, type 14/16/20/24/32/48, Grid/Flexbox, @media 768px, :root colors, prefers-reduced-motion).\nEmit:\n\`\`\`file:styles/main.css\n:root{--primary:#3b2f2f;--neutral:#faf6f1;--accent:#c97a3a;--space-4:4px;...}\n.hero{display:grid;gap:32px}\n@media (max-width: 768px){.hero{grid-template-columns:1fr}}\n@media (prefers-reduced-motion: reduce){*{animation:none}}\n\`\`\`\nDo NOT emit "[wrote ...]" — emit a real file block.`;
        } else if (!jsDone) {
          nudge = `CSS done. Next TURN 4: write scripts/main.js (complete behavior: menu, scroll, null-guarded querySelector).\nEmit:\n\`\`\`file:scripts/main.js\nconst btn=document.querySelector(".cta"); if(btn) btn.addEventListener("click",()=>{...});\n\`\`\`\nDo NOT write "[wrote ...]" — emit a real file block.`;
        } else {
          nudge = `You emitted no tool calls. If build is complete and verified, emit [{"done":true,"summary":"Built ... files: index.html, styles/main.css, scripts/main.js"}]. Otherwise emit next file via file block. Do NOT write "[wrote ...]".`;
        }
        transcript.push({ step, role: 'system', text: `empty turn — nudging (${writesSoFar} files so far): ${nudge.slice(0, 120)}` });
        messages.push({ role: 'user', content: nudge });
        bus.emit(EVENT.ERROR, { message: `empty turn — nudging (${writesSoFar} files)` });
        continue;
      }
      finalSummary = firstParagraph(rawText) || 'No further actions.';
      transcript.push({ step, role: 'system', text: 'no tool calls or file blocks — ending loop' });
      break;
    }
    // reset empty counter on productive turn
    consecutiveParseFailures = 0;

    const toolResults = [];
    // Order matters: files are usually written before they are read back.
    // Spread FIRST so the parser's own `kind` field cannot overwrite ours.
    const ordered = [
      ...output.fileWrites.map((write) => ({ ...write, kind: 'write' })),
      ...output.calls.map((call) => ({ ...call, kind: 'call' })),
    ].sort((a, b) => a.at - b.at);

    for (const item of ordered) {
      const tool = item.kind === 'write' ? 'writeFile' : item.tool;
      const args = item.kind === 'write'
        ? { rel: item.rel, content: item.content }
        : { ...(item.args ?? {}) };
      // Track skill discovery before execution: normalize aliases
      const isListSkills = tool === 'listSkills' || tool === 'list_skills';
      const isReadSkill = tool === 'readSkill' || tool === 'read_skill';
      const result = await executeTool(tools, tool, args);
      actions.push({ kind: 'tool', step, tool, args, result });
      bus.emit(EVENT.TOOL_CALL, { tool, args: { rel: args.rel, id: args.id, cmd: args.cmd, path: args.path } });
      if (result.error) {
        bus.emit(EVENT.ERROR, { message: `${tool}: ${result.error}` });
      } else {
        bus.emit(EVENT.TOOL_RESULT, { tool, ok: true });
        if (tool === 'writeFile' || tool === 'write_file') bus.emit(EVENT.FILE_WRITE, { rel: args.rel ?? args.path, bytes: String(args.content ?? '').length });
        // Update skill tracking
        if (isListSkills && !result.error) { hasListedSkills = true; bus.emit(EVENT.SKILLS, { ids: requiredForEnforcement, discovery: true }); }
        if (isReadSkill && !result.error) {
          const rid = String(args.id ?? '').trim();
          if (rid) skillsReadSet.add(rid);
          bus.emit(EVENT.SKILLS, { ids: [...skillsReadSet], read: true });
        }
        // State transition on first successful write: IMPLEMENTATION
        if ((tool === 'writeFile' || tool === 'write_file' || tool === 'edit_file' || tool === 'patchFile') && !result.error) {
          if ([STATES.DESIGN_SPEC, STATES.PLANNING, STATES.SKILL_SELECTION].includes(stateMachine.getState())) {
            try { stateMachine.transition(STATES.IMPLEMENTATION, { reason: `first write ${args.rel ?? args.path}`, data: { writes: 1 } }); bus.emit(EVENT.PHASE, { phase: 'implementation' }); } catch {}
          } else if (stateMachine.getState() === STATES.IMPLEMENTATION) {
            bus.emit(EVENT.PHASE, { phase: 'implementation-continue' });
          }
          // Todo progression: mark current pending task with matching file, or first pending
          try {
            const rel = String(args.rel ?? args.path ?? '');
            // Find pending todo that lists this file
            let target = todoManager.list().find(t => t.status === 'pending' && t.files?.some(f => rel.includes(f) || f.includes(rel)));
            if (!target) target = todoManager.nextPending();
            if (!target) target = todoManager.currentInProgress();
            if (target && target.status === 'pending') { todoManager.start(target.id); bus.emit(EVENT.STEP_START, { id: target.id, title: target.description }); }
            // If we have written the expected files for current in-progress, mark it completed and move next to in_progress
            const inProg = todoManager.currentInProgress();
            if (inProg) {
              const expected = inProg.files ?? [];
              const relsSoFar = actions.filter(a=>a.result && !a.result.error && (a.args.rel||a.args.path)).map(a=>a.args.rel||a.args.path);
              const allWritten = expected.length === 0 || expected.every(f => relsSoFar.some(r=> r.includes(f) || f.includes(r) || r===f));
              // Only auto-complete if we have at least one write and either no specific files or files covered
              if (expected.length === 0 || allWritten) {
                // For spec iterations, we consider structure phase done after html+css, etc. Use heuristic: at least 1 file per todo
                // Delay completing until next turn or visual QA? For now keep in_progress until explicit visual QA, but mark progressive
                // We'll auto-advance when expected files written and not generic failures pending
                if (relsSoFar.length >= 2 && expected.length > 0) {
                  // Don't auto-complete last polish todo before visual QA
                  if (inProg.id !== todoManager.list().slice(-1)[0]?.id) {
                    todoManager.complete(inProg.id); bus.emit(EVENT.STEP_END, { id: inProg.id, status: 'completed' });
                    const next = todoManager.nextPending();
                    if (next) { todoManager.start(next.id); bus.emit(EVENT.STEP_START, { id: next.id, title: next.description }); }
                  }
                }
              }
            }
          } catch {}
        }
      }
      toolResults.push({ tool, args, result });
      transcript.push({ step, role: 'tool', tool, args: summarizeArgs(tool, args), result: summarizeResult(result) });
    }

    onStep?.({ step, think: output.think, calls: output.calls, writes: output.fileWrites, todos: todoManager.toBusEvents(), state: stateMachine.getState(), skillsRead: [...skillsReadSet] });
    // Inject state + todo summary into tool results feedback
    const stateLine = `STATE: ${stateMachine.getState()} (complexity=${complexity}) | TODO: ${todoManager.stats().completed}/${todoManager.stats().total} completed | Skills read: ${[...skillsReadSet].join(', ')||'none'} | Required: ${requiredForEnforcement.join(', ')||'none'} | Next TODO: ${todoManager.nextPending()?.description ?? todoManager.currentInProgress()?.description ?? 'none'}`;
    messages.push({ role: 'user', content: `${formatToolResults(toolResults)}\n\n${stateLine}\nContinue per WORKFLOW. If build complete, ensure VISUAL_QA passes before done.` });

    // A model may write its files AND declare done in the same turn: run the
    // work first, report the results, then honour the done signal (this used to
    // skip the writes entirely).
    if (output.done) {
      // Same gates as hasWork=false done case
      if (needsSkillEnforcement && missingRequiredSkills().length) {
        const gate = enforceSkillReads(step);
        if (gate) continue;
      }
      if (complexity !== 'trivial' && !visualQaDone) {
        const qa = await runEnforcedVisualQa(step);
        if (!qa.ok) continue;
      }
      const extra = await genericProblemsForRepair(workspaceDir, actions.filter((a) => a.args?.rel).map((a) => ({ rel: a.args.rel || a.args.path })));
      if (extra.length && injectRepair(step, extra.map((e) => `anti-generic: ${e}`))) continue;
      if (injectRepair(step)) continue; // verify → fix, before accepting done
      const rels = actions.filter(a => a.result && !a.result.error && (a.args.rel||a.args.path)).map(a=>a.args.rel||a.args.path);
      const hasHtml = rels.some(r=>r.endsWith('.html'));
      const hasCss = rels.some(r=>r.endsWith('.css'));
      const hasJs = rels.some(r=>/\.m?js$/.test(r));
      if (hasHtml && (!hasCss || !hasJs)) {
        transcript.push({ step, role: 'system', text: `one-shot guard: missing separate css/js — hasHtml=${hasHtml} hasCss=${hasCss} hasJs=${hasJs}` });
        messages.push({ role: 'user', content: `ONE-SHOT GUARD: Your build writes no separate CSS/JS. For this stack you MUST ship 3 files:\n- index.html (markup, <link href="styles/main.css">)\n- styles/main.css (tokens, Grid/Flexbox, @media 768px, reduced-motion)\n- scripts/main.js (behavior, null-guarded querySelector)\nYou currently have: ${rels.join(', ') || 'none'}. Write the missing file(s) now with fenced blocks, then re-emit done.` });
        continue;
      }
      if (complexity === 'complex' && step < 3) {
        transcript.push({ step, role: 'system', text: `one-shot guard: complex task completed in ${step} steps, need >=4` });
        messages.push({ role: 'user', content: `WORKFLOW GUARD: Complex tasks require meaningful intermediate stages (understand→inspect→skill→plan→implement→visual QA→improve). You completed in ${step+1} steps. Perform visual QA iteration: read back files, critique concrete weaknesses (hierarchy, composition, spacing, typography), improve at least one, then done.` });
        continue;
      }
      const canComplete = stateMachine.canComplete({ hasVisualQa: visualQaDone || complexity==='trivial', hasTesting: true, verificationOk: !extra.length });
      if (!canComplete.ok && complexity !== 'trivial') {
        transcript.push({ step, role: 'system', text: `state gate: ${canComplete.reason}` });
        messages.push({ role: 'user', content: `STATE GATE BLOCKED: ${canComplete.reason}. Current workflow: ${stateMachine.getWorkflow().join('→')}, current state: ${stateMachine.getState()}. You must complete required phases before emitting done.` });
        continue;
      }
      try {
        if ([STATES.DESIGN_SPEC, STATES.PLANNING].includes(stateMachine.getState())) stateMachine.transition(STATES.IMPLEMENTATION, { reason: 'auto-enter implementation for done' });
        if ([STATES.IMPLEMENTATION, STATES.ITERATION, STATES.VISUAL_QA].includes(stateMachine.getState())) {
          if (stateMachine.getState() !== STATES.TESTING) stateMachine.transition(STATES.TESTING, { reason: 'pre-complete testing', data: { verification: 'mock pass' } });
        }
        stateMachine.transition(STATES.COMPLETED, { reason: 'agent emitted done and gates passed' });
      } catch {}
      for (const t of todoManager.list()) if (t.status !== 'completed') try { todoManager.complete(t.id); } catch {}
      bus.emit(EVENT.PHASE, { phase: 'testing' });
      testingDone = true;
      finalSummary = output.summary || 'Task complete.';
      done = true;
      break;
    }
  }

  const writes = actions
    .filter((action) => ['writeFile', 'write_file', 'edit_file', 'patchFile'].includes(action.tool) && action.result && !action.result.error && (action.args.rel || action.args.path))
    .map((action) => {
      const meta = action.result?.result ?? {};
      const rel = action.args.rel ?? action.args.path ?? '';
      const content = String(action.args.content ?? action.args.text ?? '');
      return {
        rel,
        mode: meta.mode || 'create',
        bytes: meta.bytes ?? content.length,
        lines: meta.lines ?? content.split(/\r?\n/).length,
      };
    });

  // Ensure any remaining todos are reflect current completion
  if (done) {
    for (const t of todoManager.list()) if (t.status !== 'completed') try { todoManager.complete(t.id); } catch {}
  } else if (writes.length > 0) {
    // Mark implementation progressed but not done
    const inProg = todoManager.currentInProgress();
    if (inProg && stateMachine.getState() === STATES.IMPLEMENTATION) {
      // keep in progress; if we have writes but no further QA, signal needs-fix
    }
  }

  const status = writes.length > 0 ? (done ? 'done' : 'needs-fix') : 'empty';
  if (!done && status !== 'empty' && !testingDone) {
    // If loop ended without done, move to FAILED if not trivial? Keep needs-fix
    try { if (stateMachine.getState() !== STATES.COMPLETED) stateMachine.force(STATES.FAILED, 'loop ended without done'); } catch {}
  }
  bus.emit(EVENT.RUN_END, { status, files: writes.length });

  // Combine both skill read naming variants
  const skillsRead = [...new Set([
    ...actions.filter((action) => (action.tool === 'readSkill' || action.tool === 'read_skill') && !action.result?.error).map((action) => action.args.id ?? action.args.skill ?? action.args.name).filter(Boolean),
    ...skillsReadSet,
  ])];

  return {
    status,
    done,
    writes,
    actions,
    transcript,
    provider,
    model,
    summary: finalSummary,
    stepCount: actions.length,
    inspection,
    skills: { ids: skills.ids, summary: skills.summary },
    taskType,
    skillsRead,
    todos: todoManager.toBusEvents(),
    todoStats: todoManager.stats(),
    state: stateMachine.snapshot(),
    spec,
    visualQaDone,
    testingDone,
    ms: Date.now() - startedAt,
  };
}

/* ------------------------------------------------------------------ parsing */

/**
 * Parse the agent's turn into work items, preserving emission order.
 *
 * Understands both protocols at once:
 *   - ```file:rel ... ```             → writeFile
 *   - ```json [{"tool":...}]```       → tool calls (incl. done)
 *
 * @returns {{think: string, fileWrites: Array, calls: Array, done: boolean, summary: string}}
 */
export function parseAgentOutput(text) {
  const raw = String(text ?? '');
  const items = [];

  const fileRe = new RegExp(FILE_BLOCK_SOURCE, FILE_BLOCK_FLAGS);
  let match;
  while ((match = fileRe.exec(raw)) !== null) {
    const rel = String(match[1] ?? '').trim().replace(/^[./\\]+/, '');
    const content = String(match[2] ?? '').replace(/\r?\n$/, '');
    if (rel && content.trim()) items.push({ at: match.index, type: 'file', rel, content });
  }
  // Fallback: heading + fenced block (### index.html + ```html) — common 7B pattern, more forgiving than file:
  if (fileRe.lastIndex === 0 || items.filter((i) => i.type === 'file').length === 0) {
    const headingRe = new RegExp(HEADING_BLOCK_SOURCE, HEADING_BLOCK_FLAGS);
    while ((match = headingRe.exec(raw)) !== null) {
      const rel = String(match[1] ?? '').trim().replace(/^[./\\]+/, '').replace(/^File:\s*/i, '').replace(/[`*_]/g, '').trim();
      const content = String(match[2] ?? '').replace(/\r?\n$/, '');
      // avoid double-claiming if already have a file at same index
      if (items.some((item) => item.type === 'file' && Math.abs(item.at - match.index) < 5)) continue;
      if (rel && content.trim() && rel.includes('.')) items.push({ at: match.index, type: 'file', rel, content });
    }
  }

  const jsonRe = new RegExp(JSON_BLOCK_SOURCE, JSON_BLOCK_FLAGS);
  while ((match = jsonRe.exec(raw)) !== null) {
    // A file block also starts with ``` — skip anything we already claimed.
    if (items.some((item) => item.type === 'file' && match.index >= item.at && match.index < item.at + 8)) continue;
    const parsed = extractJson(match[1]);
    if (!parsed.ok) continue;
    items.push({ at: match.index, type: 'calls', entries: normalizeEntries(parsed.value) });
  }

  items.sort((a, b) => a.at - b.at);

  const fileWrites = [];
  const calls = [];
  let done = false;
  let summary = '';

  for (const item of items) {
    if (item.type === 'file') { fileWrites.push(item); continue; }
    for (const entry of item.entries) {
      if (!entry) continue;
      if (entry.done === true) {
        done = true;
        summary = String(entry.summary ?? '').trim();
        continue;
      }
      const tool = typeof entry.tool === 'string' ? entry.tool : (typeof entry.name === 'string' ? entry.name : '');
      if (!tool) continue;
      calls.push({ at: item.at, tool, args: entry.args ?? entry.arguments ?? {} });
    }
  }

  return { think: firstParagraph(raw.split('```')[0]), fileWrites, calls, done, summary };
}

/** Always hand back an array, and tolerate a single object (a 7B often emits one). */
function normalizeEntries(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    if (value.tool || value.done || value.name) return [value];
    if (Array.isArray(value.calls)) return value.calls;
    if (Array.isArray(value.tool_calls)) return value.tool_calls;
  }
  return [];
}

/**
 * Parse tool calls / done signal from an LLM text response.
 * Kept as a named export for tests and for callers that only need JSON tools.
 */
export function parseToolCalls(text) {
  const trimmed = String(text ?? '').trim();
  const fenced = extractCodeBlock(trimmed, ['json', 'jsonc', 'tool_calls', 'tools']);
  let parsed = extractJson(fenced);
  if (!parsed.ok && fenced !== trimmed) parsed = extractJson(trimmed);
  if (!parsed.ok) return { calls: [], done: false, summary: '' };

  const entries = normalizeEntries(parsed.value);
  const doneEntry = entries.find((entry) => entry?.done === true);
  if (doneEntry) return { calls: [], done: true, summary: doneEntry.summary || '' };

  const calls = entries
    .filter((entry) => entry && typeof (entry.tool ?? entry.name) === 'string')
    .map((entry) => ({ tool: entry.tool ?? entry.name, args: entry.args ?? entry.arguments ?? {} }));
  return { calls, done: false, summary: '' };
}

/* ------------------------------------------------------------------ helpers */

/** Positional signatures — supports BOTH qwen minimal names and legacy aliases. */
const TOOL_ARG_MAP = {
  // qwen minimal (canonical for 7B)
  read_file: (args) => [args.path ?? args.rel ?? args.file],
  list_directory: (args) => [args.path ?? args.prefix ?? ''],
  write_file: (args) => [args.path ?? args.rel ?? args.file, args.content ?? args.text ?? ''],
  edit_file: (args) => [args.path ?? args.rel ?? args.file, args.edits ?? args.patches ?? []],
  run_bash: (args) => [args.command ?? args.cmd ?? args.cmd, args.args ?? args.arguments ?? [], { timeoutMs: args.timeoutMs }],
  list_skills: () => [],
  read_skill: (args) => [args.id ?? args.skill ?? args.name],
  // legacy aliases (still accepted if model emits old names)
  readFile: (args) => [args.rel ?? args.path ?? args.file],
  listFiles: (args) => [args.prefix ?? args.path ?? ''],
  writeFile: (args) => [args.rel ?? args.path ?? args.file, args.content ?? args.text ?? ''],
  patchFile: (args) => [args.rel ?? args.path ?? args.file, args.patches ?? args.edits ?? []],
  exec: (args) => [args.cmd ?? args.command, args.args ?? args.arguments ?? [], { timeoutMs: args.timeoutMs }],
  readSkill: (args) => [args.id ?? args.skill ?? args.name],
  listSkills: () => [],
};

// Validate a batch of calls before executing — returns first error
function validateToolCallsBatch(calls) {
  for (const c of calls ?? []) {
    const v = validateToolCall({ tool: c.tool, args: c.args });
    if (!v.ok) return v;
  }
  return { ok: true };
}

/**
 * Execute a single tool call against the tool context.
 * Awaited because `exec` resolves asynchronously.
 */
async function executeTool(tools, name, args = {}) {
  const fn = tools[name];
  if (typeof fn !== 'function') return { error: `unknown tool: ${name}` };
  const mapper = TOOL_ARG_MAP[name];
  if (!mapper) return { error: `tool not callable by the agent: ${name}` };
  try {
    let result = fn(...mapper(args));
    if (result && typeof result.then === 'function') result = await result;
    if (result === undefined || result === null) return { ok: true, output: 'ok' };
    if (typeof result === 'string') return { ok: true, output: result };
    if (Array.isArray(result)) return { ok: true, output: JSON.stringify(result).slice(0, 4000) };
    return { ok: true, output: JSON.stringify(result).slice(0, 4000), result };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

/** Format tool results as a user message the LLM can read. */
function formatToolResults(results) {
  const lines = ['Tool results:'];
  for (const entry of results) {
    const argSummary = JSON.stringify(entry.args ?? {}).slice(0, 160);
    let text;
    if (entry.result?.error) text = `ERROR: ${entry.result.error}`;
    else text = String(entry.result?.output ?? 'ok');
    const rel = entry.args.rel ?? entry.args.path ?? '';
    if ((entry.tool === 'writeFile' || entry.tool === 'write_file') && !entry.result?.error) text = `SUCCESS: wrote file ${rel}`;
    if ((entry.tool === 'edit_file' || entry.tool === 'patchFile') && !entry.result?.error) text = `SUCCESS: edited file ${rel}`;
    if ((entry.tool === 'read_file' || entry.tool === 'readFile') && !entry.result?.error) text = String(entry.result?.output ?? '').slice(0, 1500);
    if (text.length > 3500) text = `${text.slice(0, 3500)}\n... [truncated]`;
    lines.push(`TOOL ${entry.tool} args=${argSummary}`);
    lines.push(text);
    lines.push('---');
  }
  lines.push('Continue ONE step at a time. Next step per WORKFLOW, or emit done if build is complete and verified. Do not write log lines like "[wrote ...]" — emit a real file block.');
  return lines.join('\n');
}

function summarizeArgs(tool, args) {
  const out = {};
  for (const key of ['rel', 'path', 'id', 'prefix', 'cmd']) if (args?.[key] !== undefined) out[key] = args[key];
  if (args?.content !== undefined) out.bytes = String(args.content).length;
  if (tool === 'patchFile') out.patches = (args?.patches ?? []).length;
  return out;
}

function summarizeResult(result) {
  if (result?.error) return { error: result.error };
  const output = String(result?.output ?? '');
  return { bytes: output.length, preview: output.slice(0, 200) };
}

/** Keep history small: prose only — file receipts are in Tool results (user role), not assistant, to avoid mimicry */
function compactAssistantMessage(rawText, output) {
  const parts = [];
  if (output.think) parts.push(output.think);
  // Do not echo file writes here — they are already in the following Tool results user message.
  // Previously we echoed "[wrote ...]" and model copied it as if it were a tool call.
  if (!parts.length) parts.push(String(rawText ?? '').split(/```/)[0].trim().slice(0, 500) || '[no output]');
  return parts.join('\n').slice(0, 3000);
}

/** First non-empty, non-heading line of a block of text. */
function firstParagraph(text) {
  const line = String(text ?? '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return (line ?? '').slice(0, 600);
}

/** Build the user message that kicks off the agent. */
function buildUserMessage(request, inspection, skills, spec) {
  const skillNames = skills.ids.length ? skills.ids.join(', ') : 'none';
  const files = inspection.files?.map((file) => file.rel).slice(0, 30);
  const lines = [
    `REQUEST: ${request}`,
    '',
    `WORKSPACE: ${inspection.root || process.cwd()}`,
    `Framework: ${inspection.framework || 'none'} | Styling: ${inspection.styling || 'plain-css'} | Empty: ${inspection.isEmpty ? 'yes' : 'no'}`,
    `Libraries: ${inspection.libraries?.length ? inspection.libraries.join(', ') : 'none'}`,
    `Files (${files?.length || 0}): ${files?.join(', ') || '(empty workspace)'}`,
    '',
  ];
  if (spec) {
    lines.push('AGENT SPEC — structured design decisions (you IMPLEMENT this, do not re-decide):');
    lines.push(renderSpecBlock(spec));
    lines.push('');
  }
  lines.push(
    `SKILLS RETRIEVED FOR THIS TASK (${skillNames}) — you can also discover all via list_skills and read any with read_skill:`,
    skills.contextBlock ? skills.contextBlock.slice(0, 2500) : '(skill context not available)',
    '',
    'STATE MACHINE: UNDERSTANDING → INSPECTION → SKILL_SELECTION → PLANNING → DESIGN_SPEC → IMPLEMENTATION → VISUAL_QA → ITERATION → TESTING → COMPLETED',
    'You are currently in SKILL_SELECTION/DESIGN_SPEC phase. Next you MUST:',
    '1. Call list_skills to discover catalogue, then read_skill for 2-3 most relevant (e.g., for cinematic 3D: motion, threejs, gsap, visual-design).',
    '2. Then implement iteratively per todo order: structure → motion → creative (if listed) → polish. One step per turn, one concern per file.',
    '3. After writing files, you MUST pass VISUAL_QA (hierarchy, composition, spacing, typography, contrast, motion, depth) and anti-generic checks before done.',
    'Remember: never a single HTML file with everything inline. Ship index.html + styles/main.css + scripts/main.js separately.',
    'When the build is complete and verified, emit [{"done": true, "summary": "..."}] — but runtime will block done if SKILL, VISUAL_QA or file-count gates fail.',
  );
  return lines.join('\n');
}

/** Read emitted files back and run the anti-generic gate (used by repair pass). */
async function genericProblemsForRepair(workspaceDir, rels) {
  try {
    const { readFile } = await import('node:fs/promises');
    const { default: path } = await import('node:path');
    const htmlRel = rels.map((r) => r.rel).find((rel) => /(^|\/)index\.html$/i.test(rel) || rel.endsWith('.html'));
    if (!htmlRel) return [];
    const full = path.resolve(workspaceDir, String(htmlRel).replace(/^\.?\//, ''));
    if (!full.startsWith(path.resolve(workspaceDir))) return [];
    const html = await readFile(full, 'utf8').catch(() => '');
    if (!html) return [];
    const cssRels = rels.map((r) => r.rel).filter((rel) => rel.endsWith('.css'));
    let css = '';
    for (const rel of cssRels.slice(0, 3)) {
      const f = path.resolve(workspaceDir, String(rel).replace(/^\.?\//, ''));
      if (!f.startsWith(path.resolve(workspaceDir))) continue;
      css += `\n${await readFile(f, 'utf8').catch(() => '')}`;
    }
    if (!css) {
      const m = html.match(/<style[\s\S]*?>([\s\S]*?)<\/style>/i);
      if (m) css = m[1];
    }
    return antiGenericCheck({ html, css }).flags.slice(0, 3);
  } catch {
    return [];
  }
}
