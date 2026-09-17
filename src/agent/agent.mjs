/**
 * Artisan executor — the autonomous build phase.
 *
 * Input is a BRIEF (the agreed design context + mode + change requests), not a
 * loose sentence. The runtime drives explicit phases and enforces the gates;
 * the model does the creative and engineering reasoning inside each phase:
 *
 *   UNDERSTANDING   code   — task type, complexity, mode (create | refine)
 *   INSPECTION      code   — workspace scan (+ outline of the existing build)
 *   SKILL_SELECTION model  — picks skills from the catalogue + tech tier; runtime
 *                            validates, enforces required skills, loads bodies
 *   PLANNING        model  — design spec + structured TODOs (one JSON call);
 *   DESIGN_SPEC              runtime validates and adds mandatory QA tasks
 *   IMPLEMENTATION  model  — tool loop (file blocks + JSON tools), TODO progress
 *   VISUAL_QA       code+model — headless render, screenshots, metrics, critique
 *   ITERATION       model  — fixes the weaknesses the QA handed back
 *   TESTING         code   — structure, static checks, JS syntax, anti-generic
 *   COMPLETED              — only when every gate passed
 *
 * Output protocol (see ./prompts.mjs):
 *   - ```file:<rel> ... ```     → write file (preferred for large files)
 *   - ```json [{"tool":...}]``` → tools incl. update_todo / run_qa / done
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { silentLogger } from '../core/logger.mjs';
import { EventBus, EVENT } from '../core/events.mjs';
import { inspectWorkspace, summarizeInspection } from '../workspace/scanner.mjs';
import { createSkillRegistry } from '../skills/registry.mjs';
import { selectSkills, requiredSkillsFor } from '../skills/select.mjs';
import { createRouter } from '../model/router.mjs';
import { createQwenToolContext, validateToolCall } from '../tools/qwen-context.mjs';
import { classifyTaskType } from '../reason/understand.mjs';
import { extractCodeBlock, extractJson } from '../model/json.mjs';
import { checkStructure } from '../verify/agent-output.mjs';
import { verifyStatic } from '../verify/static.mjs';
import { antiGenericCheck } from '../verify/quality-gate.mjs';
import { buildAgentSystemPrompt, buildPlanPrompt } from './prompts.mjs';
import { buildDesignSpec, renderSpecBlock } from '../design/spec.mjs';
import { rankDirections } from '../design/directions.mjs';
import { trimHistory } from '../model/history-trim.mjs';
import { retryMessage } from '../model/tool-validator.mjs';
import { AgentStateMachine, STATES, detectComplexity } from '../runtime/state-machine.mjs';
import { TodoManager } from '../runtime/todo-manager.mjs';
import { normalizeAgreedContext, renderAgreedContext, directivesFromContext } from '../runtime/agreed-context.mjs';
import { chooseArtDirection, decorationFor, artDirectionBlock as renderArtDirectionBlock } from '../design/art-direction.mjs';
import { runVisualQa, renderFindingsForModel } from '../verify/visual-qa.mjs';
import { requirementsFromBrief } from '../verify/requirements.mjs';
import { readWorkspaceFile } from '../workspace/writer.mjs';

/* ---------------------------------------------------------------- grammar ---- */

const FILE_BLOCK_SOURCE = '^[ \\t]*```[ \\t]*(?:[a-z0-9_-]+[ \\t]+)*file:[ \\t]*([^\\s`]+)[ \\t]*\\r?\\n([\\s\\S]*?)^[ \\t]*```';
const HEADING_BLOCK_SOURCE = '^#{2,3}[ \\t]+([^\\n`]+\\.(?:html|css|js|mjs|jsx|ts|tsx))[ \\t]*\\r?\\n[ \\t]*```[ \\t]*(?:html|css|javascript|js|jsx|tsx)?[ \\t]*\\r?\\n([\\s\\S]*?)^[ \\t]*```';
const JSON_BLOCK_SOURCE = '^[ \\t]*```[ \\t]*(?:json|jsonc|tool_calls|tools|json5)[ \\t]*\\r?\\n([\\s\\S]*?)^[ \\t]*```';

/* ------------------------------------------------------------------ brief ---- */

export function normalizeBrief(input) {
  if (typeof input === 'string') return { request: input.trim(), mode: 'create', agreed: undefined, changeRequests: [] };
  const brief = input ?? {};
  const agreed = brief.agreed ? normalizeAgreedContext(brief.agreed) : undefined;
  const changeRequests = [...(brief.changeRequests ?? agreed?.changeRequests ?? [])].map(String).filter(Boolean);
  const mode = brief.mode ?? (agreed?.build ? 'refine' : 'create');
  return { request: String(brief.request ?? '').trim(), mode, agreed, changeRequests };
}

export function briefText(brief) {
  const parts = [];
  if (brief.mode === 'refine') {
    parts.push(`REFINE the existing implementation. Requested changes:\n${brief.changeRequests.map((r) => `- ${r}`).join('\n') || `- ${brief.request}`}`);
    if (brief.request && !brief.changeRequests.includes(brief.request)) parts.push(`Trigger message: ${brief.request}`);
  } else {
    parts.push(brief.request || (brief.agreed?.summary ?? brief.agreed?.project ?? '') || 'Build the agreed design.');
  }
  const block = brief.agreed ? renderAgreedContext(brief.agreed) : '';
  if (block) parts.push(block);
  return parts.join('\n\n');
}

/** Outline of what already exists so a refinement edits instead of rebuilding. */
function existingOutline(workspaceDir, inspection) {
  const files = (inspection.files ?? []).filter((f) => !f.rel.startsWith('.forge')).slice(0, 30);
  if (!files.length) return '';
  const lines = ['EXISTING FILES: ' + files.map((f) => `${f.rel} (${Math.round(f.size / 1024 * 10) / 10} KB)`).join(', ')];
  const htmlRel = inspection.primaryHtmlRel ?? files.find((f) => f.ext === '.html')?.rel;
  const html = htmlRel ? readWorkspaceFile(workspaceDir, htmlRel) ?? '' : '';
  if (html) {
    const sections = [...html.matchAll(/<(header|nav|main|section|article|aside|footer)\b([^>]*)>/gi)].slice(0, 20).map((m) => `${m[1]}${/id="([^"]+)"/.exec(m[2])?.[1] ? `#${/id="([^"]+)"/.exec(m[2])[1]}` : ''}${/class="([^"]+)"/.exec(m[2])?.[1] ? `.${/class="([^"]+)"/.exec(m[2])[1].split(/\s+/)[0]}` : ''}`);
    if (sections.length) lines.push(`${htmlRel} structure: ${sections.join(' > ')}`);
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
    if (h1) lines.push(`h1: "${h1.slice(0, 80)}"`);
  }
  const cssRel = files.find((f) => f.ext === '.css')?.rel;
  const css = cssRel ? readWorkspaceFile(workspaceDir, cssRel) ?? '' : '';
  if (css) {
    const tokens = [...css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)].slice(0, 28).map((m) => `--${m[1]}: ${m[2].trim().slice(0, 40)}`);
    if (tokens.length) lines.push(`${cssRel} tokens: ${tokens.join('; ')}`);
  }
  return lines.join('\n');
}

/* --------------------------------------------------------------- spec map ---- */

function specFromModel(value, { brief, tech, understanding, inspection }) {
  const s = value?.spec && typeof value.spec === 'object' ? value.spec : null;
  if (!s) return undefined;
  const str = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
  const t = value.tech && typeof value.tech === 'object' ? value.tech : {};
  const depth = ['css', 'threejs', 'r3f', 'shader'].includes(t.depth) ? t.depth : (tech.depth ?? 'css');
  const animation = ['css', 'vanilla', 'gsap'].includes(t.animation) ? t.animation : (tech.animation ?? 'vanilla');
  const directives = brief.agreed ? directivesFromContext(brief.agreed) : { avoid: [], emphasis: [] };
  const motionText = str(s.motion_language);
  const layers = [];
  if (/reveal|entrance|fade|rise|stagger/i.test(motionText)) layers.push({ layer: 'reveal', what: motionText.slice(0, 80), tech: animation });
  if (/scroll|scrub|pin|parallax/i.test(motionText)) layers.push({ layer: 'scroll', what: motionText.slice(0, 80), tech: animation });
  if (/hover|press|micro|cursor|magnetic/i.test(motionText)) layers.push({ layer: 'micro', what: 'hover/press states', tech: 'css' });
  return {
    source: 'model',
    taskType: understanding.taskType,
    feels: brief.agreed?.visualDirection?.slice(0, 4) ?? [],
    design: {
      project: brief.agreed?.product || brief.agreed?.project || understanding.subject,
      purpose: brief.agreed?.summary || brief.agreed?.purpose || understanding.subject,
      avoid: directives.avoid,
      emphasis: directives.emphasis,
      visual_direction: str(s.visual_direction),
      layout_strategy: str(s.layout_strategy),
      typography: str(s.typography),
      color_system: str(s.color_system),
      hero_concept: str(s.hero_concept),
      motion_language: motionText,
      '3d_strategy': str(s.depth_strategy ?? s['3d_strategy']),
      interaction_strategy: str(s.interaction_strategy),
      responsive_strategy: str(s.responsive_strategy),
      performance_constraints: str(s.performance_constraints),
      copy_direction: str(s.copy_direction),
    },
    motion: { layers, cinematic: animation === 'gsap', reducedMotion: true, seq: motionText },
    tech: { depth, animation, libraries: Array.isArray(t.libraries) ? t.libraries.map(String).slice(0, 6) : (tech.libraries ?? []), depthReason: str(t.why ?? tech.why), fallback: depth === 'css' ? 'pure CSS' : 'static layer when WebGL is unavailable or reduced motion', framework: inspection.framework ?? 'static' },
    files: Array.isArray(value.files) ? value.files.map(String).slice(0, 12) : [],
    plan: { iterations: [] },
  };
}

function deterministicSpec({ brief, text, understanding, inspection, tech }) {
  const ranked = rankDirections({ request: text, taskType: understanding.taskType, inspection, limit: 1 });
  const spec = buildDesignSpec({ request: text, understanding, direction: ranked[0]?.direction, inspection, agreed: brief.agreed ? directivesFromContext(brief.agreed) : {} });
  spec.source = 'deterministic';
  if (tech?.depth && tech.depth !== 'css' && spec.tech.depth === 'css') { spec.tech.depth = tech.depth; spec.tech.depthReason = tech.why || 'chosen during skill selection'; }
  if (tech?.animation === 'gsap') spec.tech.animation = 'gsap';
  return spec;
}

/* ------------------------------------------------------------------- tests ---- */

function runTests({ workspaceDir, rels, inspection, config }) {
  const issues = [];
  const warnings = [];
  const checks = {};
  const structure = checkStructure(workspaceDir, rels.map((rel) => ({ rel })));
  checks.structure = { ok: structure.ok, summary: structure.summary };
  issues.push(...(structure.issues ?? []).map((i) => `structure: ${i}`));
  warnings.push(...(structure.warnings ?? []).map((w) => `structure: ${w}`));
  const htmlRel = structure.files?.html ?? rels.find((r) => r.endsWith('.html'));
  const html = htmlRel ? readWorkspaceFile(workspaceDir, htmlRel) ?? '' : '';
  const css = (structure.files?.css ?? rels.filter((r) => r.endsWith('.css'))).map((r) => readWorkspaceFile(workspaceDir, r) ?? '').join('\n') || (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? '');
  if (html) {
    const staticV = verifyStatic({ html, css, plan: undefined });
    checks.static = { ok: staticV.ok, score: staticV.score, summary: staticV.summary };
    issues.push(...staticV.issues.filter((i) => i.severity === 'error' && i.check !== 'form-js').map((i) => `static: ${i.message}`));
    warnings.push(...staticV.issues.filter((i) => i.severity !== 'error').map((i) => `static: ${i.message}`));
    const generic = antiGenericCheck({ html, css });
    checks.antiGeneric = { pass: generic.pass, flags: generic.flags };
    warnings.push(...generic.flags.map((f) => `anti-generic: ${f}`));
  }
  const jsRels = rels.filter((r) => /\.(m?js)$/.test(r));
  const syntaxErrors = [];
  for (const rel of jsRels.slice(0, 12)) {
    try { execFileSync(process.execPath, ['--check', path.resolve(workspaceDir, rel)], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, timeout: 15000 }); }
    catch (error) { syntaxErrors.push(`${rel}: ${String(error?.stderr ?? error?.message ?? error).split('\n').slice(0, 3).join(' ').slice(0, 200)}`); }
  }
  checks.jsSyntax = { checked: jsRels.length, errors: syntaxErrors };
  issues.push(...syntaxErrors.map((e) => `js syntax: ${e}`));
  if (config?.verification?.runBuild !== false && inspection?.scripts?.build && inspection?.hasNodeModules) {
    try {
      execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build', '--silent'], { cwd: workspaceDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: Number(config?.verification?.devServerTimeoutMs ?? 90000), shell: process.platform === 'win32' });
      checks.build = { ok: true };
    } catch (error) {
      checks.build = { ok: false, error: String(error?.stderr ?? error?.message ?? error).slice(-600) };
      issues.push(`build: npm run build failed — ${checks.build.error.split('\n').slice(-3).join(' ').slice(0, 240)}`);
    }
  }
  return { ok: issues.length === 0, issues, warnings, checks };
}

/* ---------------------------------------------------------------- runAgent ---- */

/**
 * Run the executor on a brief.
 * @param {string|object} input  request string or { request, mode, agreed, changeRequests }
 */
export async function runAgent(input, {
  workspaceDir, config, bus: externalBus, logger: extLogger,
  maxSteps, dryRun = false, router: extRouter, registry: extRegistry, onStep, qaOutDir,
} = {}) {
  const bus = externalBus ?? new EventBus();
  const logger = extLogger ?? silentLogger;
  const router = extRouter ?? createRouter({ config, bus, logger });
  const registry = extRegistry ?? createSkillRegistry({ skills: config?.skills ?? {}, logger });
  const startedAt = Date.now();
  const brief = normalizeBrief(input);
  const text = briefText(brief);
  let stepBudget = Number(maxSteps ?? config?.runtime?.maxAgentSteps ?? 24);
  const transcript = [];
  const actions = [];
  const note = (step, msg) => transcript.push({ step, role: 'system', text: msg });

  // ---- UNDERSTANDING
  bus.emit(EVENT.PHASE, { phase: 'understand' });
  const requestForType = brief.mode === 'refine' ? `Refine existing: ${brief.changeRequests.join('. ') || brief.request}` : (brief.request || brief.agreed?.summary || brief.agreed?.project || text);
  const taskType = brief.mode === 'refine' ? 'enhance' : classifyTaskType(requestForType);
  const understanding = { taskType, subject: (brief.agreed?.summary || brief.agreed?.project || brief.request || '').slice(0, 120), mode: brief.mode };
  bus.emit(EVENT.THOUGHT, { phase: 'understand', text: `mode=${brief.mode} taskType=${taskType}` });

  // ---- INSPECTION
  bus.emit(EVENT.PHASE, { phase: 'inspect' });
  const inspection = inspectWorkspace(workspaceDir, config);
  bus.emit(EVENT.THOUGHT, { phase: 'inspect', text: summarizeInspection(inspection) });
  const outline = brief.mode === 'refine' || !inspection.isEmpty ? existingOutline(workspaceDir, inspection) : '';
  const stateMachine = new AgentStateMachine({ request: text, understanding, inspection });
  if (brief.mode === 'refine' && stateMachine.complexity === 'complex' && brief.changeRequests.join(' ').length < 160) stateMachine.complexity = 'standard';
  const complexity = stateMachine.getComplexity();
  bus.emit(EVENT.THOUGHT, { phase: 'state', text: `complexity=${complexity}` });
  stateMachine.transition(STATES.INSPECTION, { reason: 'workspace inspected', data: { files: inspection.fileCount } });

  // ---- ART DIRECTION: a concrete identity proposal the model can adopt, sharpen
  // or deliberately replace — so it never starts from a neutral default.
  const directives = brief.agreed ? directivesFromContext(brief.agreed) : {};
  const artChoice = chooseArtDirection({ request: text, agreed: directives, inspection, taskType, lockedId: brief.agreed?.build?.artDirection });
  const artDecoration = decorationFor(artChoice.direction, { request: text, agreed: directives });
  const artBlock = renderArtDirectionBlock(artChoice.direction, artDecoration);
  // What the brief literally asks for, so visual QA can check delivery rather
  // than just correctness. A page can pass every structural check and still be
  // missing the section the user described.
  const briefRequirements = requirementsFromBrief(brief.mode === 'refine' ? `${brief.changeRequests.join(' ')} ${brief.agreed?.purpose ?? ''}` : text);
  if (briefRequirements.length) bus.emit(EVENT.THOUGHT, { phase: 'requirements', text: `brief requires: ${briefRequirements.map((r) => r.label).join('; ')}` });

  // How much context can this brain afford per call? Known before planning, so
  // the expensive plan prompt can be sized to fit one token window instead of
  // stalling on the provider's rate limit.
  const tpm = await router.tokensPerMinute().catch(() => undefined);
  // A ROUTER's advertised window is not the backing model's window. groq/compound
  // publishes 70k tokens/minute and then dispatches to llama-4-scout, whose own
  // limit is far smaller: trusting the header sent ~40k-token turns that were
  // rejected on arrival, four retries deep, and the build fell back to the
  // deterministic engine looking like a model failure. So the size of ONE request
  // is capped on its own, and the advertised window only decides how many
  // requests fit in a minute — which is where a big window actually pays.
  // An UNKNOWN window must fail open. Falling back to 8000 here meant any
  // provider that publishes no x-ratelimit headers — OpenAI, Anthropic through a
  // bridge, an opencode/OpenRouter gateway, a local vLLM — was throttled to
  // Groq's free-tier shape for no reason, turning 8k-token turns into 2.5k ones.
  // If nobody has told us the limit, spend up to the configured ceiling and let
  // a real 429 teach us (the provider records it, and pacing adapts from there).
  const configuredCeiling = Number(config?.runtime?.maxRequestTokens ?? 12000);
  const requestCeiling = Number.isFinite(tpm) && tpm > 0
    ? Math.min(Math.floor(tpm * 0.85), configuredCeiling)
    : configuredCeiling;
  const tightContext = requestCeiling < Number(config?.runtime?.leanBelowRequestTokens ?? 20000);
  if (tightContext) {
    // A tight window caps what one turn can EMIT (2200 tokens instead of 8192),
    // so the same page needs MORE turns, not fewer. Cutting the budget to 10
    // here did the opposite: a measured run on gpt-oss-20b spent its ten turns
    // writing index.html and styles/main.css and stopped one file short of
    // scripts/main.js, which the structure check then failed. The per-turn
    // token cap is the real constraint and the router already paces each call.
    stepBudget = Math.min(stepBudget, Number(config?.runtime?.maxAgentStepsTight ?? 18));
    bus.emit(EVENT.THOUGHT, { phase: 'budget', text: `provider window ${Number.isFinite(tpm) && tpm > 0 ? `${tpm} tokens/min` : 'not published — assuming it is generous'}, one request capped at ${requestCeiling}: skills inform PLANNING only, the implementation prompt carries the spec instead of skill bodies, ${stepBudget} turns max` });
  }
  bus.emit(EVENT.THOUGHT, { phase: 'art-direction', text: artBlock });

  // ---- SKILL_SELECTION (model picks, runtime enforces + loads)
  bus.emit(EVENT.PHASE, { phase: 'skills' });
  const skills = await selectSkills({ router, registry, brief: { text, mode: brief.mode, agreed: brief.agreed, taskType }, inspection, config, bus, logger, complexity, catalogueLimit: tightContext ? 24 : undefined });
  stateMachine.transition(STATES.SKILL_SELECTION, { reason: `skills ${skills.method}`, data: { ids: skills.ids } });
  bus.emit(EVENT.THOUGHT, { phase: 'skills', text: `${skills.method}: ${skills.ids.join(', ')} | tech ${skills.tech.depth}/${skills.tech.animation}` });

  // ---- PLANNING + DESIGN_SPEC (one model call → spec + structured TODOs)
  bus.emit(EVENT.PHASE, { phase: 'plan' });
  let spec;
  let todoManager;
  let planSource = 'deterministic';
  const planWarnings = [];
  const live = await router.hasLiveModel().catch(() => false);
  if (live) {
    try {
      // On a metered endpoint the plan prompt is the one call that must still
      // carry real expertise, so it gets the skills — trimmed to fit one window.
      const skillsBudgetChars = tightContext ? 2600 : 24000;
      const prompt = buildPlanPrompt({ brief: { text }, inspection, skillsBlock: skills.contextBlock.slice(0, skillsBudgetChars), mode: brief.mode, existingOutline: outline, tech: skills.tech, skillIds: skills.ids, artDirectionBlock: artBlock });
      // The spec + TODO JSON is long. Starving its output truncates the JSON and
      // silently drops the whole plan back to the deterministic builder, so the
      // output gets real room even on a metered endpoint (the prompt is trimmed
      // instead).
      const response = await router.text(prompt, { kind: 'plan', phase: 'plan', liveOnly: true, maxTokens: tightContext ? 1500 : 3600, temperature: 0.3, system: tightContext ? 'You are a design director. Reply with STRICT JSON only: {"spec":{...},"tech":{...}}. Omit todos and files entirely. No prose.' : 'You are a design director and lead frontend engineer. Reply with STRICT JSON only, no prose and no code fence commentary.' });
      const parsed = extractJson(response.text);
      if (parsed.ok && parsed.value && typeof parsed.value === 'object') {
        spec = specFromModel(parsed.value, { brief, tech: skills.tech, understanding, inspection });
        const built = TodoManager.fromModel(parsed.value.todos ?? []);
        planWarnings.push(...built.warnings);
        if (built.manager.list().length) { todoManager = built.manager; planSource = 'model'; }
      } else {
        planWarnings.push(`plan reply was not valid JSON (${String(response.text ?? '').length} chars, ends "${String(response.text ?? '').slice(-60).replace(/\s+/g, ' ')}")`);
      }
      // The spec is the valuable half. If the combined spec+TODO JSON did not
      // survive, ask for the spec alone rather than dropping the model's design
      // thinking and falling all the way back to the deterministic builder.
      if (!spec) {
        const retry = await router.text(`${prompt}\n\nYour previous reply could not be parsed. Reply again with ONLY the "spec" and "tech" objects, no todos and no files:\n{"spec": {...}, "tech": {...}}`, {
          kind: 'plan', phase: 'plan-spec-retry', liveOnly: true, maxTokens: tightContext ? 1500 : 2000, temperature: 0.2,
          system: 'Reply with STRICT JSON only: an object with "spec" and "tech" keys. No prose.',
        });
        const reparsed = extractJson(retry.text);
        if (reparsed.ok && reparsed.value?.spec) {
          spec = specFromModel(reparsed.value, { brief, tech: skills.tech, understanding, inspection });
          if (spec) { planSource = 'model-spec'; planWarnings.push('recovered the design spec on a second, smaller call; TODOs derived from it'); }
        } else {
          planWarnings.push('spec retry also failed — deterministic spec used');
        }
      }
    } catch (error) {
      planWarnings.push(`plan call failed: ${String(error?.message ?? error).slice(0, 160)}`);
    }
  }
  if (!spec) spec = deterministicSpec({ brief, text, understanding, inspection, tech: skills.tech });
  if (!todoManager) {
    todoManager = new TodoManager();
    if (brief.mode === 'refine') {
      todoManager.create(brief.changeRequests.map((r, i) => ({ id: `I${i + 1}`, description: r, priority: i === 0 ? 'high' : 'medium', dependencies: i > 0 ? [`I${i}`] : [], completionCondition: 'change visible in the rendered page' })));
    } else {
      todoManager.createFromSpec(spec, { steps: [] });
    }
  }
  const ensured = todoManager.ensureRequired({ complexity, mode: brief.mode });
  // Required skills implied by the FINAL tech decision — load anything still missing.
  const requiredAfterSpec = requiredSkillsFor({ tech: spec.tech, inspection, brief, registry, complexity }).filter((id) => !skills.ids.includes(id));
  if (requiredAfterSpec.length) {
    const docs = registry.documents(requiredAfterSpec).join('\n\n---\n\n');
    skills.ids.push(...requiredAfterSpec);
    skills.loaded.push(...requiredAfterSpec.map((id) => ({ id, tokens: registry.get(id)?.tokens ?? 0, source: 'required' })));
    skills.contextBlock = `${skills.contextBlock}\n\n---\n\n${docs}`;
    skills.required = [...new Set([...(skills.required ?? []), ...requiredAfterSpec])];
  }
  stateMachine.transition(STATES.PLANNING, { reason: `plan ${planSource}`, data: { todos: todoManager.list().length } });
  stateMachine.transition(STATES.DESIGN_SPEC, { reason: `spec ${spec.source}`, data: { tech: spec.tech } });
  bus.emit(EVENT.SKILLS, { ids: skills.ids, loaded: skills.loaded.map((l) => l.id), method: skills.method, required: skills.required });
  bus.emit(EVENT.PLAN, { steps: todoManager.list().length, todos: todoManager.toBusEvents(), source: planSource, ensured });
  bus.emit(EVENT.THOUGHT, { phase: 'spec', text: renderSpecBlock(spec).slice(0, 700) });
  if (todoManager.list().length) { try { todoManager.start(todoManager.list()[0].id); } catch {} }

  // ---- IMPLEMENTATION (tool loop)
  const tools = createQwenToolContext({ workspaceDir, config, bus, dryRun, registry });
  const agreedBlock = brief.agreed ? renderAgreedContext(brief.agreed) : '';
  // Token discipline: the system prompt is re-sent on EVERY implementation turn,
  // so carrying ~4k tokens of skill bodies there costs more than the whole build
  // is worth on a metered endpoint. The skills did their job in PLANNING — the
  // spec and the art direction carry those decisions concretely. Below a low
  // token-per-minute ceiling we therefore ship the decisions, not the textbooks.
  const system = buildAgentSystemPrompt({
    inspection, spec, skills: tightContext ? undefined : { contextBlock: skills.contextBlock }, todos: todoManager.list(), mode: brief.mode,
    agreedBlock, brief: brief.mode === 'refine' ? `Requested changes: ${brief.changeRequests.join(' | ') || brief.request}` : (brief.request || ''),
    loadedSkillIds: skills.ids, existingOutline: outline, artDirectionBlock: artBlock,
    skillDigest: tightContext ? skills.ids.join(', ') : '',
  });
  const messages = [{ role: 'user', content: kickoffMessage({ brief, todoManager, inspection }) }];
  // Both budgets are carved out of what ONE request may be, not out of the rate
  // limit: the system prompt is re-sent every turn, so it is measured and the
  // remainder is split between history and the answer. The answer gets the
  // larger share — a turn that cannot finish a file wastes the whole request.
  //
  // `tightContext` decides only whether skill BODIES ride along in the system
  // prompt. It used to also switch the budgets to fixed numbers, which put a
  // cliff in the middle of the range: one token over the threshold and history
  // jumped to 24000 regardless of what the request could actually carry.
  const systemTokens = Math.ceil(system.length / 4);
  const spare = Math.max(1200, requestCeiling - systemTokens);
  const modelCompletionCap = router.maxCompletionTokens?.() ?? Number(config?.runtime?.maxTokens ?? 8192);
  const turnTokenCap = Math.max(1200, Math.min(
    Number(config?.runtime?.maxTokens ?? 8192),
    modelCompletionCap,
    Math.floor(spare * 0.55),
  ));
  const historyBudget = Math.max(700, Math.min(
    Number(config?.runtime?.contextBudgetTokens ?? 24000),
    Math.floor(spare * 0.4),
  ));
  const maxQaRounds = Number(config?.runtime?.maxQaRounds ?? (complexity === 'complex' ? 3 : complexity === 'trivial' ? 1 : 2));
  const MAX_REPAIR = Number(config?.runtime?.maxAgentRepairPasses ?? 2);

  let provider = 'none';
  let model = 'none';
  let finalSummary = '';
  let done = false;
  let lastError;
  let emptyTurns = 0;
  let parseFailures = 0;
  let repairPasses = 0;
  let todoNudges = 0;
  const qaRounds = [];
  const skillsReadSet = new Set();
  let testing;
  const exists = (rel) => fs.existsSync(path.resolve(workspaceDir, String(rel).replace(/^\.?\//, '')));
  const writtenRels = () => [...new Set(actions.filter((a) => ['writeFile', 'write_file', 'edit_file', 'patchFile'].includes(a.tool) && a.result && !a.result.error).map((a) => a.args.path ?? a.args.rel).filter(Boolean))];
  const allRels = () => [...new Set([...(inspection.files ?? []).map((f) => f.rel).filter((r) => !r.startsWith('.forge')), ...writtenRels()])];
  const entryHtml = () => { const rels = allRels(); return rels.find((r) => /^index\.html?$/i.test(r)) ?? rels.find((r) => /(^|\/)index\.html?$/i.test(r)) ?? rels.find((r) => r.endsWith('.html')); };

  const runQaRound = async (step, reason) => {
    const round = qaRounds.length + 1;
    bus.emit(EVENT.PHASE, { phase: 'visual-qa', round });
    if (stateMachine.getState() !== STATES.VISUAL_QA) { try { stateMachine.transition(STATES.VISUAL_QA, { reason }); } catch {} }
    const entry = entryHtml();
    const outDir = qaOutDir ? path.join(qaOutDir, `round-${round}`) : path.join(workspaceDir, '.forge', 'qa', `round-${round}`);
    let qa;
    if (!entry) {
      qa = { rendered: false, method: 'static-only', reason: 'no html entry point to render (framework projects need a dev server)', score: 0, minScore: Number(config?.verification?.minQualityScore ?? 78), verdict: 'iterate', findings: [{ area: 'visual-qa', severity: 'major', evidence: 'no html entry point found to render', fix: 'write index.html (static) so the page can be rendered and reviewed', source: 'static' }], screenshots: [], round, digest: '' };
    } else {
      const html = readWorkspaceFile(workspaceDir, entry) ?? '';
      const cssRel = allRels().find((r) => r.endsWith('.css'));
      const css = cssRel ? readWorkspaceFile(workspaceDir, cssRel) ?? '' : '';
      qa = await runVisualQa({ workspaceDir, entry, config, spec, agreed: brief.agreed, router, bus, outDir, round, mode: brief.mode, html, css, requirements: briefRequirements });
    }
    qaRounds.push({ round, step, reason, rendered: qa.rendered, method: qa.method, score: qa.score, verdict: qa.verdict, findings: qa.findings, screenshots: qa.screenshots, coverage: qa.coverage, critique: qa.critique ? { provider: qa.critique.provider, model: qa.critique.model, vision: qa.critique.vision, summary: qa.critique.summary, score: qa.critique.score, verdict: qa.critique.verdict, scores: qa.critique.scores, weakest: qa.critique.weakest } : undefined, reason_unrendered: qa.reason, ms: qa.ms });
    note(step, `visual QA round ${round}: ${qa.rendered ? qa.method : `NOT rendered (${qa.reason})`} score ${qa.score} verdict ${qa.verdict} (${qa.findings.length} findings)`);
    const qaTodo = todoManager.list().find((t) => /visual qa|render|critique/i.test(t.description) || t.id === 'QA');
    if (qaTodo && qa.verdict === 'pass') { try { for (const dep of qaTodo.dependencies ?? []) if (todoManager.get(dep)?.status !== 'completed') todoManager.update(dep, { status: 'completed', note: 'auto: preceded visual QA pass' }); if (qaTodo.status !== 'completed') todoManager.update(qaTodo.id, { status: 'completed', note: `visual QA pass ${qa.score}` }); } catch {} }
    return qa;
  };

  const structureIssues = () => {
    const rels = allRels();
    if (!rels.length) return ['no files exist in the workspace'];
    const check = checkStructure(workspaceDir, rels.map((rel) => ({ rel })));
    return [...(check.issues ?? []), ...(check.warnings ?? []).map((w) => `warning: ${w}`)];
  };

  bus.emit(EVENT.PHASE, { phase: 'implementation' });
  for (let step = 0; step < stepBudget; step += 1) {
    const trimmed = trimHistory(messages, { maxTokens: historyBudget, keepLast: tightContext ? 3 : 6, maxMessages: tightContext ? 7 : 14 });
    if (trimmed !== messages) { messages.length = 0; messages.push(...trimmed); }
    // The provider's own token window is respected by the router (awaitBudget);
    // no blind sleep is needed here.

    let response;
    try {
      response = await router.text(undefined, { kind: 'code', system, messages, liveOnly: true, maxTokens: turnTokenCap, temperature: 0.35, phase: 'agent' });
    } catch (error) {
      lastError = String(error?.message ?? error);
      note(step, `model call failed: ${lastError}`);
      bus.emit(EVENT.ERROR, { message: `model call failed: ${lastError.slice(0, 200)}` });
      break;
    }
    provider = response.provider;
    model = response.model;
    const rawText = response.text ?? '';
    const output = parseAgentOutput(rawText);
    transcript.push({ step, role: 'assistant', think: output.think, text: rawText });
    if (output.think) bus.emit(EVENT.THOUGHT, { phase: 'agent', text: output.think });

    // Validate JSON tool calls; feed back a correction once per streak.
    const invalid = output.calls.map((c) => validateToolCall({ tool: c.tool, args: c.args })).find((v) => !v.ok);
    const looksLikeJsonAttempt = /```json|"tool"\s*:/i.test(rawText) && !output.calls.length && !output.fileWrites.length && !output.done;
    if (invalid || looksLikeJsonAttempt) {
      parseFailures += 1;
      messages.push({ role: 'assistant', content: compactAssistantMessage(rawText, output) });
      if (parseFailures <= 2) {
        const err = invalid?.error ?? 'malformed tool JSON — expected [{"tool":"...","args":{...}}]';
        note(step, `tool parse failure — retrying: ${err}`);
        messages.push({ role: 'user', content: retryMessage(err) });
        continue;
      }
      note(step, 'tool parse failed repeatedly — ending loop');
      break;
    }
    parseFailures = 0;
    messages.push({ role: 'assistant', content: compactAssistantMessage(rawText, output) });

    const hasWork = output.fileWrites.length > 0 || output.calls.length > 0;
    if (!hasWork && !output.done) {
      emptyTurns += 1;
      if (emptyTurns >= 3) { note(step, 'three empty turns — ending loop'); finalSummary = firstParagraph(rawText); break; }
      const pending = todoManager.nextPending() ?? todoManager.currentInProgress();
      messages.push({ role: 'user', content: `That turn contained no file block and no tool call, so nothing happened. ${pending ? `Next TODO: ${pending.id} — ${pending.description}.` : 'All TODOs are progressed.'} Emit a real \`\`\`file:<path> block or a \`\`\`json tool array (or the done signal if the build is complete and reviewed).` });
      note(step, 'empty turn — nudged');
      continue;
    }
    emptyTurns = 0;

    // ---- execute work items in emission order
    const ordered = [
      ...output.fileWrites.map((w) => ({ ...w, kind: 'write' })),
      ...output.calls.map((c) => ({ ...c, kind: 'call' })),
    ].sort((a, b) => a.at - b.at);
    const toolResults = [];
    for (const item of ordered) {
      const tool = item.kind === 'write' ? 'write_file' : normalizeName(item.tool);
      const args = item.kind === 'write' ? { path: item.rel, content: item.content } : { ...(item.args ?? {}) };
      let result;
      if (tool === 'update_todo') {
        result = applyTodoUpdate(todoManager, args, exists);
      } else if (tool === 'run_qa') {
        const qa = await runQaRound(step, 'model requested run_qa');
        result = { ok: true, output: renderFindingsForModel(qa) };
        if (qa.verdict === 'iterate') { try { if (stateMachine.getState() !== STATES.ITERATION) stateMachine.transition(STATES.ITERATION, { reason: 'qa iterate (model-requested)' }); } catch {} }
      } else {
        result = await executeTool(tools, tool, args);
      }
      actions.push({ kind: 'tool', step, tool, args, result });
      bus.emit(EVENT.TOOL_CALL, { tool, args: { rel: args.path ?? args.rel, id: args.id, cmd: args.command ?? args.cmd, status: args.status } });
      if (result.error) bus.emit(EVENT.ERROR, { message: `${tool}: ${String(result.error).slice(0, 200)}` });
      else {
        bus.emit(EVENT.TOOL_RESULT, { tool, ok: true });
        if (tool === 'read_skill' && args.id) { skillsReadSet.add(String(args.id)); if (!skills.ids.includes(String(args.id)) && registry.has(String(args.id))) { skills.ids.push(String(args.id)); skills.loaded.push({ id: String(args.id), tokens: registry.get(String(args.id))?.tokens ?? 0, source: 'read_skill' }); } }
        if (['write_file', 'edit_file'].includes(tool)) {
          if ([STATES.DESIGN_SPEC, STATES.PLANNING, STATES.SKILL_SELECTION].includes(stateMachine.getState())) { try { stateMachine.transition(STATES.IMPLEMENTATION, { reason: `first write ${args.path}` }); } catch {} }
          else if ([STATES.VISUAL_QA, STATES.TESTING].includes(stateMachine.getState())) { try { stateMachine.transition(STATES.ITERATION, { reason: `edit after QA: ${args.path}` }); } catch {} }
          try {
            const rel = String(args.path ?? '');
            const target = todoManager.list().find((t) => t.status === 'pending' && (t.files ?? []).some((f) => rel === f || rel.endsWith(f) || f.endsWith(rel)));
            if (target && (target.dependencies ?? []).every((d) => todoManager.get(d)?.status === 'completed')) todoManager.start(target.id);
          } catch {}
        }
      }
      toolResults.push({ tool, args, result });
      transcript.push({ step, role: 'tool', tool, args: summarizeArgs(tool, args), result: summarizeResult(result) });
    }
    onStep?.({ step, think: output.think, calls: output.calls, writes: output.fileWrites, todos: todoManager.toBusEvents(), state: stateMachine.getState(), skillsRead: [...skillsReadSet] });
    if (toolResults.length) {
      const stateLine = `STATE ${stateMachine.getState()} | TODO ${todoManager.stats().completed}/${todoManager.stats().total} done | next: ${todoManager.nextPending()?.id ?? todoManager.currentInProgress()?.id ?? 'none'}`;
      messages.push({ role: 'user', content: `${formatToolResults(toolResults)}\n${stateLine}` });
    }

    if (!output.done) continue;

    // ---- DONE requested: gates
    const rels = writtenRels();
    if (!rels.length && brief.mode === 'create') {
      note(step, 'done without any files — rejected');
      messages.push({ role: 'user', content: 'You emitted done but no file has been written. Implement the TODOs with real file blocks first.' });
      continue;
    }
    // 1. structure (workspace-wide)
    const sIssues = structureIssues().filter((i) => !i.startsWith('warning:'));
    if (sIssues.length && repairPasses < MAX_REPAIR) {
      repairPasses += 1;
      note(step, `structure repair ${repairPasses}: ${sIssues.join('; ')}`);
      try { if (stateMachine.getState() !== STATES.ITERATION) stateMachine.transition(STATES.ITERATION, { reason: 'structure repair' }); } catch {}
      messages.push({ role: 'user', content: `STRUCTURE CHECK found problems:\n${sIssues.map((i) => `- ${i}`).join('\n')}\nFix them with real file blocks / edits, then emit done again.` });
      continue;
    }
    // 2. visual QA (render → critique → iterate)
    const lastQa = qaRounds.at(-1);
    const needsQa = !lastQa || (lastQa.verdict === 'iterate' && lastQa.step < step);
    if (needsQa && qaRounds.length < maxQaRounds) {
      const qa = await runQaRound(step, lastQa ? 'iteration re-check' : 'pre-completion visual QA');
      if (qa.verdict === 'iterate' && qaRounds.length < maxQaRounds) {
        bus.emit(EVENT.PHASE, { phase: 'iteration', round: qa.round });
        try { if (stateMachine.getState() !== STATES.ITERATION) stateMachine.transition(STATES.ITERATION, { reason: `visual QA ${qa.score}` }); } catch {}
        bus.emit(EVENT.IMPROVE, { iteration: qa.round, issues: qa.findings.length, score: qa.score });
        messages.push({ role: 'user', content: `${renderFindingsForModel(qa)}\n\nFix the weaknesses above with targeted edits (edit_file or full rewrites where structural). Keep everything that works. Then emit done again.` });
        continue;
      }
    }
    // 3. testing
    bus.emit(EVENT.PHASE, { phase: 'testing' });
    try { if (![STATES.TESTING].includes(stateMachine.getState())) stateMachine.transition(STATES.TESTING, { reason: 'pre-completion tests' }); } catch {}
    testing = runTests({ workspaceDir, rels: allRels(), inspection, config });
    bus.emit(EVENT.VERIFY, { ok: testing.ok, summary: testing.issues.join('; ') || 'tests passed', issues: testing.issues, warnings: testing.warnings });
    if (!testing.ok && repairPasses < MAX_REPAIR) {
      repairPasses += 1;
      note(step, `test repair ${repairPasses}: ${testing.issues.join('; ')}`);
      try { stateMachine.transition(STATES.ITERATION, { reason: 'tests failed' }); } catch {}
      messages.push({ role: 'user', content: `TESTS FAILED:\n${testing.issues.map((i) => `- ${i}`).join('\n')}\nFix them, then emit done again.` });
      continue;
    }
    // 4. TODO completeness
    const open = todoManager.list().filter((t) => !['completed', 'cancelled'].includes(t.status));
    for (const t of open) {
      const missing = todoManager.missingFiles(t.id, exists);
      if (!missing.length && (t.files ?? []).length) { try { for (const d of t.dependencies ?? []) if (todoManager.get(d)?.status !== 'completed') todoManager.update(d, { status: 'completed', note: 'auto: files present' }); todoManager.update(t.id, { status: 'completed', note: 'auto: files present at completion' }); } catch {} }
    }
    const stillOpen = todoManager.list().filter((t) => !['completed', 'cancelled'].includes(t.status) && t.id !== 'QA');
    const qaTodo = todoManager.get('QA') ?? todoManager.list().find((t) => /visual qa|critique/i.test(t.description));
    if (qaTodo && qaTodo.status !== 'completed') { try { for (const d of qaTodo.dependencies ?? []) if (todoManager.get(d)?.status !== 'completed') todoManager.update(d, { status: 'completed', note: 'auto: completed at QA' }); todoManager.update(qaTodo.id, { status: 'completed', note: qaRounds.at(-1) ? `visual QA ${qaRounds.at(-1).verdict} ${qaRounds.at(-1).score}` : 'visual QA not available' }); } catch {} }
    if (stillOpen.length && todoNudges < 1) {
      todoNudges += 1;
      note(step, `open TODOs at done: ${stillOpen.map((t) => t.id).join(', ')}`);
      messages.push({ role: 'user', content: `These TODOs are still open: ${stillOpen.map((t) => `${t.id} (${t.status}) — ${t.description}`).join('; ')}. Either finish them now (file blocks/edits) and mark them completed with update_todo, or mark them blocked with a reason. Then emit done again.` });
      continue;
    }
    for (const t of stillOpen) { try { todoManager.block(t.id, 'left open at completion'); } catch {} }
    // 5. state machine completion
    const finalQa = qaRounds.at(-1);
    const gate = stateMachine.canComplete({ hasVisualQa: Boolean(finalQa), hasTesting: Boolean(testing), verificationOk: Boolean(testing?.ok) });
    if (!gate.ok) note(step, `state gate: ${gate.reason}`);
    try {
      if ([STATES.IMPLEMENTATION, STATES.ITERATION, STATES.VISUAL_QA].includes(stateMachine.getState())) stateMachine.transition(STATES.TESTING, { reason: 'tests ran' });
      stateMachine.transition(STATES.COMPLETED, { reason: gate.ok ? 'all gates passed' : `completed with caveats: ${gate.reason}` });
    } catch (error) { note(step, `state completion: ${String(error?.message ?? error)}`); }
    finalSummary = output.summary || 'Build complete.';
    done = true;
    break;
  }

  // The loop can end without a done signal: the model failed, the step budget
  // ran out, or it stopped talking. Files still exist, so they still get looked
  // at and tested. Skipping QA here is how a broken run reported nothing at all.
  if (!done && writtenRels().length) {
    if (!qaRounds.length) {
      try { await runQaRound(stepBudget, lastError ? `loop ended on a provider failure: ${String(lastError).slice(0, 120)}` : 'loop ended without a done signal'); }
      catch (error) { note(stepBudget, `post-loop visual QA failed: ${String(error?.message ?? error).slice(0, 160)}`); }
    }
    if (!testing) {
      bus.emit(EVENT.PHASE, { phase: 'testing' });
      try {
        testing = runTests({ workspaceDir, rels: allRels(), inspection, config });
        bus.emit(EVENT.VERIFY, { ok: testing.ok, summary: testing.issues.join('; ') || 'tests passed', issues: testing.issues, warnings: testing.warnings });
      } catch (error) { note(stepBudget, `post-loop tests failed: ${String(error?.message ?? error).slice(0, 160)}`); }
    }
  }

  // ---- result
  const writes = actions
    .filter((a) => ['write_file', 'edit_file'].includes(a.tool) && a.result && !a.result.error && (a.args.path ?? a.args.rel))
    .map((a) => { const meta = a.result?.result ?? {}; const rel = a.args.path ?? a.args.rel; const content = String(a.args.content ?? ''); return { rel, mode: meta.mode || (a.tool === 'edit_file' ? 'update' : 'create'), bytes: meta.bytes ?? content.length, lines: meta.lines ?? (content ? content.split(/\r?\n/).length : undefined) }; });
  const dedupedWrites = [...new Map(writes.map((w) => [w.rel, w])).values()];
  const finalQa = qaRounds.at(-1);
  let status;
  if (done) status = (testing?.ok !== false && (!finalQa || finalQa.verdict === 'pass' || !finalQa.rendered)) ? 'done' : 'needs-fix';
  else status = dedupedWrites.length ? 'needs-fix' : (lastError ? 'failed' : 'empty');
  if (!done) { try { if (stateMachine.getState() !== STATES.COMPLETED) stateMachine.force(STATES.FAILED, lastError ? `model failure: ${lastError.slice(0, 120)}` : 'loop ended without done'); } catch {} }
  bus.emit(EVENT.RUN_END, { status, files: dedupedWrites.length, qa: finalQa?.score, rendered: finalQa?.rendered });
  const blockedTodos = todoManager.blocked().map((t) => `${t.id}: ${t.description}${t.blockReason ? ` (${t.blockReason})` : ''}`);
  const report = {
    mode: brief.mode, complexity, taskType, status, provider, model,
    skills: { method: skills.method, loaded: skills.loaded.map((l) => l.id), required: skills.required, readOnDemand: [...skillsReadSet], skipped: skills.skipped, catalogueSize: skills.catalogueSize, tech: skills.tech },
    plan: { source: planSource, todos: todoManager.stats(), ensured, warnings: planWarnings, blocked: blockedTodos },
    spec: { source: spec.source, depth: spec.tech?.depth, animation: spec.tech?.animation },
    artDirection: { id: artChoice.direction.id, name: artChoice.direction.name, composition: artChoice.direction.composition, voice: artChoice.direction.voice, decoration: artDecoration.layers, canvas: artDecoration.canvas, reasons: artChoice.reasons },
    qa: { rounds: qaRounds.length, rendered: Boolean(finalQa?.rendered), method: finalQa?.method, score: finalQa?.score, verdict: finalQa?.verdict, screenshots: finalQa?.screenshots ?? [], history: qaRounds.map((r) => ({ round: r.round, score: r.score, verdict: r.verdict, findings: r.findings.length, rendered: r.rendered })), unrenderedReason: finalQa && !finalQa.rendered ? finalQa.reason_unrendered : undefined },
    testing: testing ? { ok: testing.ok, issues: testing.issues, warnings: testing.warnings.slice(0, 8) } : { ok: false, issues: ['tests did not run (loop ended before completion)'], warnings: [] },
    files: dedupedWrites.map((w) => w.rel),
    steps: actions.length,
    ms: Date.now() - startedAt,
    lastError,
  };
  return {
    status, done, writes: dedupedWrites, actions, transcript, provider, model,
    summary: finalSummary || (lastError ? `stopped: ${lastError.slice(0, 160)}` : 'loop ended without the done signal'),
    stepCount: actions.length, inspection, taskType, complexity, mode: brief.mode,
    skills: { ids: skills.ids, loaded: skills.loaded, method: skills.method, required: skills.required, selection: skills.selection, tech: skills.tech, summary: skills.summary },
    skillsRead: [...skillsReadSet],
    todos: todoManager.toBusEvents(), todoStats: todoManager.stats(),
    state: stateMachine.snapshot(), spec, planSource, planWarnings,
    visualQa: { rounds: qaRounds, rendered: Boolean(finalQa?.rendered), method: finalQa?.method, final: finalQa, screenshots: finalQa?.screenshots ?? [] },
    visualQaDone: qaRounds.length > 0, testingDone: Boolean(testing), testing,
    report, lastError, ms: Date.now() - startedAt,
  };
}

function kickoffMessage({ brief, todoManager, inspection }) {
  const lines = [];
  lines.push(brief.mode === 'refine' ? 'Begin the refinement. Read the files you will touch first, then make targeted edits.' : `Begin implementation${inspection?.isEmpty ? ' in the empty workspace' : ''}. Start with the first TODO.`);
  lines.push('', 'TODOS:', todoManager.render());
  return lines.join('\n');
}

function applyTodoUpdate(todoManager, args, exists) {
  const id = String(args.id ?? '').trim();
  const status = String(args.status ?? '').trim();
  const todo = todoManager.get(id);
  if (!todo) return { error: `unknown todo "${id}". Known: ${todoManager.list().map((t) => t.id).join(', ')}` };
  if (!['in_progress', 'completed', 'blocked'].includes(status)) return { error: 'status must be in_progress | completed | blocked' };
  if (status === 'completed') {
    const missing = todoManager.missingFiles(id, exists);
    if (missing.length) return { error: `cannot complete ${id}: files not written yet — ${missing.join(', ')}` };
    if (/visual qa|critique/i.test(todo.description) || id === 'QA') return { error: `${id} is completed by the runtime when visual QA passes — call run_qa or emit done` };
  }
  try {
    if (status === 'in_progress' || status === 'completed') for (const dep of todo.dependencies ?? []) { const d = todoManager.get(dep); if (d && d.status !== 'completed' && status === 'completed') todoManager.update(dep, { status: 'completed', note: `auto: predecessor of ${id}` }); }
    todoManager.update(id, { status, note: args.note });
    return { ok: true, output: `todo ${id} → ${status} (${todoManager.stats().completed}/${todoManager.stats().total} completed)` };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

/* ---------------------------------------------------------------- parsing ---- */

export function parseAgentOutput(text) {
  const raw = String(text ?? '');
  const items = [];
  const fileRe = new RegExp(FILE_BLOCK_SOURCE, 'gmi');
  let match;
  while ((match = fileRe.exec(raw)) !== null) {
    const rel = String(match[1] ?? '').trim().replace(/^[./\\]+/, '');
    const content = String(match[2] ?? '').replace(/\r?\n$/, '');
    if (rel && content.trim()) items.push({ at: match.index, type: 'file', rel, content });
  }
  if (!items.some((i) => i.type === 'file')) {
    const headingRe = new RegExp(HEADING_BLOCK_SOURCE, 'gmi');
    while ((match = headingRe.exec(raw)) !== null) {
      const rel = String(match[1] ?? '').trim().replace(/^[./\\]+/, '').replace(/^File:\s*/i, '').replace(/[`*_]/g, '').trim();
      const content = String(match[2] ?? '').replace(/\r?\n$/, '');
      if (rel && content.trim() && rel.includes('.')) items.push({ at: match.index, type: 'file', rel, content });
    }
  }
  const jsonRe = new RegExp(JSON_BLOCK_SOURCE, 'gmi');
  while ((match = jsonRe.exec(raw)) !== null) {
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
    for (const emitted of item.entries) {
      if (!emitted) continue;
      // A model that answers through its NATIVE tool channel wraps this
      // agent's protocol in {name, arguments}: gpt-oss emits
      // {"name":"repo_browser.write_file","arguments":{"tool":"write_file","args":{...}}}.
      // The inner object IS the call — unwrap it rather than inventing a tool
      // named "repo_browser.write_file" with the real call as its arguments.
      const entry = unwrapNativeCall(emitted);
      if (entry.done === true) { done = true; summary = String(entry.summary ?? '').trim(); continue; }
      const call = entry;
      const tool = typeof call.tool === 'string' ? call.tool : (typeof call.name === 'string' ? call.name : '');
      if (!tool) continue;
      // Namespaced names ("functions.write_file", "repo_browser.write_file")
      // refer to the same tool this agent already knows.
      calls.push({ at: item.at, tool: tool.split('.').pop(), args: call.args ?? call.arguments ?? {} });
    }
  }
  return { think: firstParagraph(raw.split('```')[0]), fileWrites, calls, done, summary };
}

/** One level of native tool-call envelope removed, when it wraps a real call. */
function unwrapNativeCall(entry) {
  const inner = entry?.arguments;
  if (inner && typeof inner === 'object' && !Array.isArray(inner) && (typeof inner.tool === 'string' || inner.done === true)) return inner;
  return entry;
}

function normalizeEntries(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    if (value.tool || value.done || value.name) return [value];
    if (Array.isArray(value.calls)) return value.calls;
    if (Array.isArray(value.tool_calls)) return value.tool_calls;
  }
  return [];
}

/** JSON-only tool call parser (kept for tests and simple callers). */
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

/* ---------------------------------------------------------------- helpers ---- */

const NAME_ALIASES = {
  readFile: 'read_file', listFiles: 'list_directory', writeFile: 'write_file', patchFile: 'edit_file', exec: 'run_bash', readSkill: 'read_skill', listSkills: 'list_skills', updateTodo: 'update_todo', runQa: 'run_qa', visual_qa: 'run_qa',
};
function normalizeName(tool) { const t = String(tool ?? '').trim(); return NAME_ALIASES[t] ?? t; }

const TOOL_ARG_MAP = {
  read_file: (args) => [args.path ?? args.rel ?? args.file],
  list_directory: (args) => [args.path ?? args.prefix ?? ''],
  write_file: (args) => [args.path ?? args.rel ?? args.file, args.content ?? args.text ?? ''],
  edit_file: (args) => [args.path ?? args.rel ?? args.file, args.edits ?? args.patches ?? []],
  run_bash: (args) => [args.command ?? args.cmd, args.args ?? args.arguments ?? [], { timeoutMs: args.timeoutMs }],
  list_skills: () => [],
  read_skill: (args) => [args.id ?? args.skill ?? args.name],
};

async function executeTool(tools, name, args = {}) {
  const fn = tools[name];
  const mapper = TOOL_ARG_MAP[name];
  if (typeof fn !== 'function' || !mapper) return { error: `unknown tool: ${name}` };
  try {
    let result = fn(...mapper(args));
    if (result && typeof result.then === 'function') result = await result;
    if (result === undefined || result === null) return { ok: true, output: 'ok' };
    if (typeof result === 'string') return { ok: true, output: result };
    if (Array.isArray(result)) return { ok: true, output: JSON.stringify(result).slice(0, 6000) };
    return { ok: true, output: JSON.stringify(result).slice(0, 6000), result };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

function formatToolResults(results) {
  const lines = ['Tool results:'];
  for (const entry of results) {
    const rel = entry.args.path ?? entry.args.rel ?? '';
    let text;
    if (entry.result?.error) text = `ERROR: ${entry.result.error}`;
    else if (entry.tool === 'write_file') text = `wrote ${rel} (${String(entry.args.content ?? '').length} chars)`;
    else if (entry.tool === 'edit_file') text = `edited ${rel}`;
    else if (entry.tool === 'read_file') text = String(entry.result?.output ?? '').slice(0, 12000);
    else if (entry.tool === 'read_skill') text = String(entry.result?.output ?? '').slice(0, 9000);
    else text = String(entry.result?.output ?? 'ok');
    if (text.length > 12000) text = `${text.slice(0, 12000)}\n... [truncated]`;
    lines.push(`[${entry.tool}${rel ? ` ${rel}` : entry.args.id ? ` ${entry.args.id}` : ''}] ${text}`);
  }
  return lines.join('\n');
}

function summarizeArgs(tool, args) {
  const out = {};
  for (const key of ['path', 'rel', 'id', 'command', 'status']) if (args?.[key] !== undefined) out[key] = args[key];
  if (args?.content !== undefined) out.bytes = String(args.content).length;
  if (tool === 'edit_file') out.edits = (args?.edits ?? []).length;
  return out;
}

function summarizeResult(result) {
  if (result?.error) return { error: result.error };
  const output = String(result?.output ?? '');
  return { bytes: output.length, preview: output.slice(0, 160) };
}

function compactAssistantMessage(rawText, output) {
  const parts = [];
  if (output.think) parts.push(output.think);
  const writes = output.fileWrites.map((w) => w.rel);
  if (writes.length) parts.push(`(wrote ${writes.join(', ')})`);
  if (output.calls.length) parts.push(`(called ${output.calls.map((c) => c.tool).join(', ')})`);
  if (output.done) parts.push('(emitted done)');
  if (!parts.length) parts.push(String(rawText ?? '').split(/```/)[0].trim().slice(0, 500) || '[no output]');
  return parts.join('\n').slice(0, 2500);
}

function firstParagraph(text) {
  const line = String(text ?? '').split(/\r?\n/).map((entry) => entry.trim()).find((entry) => entry.length > 0);
  return (line ?? '').slice(0, 600);
}
