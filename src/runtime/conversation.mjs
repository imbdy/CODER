/**
 * ONE agent, one continuous conversation.
 *
 *   TALK → DISCUSS → REFINE → AGREE → "build it" → EXECUTE → VISUAL QA → ITERATE → DONE → TALK AGAIN
 *
 * Discussion turns go to the model as a design partner; every turn returns a
 * structured patch that the runtime merges into the agreed context. Execution
 * happens only when the RUNTIME decides the message is an instruction to build
 * (triggers.mjs) AND the agreed context holds enough substance
 * (agreed-context.mjs). Nothing is ever invented: an empty context is refused.
 *
 * Offline (no live model) the same loop runs with deterministic extraction and
 * honest, clearly labelled replies; builds go to the deterministic engine.
 */

import path from 'node:path';
import fs from 'node:fs';
import { createRouter } from '../model/router.mjs';
import { loadConfig } from '../core/config.mjs';
import { runBuild } from './agent-build.mjs';
import { EventBus } from '../core/events.mjs';
import { inspectWorkspace } from '../workspace/scanner.mjs';
import { extractJson } from '../model/json.mjs';
import { buildConversationSystemPrompt } from '../agent/prompts.mjs';
import { createAgreedContext, normalizeAgreedContext, mergeContextPatch, extractContextHeuristically, contextReadiness, renderAgreedContext, recordBuild, contextDigest } from './agreed-context.mjs';
import { decideExecution, matchMeta, isExplicitTrigger, hasExecutionVerb } from './triggers.mjs';

export const REFUSAL_EMPTY = 'I can build it, but we haven\'t decided what we\'re building yet. Tell me the idea first — what it is, who it\'s for and the direction you want — and I\'ll take it from there.';
export const REFUSAL_NOTHING_NEW = 'The current build already reflects everything we agreed. Tell me what to change — hero, typography, colour, motion, layout — and say "do it" when you want me to apply it.';

/* ---------------------------------------------------------------- state ---- */

export function ensureConversationState(state) {
  state.conversation ??= [];
  state.activeFiles ??= [];
  state.skillsUsed ??= [];
  state.taskHistory ??= [];
  state.todoItems ??= [];
  state.unresolvedIssues ??= [];
  state.turnCount ??= 0;
  state.phase ??= 'discuss';
  state.agreed = state.agreed ? normalizeAgreedContext(state.agreed) : createAgreedContext();
  state.config ??= loadConfig({ workspaceDir: state.workspaceDir });
  return state;
}

function hasBuild(state) { return Boolean(state.agreed?.build) || (state.activeFiles?.length ?? 0) > 0; }

/* ------------------------------------------------------------ local meta ---- */

function localMetaAnswer(kind, state, provenance) {
  const ws = state.workspaceDir ?? process.cwd();
  const built = hasBuild(state);
  let text = '';
  switch (kind) {
    case 'greeting': text = built ? `Hey. The build in ${ws} is in place — tell me what to change, or start a new idea.` : 'Hey — I\'m Artisan. Tell me what you want to build and we\'ll shape it together; when you say "build it" I implement it in your project, render it, review it and iterate.'; break;
    case 'thanks': text = 'Anytime. Keep refining, or tell me what to change next.'; break;
    case 'identity': text = 'I\'m Artisan — a creative frontend engineer that works inside your project. We discuss the design (composition, typography, colour, motion, 3D, tech), and when you say "build it" I implement the agreed design, render it in a headless browser, critique it, fix weaknesses and test it.'; break;
    case 'capabilities': text = 'I design and build frontend work in your workspace: landing pages, product sites, components, motion, 3D depth where it earns its place. Describe the idea, we refine it, you say "build it", and I implement, render, review and iterate until it holds up. After that we keep talking and I modify what exists. Commands: /status, /todo, /skills, /context.'; break;
    case 'workspace': text = `I'm working in ${ws}.${state.activeFiles?.length ? ` Files so far: ${state.activeFiles.join(', ')}.` : ' Nothing written yet.'}`; break;
    case 'status': text = statusReport(state); break;
    default: text = '';
  }
  if (provenance) text += `\n(${provenance})`;
  return text;
}

export function statusReport(state) {
  const lines = [`Workspace: ${state.workspaceDir ?? process.cwd()} | turns ${state.turnCount ?? 0} | ${hasBuild(state) ? 'build exists' : 'no build yet'}`];
  lines.push(`Agreed: ${contextDigest(state.agreed)}`);
  const last = (state.taskHistory ?? []).at(-1);
  if (last) lines.push(`Last build: ${last.mode ?? 'create'} via ${last.engine ?? 'agent'} — ${last.status}${last.score !== undefined ? ` (QA ${last.score})` : ''} — ${(last.files ?? []).join(', ') || 'no files'}`);
  const todos = state.todoItems ?? [];
  if (todos.length) lines.push('TODOs:', ...todos.map((t) => `  ${t.status === 'completed' ? '[x]' : t.status === 'blocked' ? '[!]' : t.status === 'in_progress' ? '[>]' : '[ ]'} ${t.id} ${t.title ?? t.description}`));
  if (state.unresolvedIssues?.length) lines.push(`Open issues: ${state.unresolvedIssues.slice(-4).join('; ')}`);
  return lines.join('\n');
}

/* --------------------------------------------------------- reply parsing ---- */

/** Split the model's reply into the human text and the trailing JSON control block. */
export function parseConversationReply(text) {
  const raw = String(text ?? '');
  const match = raw.match(/```(?:json)?[ \t]*\r?\n([\s\S]*?)```\s*$/i) ?? raw.match(/```(?:json)?[ \t]*\r?\n([\s\S]*?)```/i);
  if (!match) {
    // Some models emit the bare object at the end.
    const bare = raw.match(/\{\s*"intent"[\s\S]*\}\s*$/);
    if (bare) {
      const parsed = extractJson(bare[0]);
      if (parsed.ok) return { reply: raw.slice(0, bare.index).trim(), ...controlFrom(parsed.value) };
    }
    return { reply: raw.trim(), intent: undefined, patch: {}, ready: undefined, missing: [] };
  }
  const parsed = extractJson(match[1]);
  const reply = raw.slice(0, match.index).trim();
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') return { reply, intent: undefined, patch: {}, ready: undefined, missing: [] };
  return { reply, ...controlFrom(parsed.value) };
}

function controlFrom(value) {
  const intent = ['discuss', 'build', 'question', 'meta'].includes(value.intent) ? value.intent : undefined;
  const patch = value.context && typeof value.context === 'object' ? value.context : {};
  return { intent, patch, ready: typeof value.ready === 'boolean' ? value.ready : undefined, missing: Array.isArray(value.missing) ? value.missing.map(String).slice(0, 6) : [] };
}

/** Streams tokens to the terminal but stops at the first fenced block (the control JSON). */
function makeStreamer(onToken) {
  let held = '';
  let stopped = false;
  let sentAny = false;
  const forward = (chunk) => { if (!chunk) return; sentAny = true; onToken?.(chunk); };
  return {
    onToken(piece) {
      if (stopped || !onToken) return;
      held += piece;
      const fence = held.indexOf('```');
      if (fence !== -1) { forward(held.slice(0, fence).replace(/\s+$/, '')); held = ''; stopped = true; return; }
      // keep a small tail so a fence split across chunks is caught
      if (held.length > 3) { forward(held.slice(0, -3)); held = held.slice(-3); }
    },
    finish(finalReply) {
      if (!onToken) return false;
      if (!stopped && held) { forward(held.replace(/\s+$/, '')); held = ''; }
      if (!sentAny && finalReply) forward(finalReply);
      return sentAny || Boolean(finalReply);
    },
    get sent() { return sentAny; },
  };
}

/* --------------------------------------------------------------- progress ---- */

function progressRelay(onProgress) {
  return (event) => {
    try {
      switch (event.type) {
        case 'phase': onProgress({ type: 'phase', text: event.phase + (event.round ? ` (round ${event.round})` : '') }); break;
        case 'skills.retrieved': if (event.loaded || event.method) onProgress({ type: 'skill', text: `${event.method ?? 'selected'}: ${(event.loaded ?? event.ids ?? []).join(', ')}` }); break;
        case 'plan.created': onProgress({ type: 'todo', text: `${event.steps} TODOs (${event.source ?? 'plan'})${event.ensured?.length ? ` + runtime-required ${event.ensured.join(', ')}` : ''}` }); break;
        case 'file.write': onProgress({ type: 'edit', text: `${event.mode ?? 'write'} ${event.rel}` }); break;
        case 'critique.result': if (event.kind === 'visual-qa') onProgress({ type: 'qa', text: `round ${event.round ?? 1}: ${event.rendered ? event.method : 'not rendered'} — ${event.overall}/100 ${String(event.verdict ?? '').toUpperCase()} (${event.findings ?? 0} findings)` }); break;
        case 'improve.iteration': onProgress({ type: 'iterate', text: `fixing ${event.issues} weakness(es) from round ${event.iteration}` }); break;
        case 'verify.result': onProgress({ type: 'verify', text: event.ok ? 'tests passed' : `tests: ${event.summary}` }); break;
        case 'thought': if (event.phase === 'agent' && event.text) onProgress({ type: 'think', text: String(event.text).slice(0, 140) }); break;
        case 'error': onProgress({ type: 'error', text: String(event.message ?? '').slice(0, 200) }); break;
        default: break;
      }
    } catch { /* progress must never break a turn */ }
  };
}

/* ---------------------------------------------------------------- execute ---- */

function buildSummary(run, state) {
  const lines = [];
  const files = (run.writes ?? []).map((w) => w.rel);
  const engine = run.engine === 'deterministic' ? `deterministic design engine (${run.engineReason ?? 'no live model'})` : `${run.model?.provider ?? 'model'} ${run.model?.model ?? ''}`.trim();
  const head = run.status === 'done' ? 'Done' : run.status === 'needs-fix' ? 'Stopped short' : run.status === 'failed' ? 'Failed' : 'No changes';
  lines.push(`${head} — ${run.mode === 'refine' ? 'refined' : 'built'} via ${engine}. ${files.length ? `${run.mode === 'refine' ? 'Modified' : 'Files'}: ${files.join(', ')}` : 'No files written.'}`);
  if (run.skills?.loaded?.length || run.skills?.ids?.length) lines.push(`Skills loaded (${run.skills.method ?? 'retrieved'}): ${(run.skills.loaded ?? run.skills.ids).join(', ')}${run.skillsRead?.length ? ` + read on demand: ${run.skillsRead.join(', ')}` : ''}`);
  if (run.todoStats) lines.push(`TODOs: ${run.todoStats.completed}/${run.todoStats.total} completed${run.todoStats.blocked ? `, ${run.todoStats.blocked} blocked` : ''} (plan: ${run.plan?.source ?? 'deterministic'})`);
  const qa = run.visualQa;
  if (qa) {
    if (qa.rendered) lines.push(`Visual QA: rendered (${qa.method}), ${qa.rounds ?? 1} round(s), final ${qa.score}/100 ${qa.verdict}${qa.screenshots?.length ? ` — screenshots in ${path.dirname(qa.screenshots[0])}` : ''}`);
    else lines.push(`Visual QA: NOT rendered — ${qa.reason ?? 'no browser'}${qa.score !== undefined ? ` (static score ${qa.score})` : ''}`);
    if (qa.coverage?.missing?.length) lines.push(`Brief coverage: MISSING ${qa.coverage.missing.join(', ')}${qa.coverage.met?.length ? ` (delivered: ${qa.coverage.met.join(', ')})` : ''}`);
    else if (qa.coverage?.met?.length) lines.push(`Brief coverage: all requested parts present (${qa.coverage.met.join(', ')})`);
    const open = (qa.findings ?? []).filter((f) => f.severity !== 'minor').slice(0, 4);
    if (open.length && qa.verdict !== 'pass') lines.push(`Remaining weaknesses: ${open.map((f) => `${f.area}: ${f.evidence}`).join(' | ')}`);
  }
  if (run.testing) lines.push(run.testing.ok ? 'Tests: passed (structure, static checks, JS syntax)' : `Tests: FAILED — ${(run.testing.issues ?? []).slice(0, 3).join('; ')}`);
  else if (run.verification) lines.push(run.verification.ok ? 'Checks: passed' : `Checks: ${run.verification.summary}`);
  if (run.status === 'needs-fix' && run.summary) lines.push(`Note: ${String(run.summary).slice(0, 200)}`);
  if (run.status === 'failed' && (run.lastError || run.error)) lines.push(`Cause: ${String(run.lastError ?? run.error).slice(0, 240)}`);
  return lines.join('\n');
}

async function executeBuild(text, state, { bus, onProgress, readiness, offline = false }) {
  const mode = readiness.mode;
  const changeRequests = mode === 'refine' ? [...state.agreed.changeRequests] : [];
  const brief = { request: text, mode, agreed: state.agreed, changeRequests };
  state.phase = 'build';
  state.currentTask = mode === 'refine' ? changeRequests.join('; ') : (state.agreed.summary || state.agreed.project || text);
  // Do NOT name an engine here. This reply may have come from the local engine
  // while the build still reaches a live model (separate routers, separate
  // probes) — agent-build announces the brain it actually got.
  onProgress({ type: 'phase', text: `executing (${mode})` });
  const off = bus.on(progressRelay(onProgress));
  let outcome;
  try {
    outcome = await runBuild(brief, { workspaceDir: state.workspaceDir, config: state.config, bus, progress: onProgress });
  } catch (error) {
    off();
    state.phase = 'discuss';
    const message = String(error?.message ?? error);
    state.unresolvedIssues.push(message.slice(0, 200));
    state.conversation.push({ role: 'assistant', text: `Build failed: ${message.slice(0, 200)}`, turn: state.turnCount });
    return { kind: 'error', error: message, state };
  }
  off();
  const run = outcome.run;
  state.phase = 'discuss';
  state.lastBuildTurn = state.turnCount;
  state.lastRun = run;
  const files = (run.writes ?? []).map((w) => w.rel);
  state.activeFiles = [...new Set([...state.activeFiles, ...files])];
  const loaded = run.skills?.loaded ?? run.skills?.ids ?? [];
  state.skillsUsed = [...new Set([...state.skillsUsed, ...loaded, ...(run.skillsRead ?? [])])];
  state.todoItems = (run.todos ?? run.plan?.steps ?? []).map((t) => ({ id: t.id, title: t.description ?? t.title, description: t.description ?? t.title, status: t.status ?? (run.status === 'done' ? 'completed' : 'pending'), priority: t.priority ?? 'medium', files: t.files ?? [], skills: t.skills ?? [], completionCondition: t.completionCondition ?? t.goal ?? '', dependencies: t.dependencies ?? [] }));
  const score = run.visualQa?.score ?? run.critique?.overall;
  state.taskHistory.push({ request: text, mode, engine: run.engine ?? 'agent', taskType: run.understanding?.taskType, status: run.status, files, score, at: new Date().toISOString() });
  if (run.status === 'failed' || (!files.length && run.status !== 'done')) {
    state.unresolvedIssues.push(`build ${run.status}: ${String(run.lastError ?? run.summary ?? run.error ?? '').slice(0, 160)}`);
  } else {
    state.agreed = recordBuild(state.agreed, { files, summary: run.summary, spec: run.spec, skills: loaded, qaScore: score, mode, status: run.status, artDirection: run.artDirection?.id ?? run.report?.artDirection?.id, sections: (run.page?.sections ?? []).map((s) => String(s).split(':')[0]) });
  }
  if (run.visualQa && run.visualQa.rendered === false) state.unresolvedIssues.push(`visual QA not rendered: ${run.visualQa.reason ?? 'no browser'}`);
  const summary = buildSummary(run, state);
  state.conversation.push({ role: 'assistant', text: `[build ${run.status}] ${summary.split('\n').slice(0, 3).join(' ')}`.slice(0, 900), turn: state.turnCount });
  return { kind: 'task', run, summary, mode, engine: run.engine ?? 'agent', state };
}

/* ---------------------------------------------------------------- offline ---- */

function offlineDiscussionReply(state, provenance) {
  const c = state.agreed;
  const built = hasBuild(state);
  const bits = [];
  if (built) {
    bits.push(c.changeRequests.length ? `Noted as a change to the existing build: ${c.changeRequests.at(-1)}. Say "do it" and I'll apply it to ${state.activeFiles.slice(0, 3).join(', ')}.` : `The build in ${state.workspaceDir} is in place. Tell me what to change and say "do it" when ready.`);
  } else {
    bits.push(`Noted — ${contextDigest(c)}.`);
    const readiness = contextReadiness(c);
    if (readiness.ready) bits.push('That is enough to build from. Say "build it" when you want me to start, or keep refining.');
    else if (readiness.reason === 'empty-context') bits.push('What are we building, and for whom?');
    else bits.push('Give me a direction (mood, typography, colour, motion) and I can build from it.');
  }
  bits.push(provenance ? `(${provenance})` : '(offline: no live model reachable — this reply is deterministic. Start Ollama or set ARTISAN_API_KEY for real conversation.)');
  return bits.join(' ');
}

async function offlineTurn(text, state, { bus, onProgress, onToken, meta, provenance }) {
  const reply = (answer, extra = {}) => {
    onToken?.(answer);
    state.conversation.push({ role: 'assistant', text: answer, turn: state.turnCount });
    return { kind: 'answer', text: answer, streamed: Boolean(onToken), state, offline: true, provenance, ...extra };
  };
  if (meta) return reply(localMetaAnswer(meta, state, provenance));
  state.agreed = extractContextHeuristically(state.agreed, text);
  const decision = decideExecution({ text, hasBuild: hasBuild(state) });
  if (decision.execute) {
    const readiness = contextReadiness(state.agreed, { hasBuild: hasBuild(state) });
    if (!readiness.ready) return reply(readiness.reason === 'nothing-new' ? REFUSAL_NOTHING_NEW : REFUSAL_EMPTY, { refusal: true });
    return executeBuild(text, state, { bus, onProgress, readiness, offline: true });
  }
  return reply(offlineDiscussionReply(state, provenance));
}

/* --------------------------------------------------------------- converse ---- */

export async function converse(request, state, { bus = new EventBus(), onProgress = () => {}, onToken } = {}) {
  const text = String(request ?? '').trim();
  ensureConversationState(state);
  // A workspace path in the message switches the target folder (the CLI also handles this live).
  const pathMatch = text.match(/([A-Za-z]:\\[^\s"'`]+|\/(?:home|Users)\/[^\s"'`]+)/);
  if (pathMatch) {
    try {
      const resolved = path.resolve(pathMatch[1].replace(/[,.;]+$/, ''));
      fs.mkdirSync(resolved, { recursive: true });
      if (resolved !== state.workspaceDir) { state.workspaceDir = resolved; state.workspacePath = resolved; state.config = loadConfig({ workspaceDir: resolved }); }
    } catch { /* keep current workspace */ }
  }
  state.turnCount += 1;
  state.conversation.push({ role: 'user', text, turn: state.turnCount });
  if (!text) return { kind: 'empty', state };

  const meta = matchMeta(text);
  if (meta === 'status' || meta === 'workspace') {
    const answer = localMetaAnswer(meta, state);
    onToken?.(answer);
    state.conversation.push({ role: 'assistant', text: answer, turn: state.turnCount });
    return { kind: 'answer', text: answer, streamed: Boolean(onToken), state };
  }

  const router = createRouter({ config: state.config, bus });
  let live = false;
  try { live = await router.hasLiveModel(); } catch { live = false; }
  if (!live) return offlineTurn(text, state, { bus, onProgress, onToken, meta });

  // Ground the chat in the actual workspace (cheap, read-only).
  try {
    const inspection = inspectWorkspace(state.workspaceDir, state.config);
    state.lastInspection = { projectKind: inspection.projectKind, framework: inspection.framework, styling: inspection.styling, fileCount: inspection.fileCount, isEmpty: inspection.isEmpty };
  } catch { /* keep previous knowledge */ }
  const built = hasBuild(state);
  const system = buildConversationSystemPrompt({
    workspaceDir: state.workspaceDir, inspection: state.lastInspection, agreedBlock: renderAgreedContext(state.agreed), hasBuild: built,
    buildFiles: state.activeFiles, recentOutcome: state.taskHistory.at(-1) ? `${state.taskHistory.at(-1).status} (${state.taskHistory.at(-1).mode})` : '',
  });
  const history = state.conversation.slice(-14).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text ?? '').slice(0, 4000) }));
  // A turn that may execute (or be refused) is not streamed: the runtime decides
  // first, so the user never sees "On it." followed by a refusal.
  const mayExecute = isExplicitTrigger(text) || hasExecutionVerb(text);
  const streamer = makeStreamer(mayExecute ? undefined : onToken);
  let response;
  try {
    response = await router.text(undefined, { kind: 'chat', system, messages: history, liveOnly: true, maxTokens: 900, temperature: 0.6, onToken: mayExecute ? undefined : streamer.onToken, phase: 'chat' });
  } catch (error) {
    const provenance = `live model failed: ${String(error?.message ?? error).slice(0, 220)} — answering from the local engine`;
    bus.emit('warn', { message: provenance });
    return offlineTurn(text, state, { bus, onProgress, onToken, meta, provenance });
  }
  const parsed = parseConversationReply(response.text);
  const streamed = mayExecute ? false : streamer.finish(parsed.reply);
  // The deterministic extractor ALWAYS runs first, then the model's patch is
  // merged on top. A model patch that omits a field used to silently drop it:
  // a brief listing "no purple, no glass, no gradients" came back with an empty
  // rejected list because the model reported only the fields it felt like.
  state.agreed = extractContextHeuristically(state.agreed, text);
  if (Object.keys(parsed.patch ?? {}).length) {
    state.agreed = mergeContextPatch(state.agreed, parsed.patch, { source: 'model' });
  }
  const decision = decideExecution({ text, modelIntent: parsed.intent, hasBuild: built });
  if (!decision.execute) {
    const answer = parsed.reply || '(no reply)';
    if (mayExecute && onToken) onToken(answer);
    state.conversation.push({ role: 'assistant', text: answer, turn: state.turnCount });
    return { kind: 'answer', text: answer, streamed: streamed || (mayExecute && Boolean(onToken)), state, intent: parsed.intent ?? 'discuss', ready: parsed.ready, missing: parsed.missing };
  }
  const readiness = contextReadiness(state.agreed, { hasBuild: built });
  if (!readiness.ready) {
    const refusal = readiness.reason === 'nothing-new' ? REFUSAL_NOTHING_NEW : REFUSAL_EMPTY;
    const answer = parsed.reply && parsed.intent !== 'build' ? `${parsed.reply}\n${refusal}` : refusal;
    if (onToken) onToken(streamed ? `\n${refusal}` : answer);
    state.conversation.push({ role: 'assistant', text: answer, turn: state.turnCount });
    return { kind: 'answer', text: answer, streamed: Boolean(onToken), state, refusal: true, intent: parsed.intent };
  }
  if (parsed.reply) {
    if (onToken && !streamed) onToken(parsed.reply);
    state.conversation.push({ role: 'assistant', text: parsed.reply, turn: state.turnCount });
  }
  return executeBuild(text, state, { bus, onProgress, readiness });
}
