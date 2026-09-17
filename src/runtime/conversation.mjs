/** Conversation owns intent; the existing generator is exposed as one tool. */
import { createRouter } from '../model/router.mjs';
import { loadConfig } from '../core/config.mjs';
import { runBuild } from './agent-build.mjs';
import { parseToolCalls } from '../agent/agent.mjs';
import { EventBus } from '../core/events.mjs';
import { renderAgreedContext } from './agreed-context.mjs';

// ---------------------------------------------------------------------------
// Offline heuristics (no live model).
// A normal discussion message must NEVER enter the liveOnly provider path:
// router.text(..., { liveOnly: true }) with an empty chain throws
// `no provider produced text for "chat"`. Offline turns are routed here:
// discussion -> local answer (no provider call), explicit build triggers ->
// runBuild (deterministic engine, works offline).
// ---------------------------------------------------------------------------
const SHORT_GO_RE = /^(okay cool start work|yea go a ?head|go ahead|start|build it|ok|okay|yea|yes|yeah go|go a head|okay,?\s*go build it|okay,?\s*build it|okay,?\s*implement it|please build|do it|make it|implement it|let'?s build|let'?s do it|ship it|build this)\.?$/i;
const DETAILED_BUILD_RE = /\b(build|create|scaffold|generate)\b/i;

function looksLikeBuildHistory(state) {
  try {
    if (state?.designIntent) return true;
    if (state?.designIntentObj && (state.designIntentObj.product || state.designIntentObj.pageType || state.designIntentObj.visualDirection?.length || state.designIntentObj.features?.length)) return true;
    if (state?.agreed && (state.agreed.product || state.agreed.purpose || state.agreed.visualDirection?.length || state.agreed.acceptedIdeas?.length)) return true;
    if (Array.isArray(state?.conversation) && state.conversation.some((m) => /landing|3d|floating|phone|theme|ai tool|hero|page|site|app/i.test(String(m.text ?? '')))) return true;
  } catch {}
  return false;
}

/** Explicit "talk first, don't build yet" signals beat build-verb heuristics. */
const DISCUSS_FIRST_RE = /\blet'?s discuss\b|\bdiscuss\b.{0,20}\bfirst\b|\bfirst\b.{0,20}\bdiscuss\b|\bdon'?t build\b|\bdo not build\b|\bnot yet\b|\bno code yet\b|\bwhat do you think\b|\bhelp me decide\b/i;

/** Session-meta messages: about the session itself, not the design. These get
 * direct local answers — never the generic design-intent template. */
const META_GREETING_RE = /^(hi|hiya|hello|hey|yo|salam|marhaba|good\s?(morning|afternoon|evening))\b/i;
const META_WORKSPACE_RE = /\bworkspace\b|\bpwd\b|which (folder|directory|path)|what (folder|directory|path|workspace)|where (are|r) (you|u) (working|building)|where.{0,25}files? (going|written|saved|built)|working (directory|folder)/i;
const META_STATUS_RE = /^[/]?status\??$|what (have|did) you (done|built|changed|made)|(show|give|tell).{0,25}(status|progress|todos?)|progress so far|summary so far|what'?s the (status|progress)|how'?s it (going|coming)/i;
const META_IDENTITY_RE = /^(who are you|what are you)\??$|what is artisan|who (made|built|created) you|what (model|llm) are you/i;
const META_HELP_RE = /^(help|what can you do\??|commands\??)$/i;
const META_THANKS_RE = /^(thanks|thank you|thx|shukran)\b/i;

function matchSessionMeta(text) {
  const t = String(text ?? '').trim();
  if (!t || t.startsWith('/')) return null;
  // A real build/creation request always wins over meta interpretation
  // ("build a workspace dashboard", "hey, build me…", "thanks, now build it").
  const wantsBuild = DETAILED_BUILD_RE.test(t) || SHORT_GO_RE.test(t.trim().toLowerCase());
  if (wantsBuild) return null;
  if (META_GREETING_RE.test(t) && t.length < 30) return 'greeting';
  if (META_WORKSPACE_RE.test(t)) return 'workspace';
  if (META_STATUS_RE.test(t)) return 'status';
  if (META_IDENTITY_RE.test(t)) return 'identity';
  if (META_HELP_RE.test(t)) return 'help';
  if (META_THANKS_RE.test(t) && t.length < 30) return 'thanks';
  return null;
}

/** Compact session report for "status"-type questions (local, no provider). */
function offlineStatusText(state) {
  const lines = [
    `Workspace: ${state.workspaceDir ?? process.cwd()}`,
    `Turns: ${state.turnCount ?? 0} | phase: ${state.phase ?? 'discuss'}`,
  ];
  const last = (state.taskHistory ?? []).at(-1);
  lines.push(last
    ? `Last build: ${last.taskType ?? 'task'} — ${last.status} (${(last.files ?? []).join(', ') || 'no files'})`
    : 'No builds yet — describe the idea, then say "Build it".');
  if (state.activeFiles?.length) lines.push(`Files: ${state.activeFiles.join(', ')}`);
  const todos = state.todoItems ?? [];
  if (todos.length) {
    lines.push('TODOs:');
    for (const t of todos) {
      const box = t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[→]' : t.status === 'blocked' ? '[!]' : '[ ]';
      lines.push(`  ${box} ${t.title ?? t.description ?? t.id}`);
    }
  }
  if (state.unresolvedIssues?.length) lines.push(`Issues: ${state.unresolvedIssues.join('; ')}`);
  return lines.join('\n');
}

function answerSessionMeta(kind, state) {
  switch (kind) {
    case 'greeting':
      return `Hey — I'm Artisan. Tell me what you want to build and we'll refine it together; say "Build it" when you want the code.\nWorking in: ${state.workspaceDir ?? process.cwd()}`;
    case 'workspace': {
      const lines = ['I\'m working in:', `${state.workspaceDir ?? process.cwd()}`];
      if (state.activeFiles?.length) lines.push(`Files so far: ${state.activeFiles.join(', ')}`);
      else lines.push('No files written yet — describe what to build, then say "Build it".');
      return lines.join('\n');
    }
    case 'status':
      return offlineStatusText(state);
    case 'identity':
      return `I'm Artisan — a frontend design and engineering agent. You talk through the idea with me, and when you say "Build it" I implement it as real HTML/CSS/JS files, then verify and QA them.\nWorking in: ${state.workspaceDir ?? process.cwd()}`;
    case 'help':
      return 'Describe your idea and we refine it together; say "Build it" when you want code. Useful commands: /status (session + TODOs), /todo, /skills, /help.';
    case 'thanks':
      return 'Anytime. Keep refining the idea, or say "Build it" when ready.';
    default:
      return '';
  }
}

/** Offline: is this turn an explicit request to execute (not discussion)? */
function isOfflineBuildRequest(request, state) {
  const raw = String(request ?? '').trim();
  if (!raw) return false;
  // The user explicitly asked to talk first — never execute, even with build verbs.
  if (DISCUSS_FIRST_RE.test(raw)) return false;
  const lower = raw.toLowerCase();
  // Short explicit triggers ("Okay, go build it.", "Do it.") — exact-ish match only.
  if (raw.length < 40 && SHORT_GO_RE.test(lower)) return looksLikeBuildHistory(state) || /^(build it|go ahead|start|make it|do it)\.?$/.test(lower);
  if (/^okay,?\s*implement it\.?$/i.test(lower)) return true;
  if (/^let'?s build(\s+this)?\.?$/i.test(lower)) return true;
  // Detailed build request with a create verb + substance.
  if (DETAILED_BUILD_RE.test(raw) && raw.length > 18) return true;
  if (/^\s*build me\b/i.test(raw)) return true;
  return false;
}

/** Best-effort intent fold for direct converse() callers (executeTurn already folds). */
function foldOfflineIntent(request, state) {
  try {
    const text = String(request ?? '').trim();
    if (!text || /^\//.test(text)) return;
    // Session-meta ("hi", "what workspace…", "status") carries no design
    // signal — folding it would pollute purpose/designIntent with the question.
    if (matchSessionMeta(text)) return;
    // Agreed context — skip when executeTurn already folded this exact turn.
    if (state.agreed && state.agreed.decisions?.at?.(-1)?.text !== text.slice(0, 160)) {
      // Inline minimal fold to avoid a cycle (interactive.mjs imports converse).
      const lower = text.toLowerCase();
      for (const w of ['cinematic', 'immersive', 'premium', 'minimal', 'dark', 'light', 'motion', 'parallax', '3d']) {
        if (lower.includes(w) && !state.agreed.visualDirection.includes(w)) state.agreed.visualDirection.push(w);
      }
      if (!state.agreed.purpose && text.length > 24) state.agreed.purpose = text.slice(0, 160);
      state.agreed.decisions.push({ text: text.slice(0, 160), at: new Date().toISOString() });
      if (state.agreed.decisions.length > 24) state.agreed.decisions = state.agreed.decisions.slice(-24);
    }
    // Legacy string intent.
    if (!state.designIntent && text.length > 8) state.designIntent = text.slice(0, 300);
    else if (text.length > 10 && state.designIntent && !state.designIntent.toLowerCase().includes(text.toLowerCase().slice(0, 20))) {
      state.designIntent = `${state.designIntent} | ${text}`.slice(0, 600);
    }
  } catch {}
}

/** Offline discussion reply — local, honest, no provider call, no fake build. */
function offlineDiscussionReply(request, state) {
  const d = state?.designIntentObj ?? {};
  const agreed = state?.agreed;
  const hasBuild = (state?.taskHistory?.length ?? 0) > 0 || (state?.activeFiles?.length ?? 0) > 0;
  const bits = [];
  if (d.product) bits.push(`for ${d.product}`);
  else if (agreed?.product) bits.push(`for ${agreed.product}`);
  if (d.visualDirection?.length) bits.push(d.visualDirection.join(' + '));
  else if (agreed?.visualDirection?.length) bits.push(agreed.visualDirection.join(' + '));
  const topic = bits.length ? ` ${bits.join(' ')}` : '';
  if (!hasBuild) {
    const lines = [`Got it —${topic || ' noted'}.`];
    const ux = [];
    if (d.pageType) ux.push(d.pageType);
    if (d.features?.length) ux.push(...d.features.slice(0, 3));
    else if (agreed?.acceptedIdeas?.length) ux.push(...agreed.acceptedIdeas.slice(-2));
    if (ux.length) lines.push(`Direction: ${[...new Set(ux)].join(', ')}.`);
    let question = '';
    if (!d.product && !agreed?.product) question = 'What product or brand is this for?';
    else if (!d.motion && !agreed?.motion?.length) question = 'Should motion be subtle or more pronounced?';
    if (question) {
      lines.push(`Quick question: ${question}`);
      lines.push(`Say "Build it" when ready, or keep refining the idea.`);
    } else {
      lines.push(`This is ready to build. Say "Build it" when you want me to start, or keep refining.`);
    }
    return lines.join('\n');
  }
  // Post-build refinement discussion: acknowledge, confirm scope, wait for "Do it".
  const files = (state?.activeFiles ?? []).slice(-4).join(', ');
  const lines = [`Understood —${topic || ' noted'}.`];
  if (files) lines.push(`Current build: ${files}.`);
  lines.push(`I'll apply this to the existing project (no fresh scaffold). Say "Do it" and I'll modify the files.`);
  return lines.join('\n');
}

/** Sanitize context so it never poisons classifyTaskType (see interactive.mjs).
 * Skill ids / page nouns / build verbs injected as context would flip a
 * follow-up refinement into a fresh create-page/component build. */
function sanitizeContext(s, maxLen = 200) {
  return String(s ?? '')
    .replace(/\b(build|create|generate|scaffold|design|redesign)\b/gi, 'work on')
    .replace(/\b(micro-interactions|responsive-design|animation-principles|page-transitions|motion|responsive|3d|parallax|transition)\b/gi, 'style')
    .replace(/\b(login|log in|sign in|sign-?in|sign up|sign-?up|register|registration|auth|passkey)\b/gi, 'item')
    .replace(/\b(button|card|badge|modal|navbar|nav bar|footer|header|input|checkbox|toggle|tag|chip|tooltip|dropdown|hero|pricing table|pricing|testimonial|faq|form field|search bar|sidebar)\b/gi, 'item')
    .replace(/\b(landing|marketing site|homepage|home page|website|web ?site|site|page|screen)\b/gi, 'item')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/** Hard execution precondition: "build it" means "execute the idea we already
 * discussed" — never "invent a project". A short trigger may only execute when
 * the session holds sufficient ACTIONABLE context:
 *   - initial build: a described object (page/site/component/…) + ≥2 signals
 *     (product, page type, visuals, features, motion/depth, requirements)
 *   - follow-up build: a NEW substantive user message since the last build
 * A detailed request ("Build a landing page for X") carries its own context.
 * Returns { ready, mode, kind? } — never invent, refuse gracefully instead. */
const OBJECT_NOUNS_RE = /\b(landing|page|site|website|app|dashboard|component|hero|section|login|form|button|card|nav|pricing|testimonial|faq|header|footer|sidebar)\b/i;

function isBareTrigger(text) {
  const t = String(text ?? '').trim().toLowerCase();
  return (t.length < 40 && SHORT_GO_RE.test(t))
    || /^okay,?\s*implement it\.?$/i.test(t)
    || /^let'?s build(\s+this)?\.?$/i.test(t);
}

/** Design substance of one turn; meta/trigger/noise contribute nothing. */
function turnSubstance(text) {
  const t = String(text ?? '').trim();
  if (!t || t.startsWith('/')) return 0;
  if (matchSessionMeta(t)) return 0;
  if (isBareTrigger(t)) return 0;
  return t.length;
}

function stateSignals(state) {
  const d = state?.designIntentObj ?? {};
  const a = state?.agreed ?? {};
  let signals = 0;
  if (d.product || a.product) signals += 2;
  if (d.pageType) signals += 1;
  signals += Math.min(2, (d.visualDirection ?? []).length);
  signals += Math.min(2, (d.features ?? []).length);
  signals += Math.min(2, (a.acceptedIdeas ?? []).length);
  if (d.motion || (a.motion ?? []).length) signals += 1;
  if (d.depth || (a.depth3d ?? []).length) signals += 1;
  if ((state?.designIntent ?? '').length > 40) signals += 1;
  const hasObject = Boolean(
    d.product || d.pageType || (d.features ?? []).length || a.product
    || (a.acceptedIdeas ?? []).length
    || OBJECT_NOUNS_RE.test(`${state?.designIntent ?? ''} ${a.purpose ?? ''}`),
  );
  return { hasObject, signals };
}

export function assessBuildReadiness(request, state) {
  const raw = String(request ?? '').trim();
  const short = raw.length < 40;
  const hasPriorBuild = ((state?.taskHistory ?? []).length > 0) || ((state?.activeFiles ?? []).length > 0);
  // A detailed request carries its own context — but must name something real.
  if (!short) {
    if (OBJECT_NOUNS_RE.test(raw) && raw.length > 24) {
      return { ready: true, mode: hasPriorBuild ? 'refine' : 'create' };
    }
    return { ready: false, kind: 'vague-request' };
  }
  // Short trigger ("build it", "do it"): context must already exist.
  if (!hasPriorBuild) {
    const { hasObject, signals } = stateSignals(state);
    if (hasObject && signals >= 2) return { ready: true, mode: 'create' };
    return { ready: false, kind: 'empty-context' };
  }
  // Follow-up trigger: require NEW substance since the last build, otherwise
  // we'd rebuild the identical project (or invent changes).
  const since = state?.lastBuildTurn ?? -1;
  const fresh = (state?.conversation ?? []).filter(
    (m) => m?.role === 'user' && (m.turn ?? 1) > since && turnSubstance(m.text) > 10,
  );
  if (fresh.length) return { ready: true, mode: 'refine' };
  return { ready: false, kind: 'nothing-new' };
}

/** Graceful refusal: ask for the idea, create nothing, corrupt nothing. */
function refuseBuild(readiness, state, { onToken } = {}) {
  const text = readiness?.kind === 'nothing-new'
    ? 'The current build already reflects everything we\'ve discussed. Tell me what to change — the hero, colors, motion, layout — and say "Do it" when ready.'
    : 'I can build it, but we haven\'t decided what we\'re building yet. Tell me the idea or give me the project direction first — for example, what kind of page or product it\'s for.';
  onToken?.(text);
  state.conversation.push({ role: 'assistant', text });
  return { kind: 'answer', text, streamed: true, state, refusal: true, offline: true };
}

/** Offline build synthesis — honors ALL accumulated context, refines when files exist. */
function synthesizeOfflineBuildRequest(request, state) {
  const raw = String(request ?? '').trim();
  const short = raw.length < 40;
  const hasPriorBuild = (state?.taskHistory?.length ?? 0) > 0 || (state?.activeFiles?.length ?? 0) > 0;
  const agreedBlock = renderAgreedContext(state?.agreed);
  const recent = (state?.conversation ?? []).slice(-6).map((m) => String(m.text ?? '')).join(' | ').slice(0, 800);
  const wsHint = state?.workspaceDir && state.workspaceDir !== process.cwd() ? ` in ${state.workspaceDir}` : '';
  if (!short) return `${raw}${wsHint}${agreedBlock ? `\n[agreed context — implement ALL of this:\n${agreedBlock}]` : ''}`;
  // Short trigger ("Okay, go build it." / "Do it."): expand from accumulated intent.
  const d = state?.designIntentObj ?? {};
  const parts = [];
  if (hasPriorBuild) {
    // Refinement of the live project. The "Refine existing:" prefix is the
    // deterministic classifier's enhance cue (see interactive.mjs) — it keeps
    // follow-ups on the modify-in-place path instead of fresh scaffolds.
    const userTurns = (state?.conversation ?? []).filter((m) => m.role === 'user').map((m) => String(m.text ?? ''));
    const latestIdea = [...userTurns].reverse().find((t) => t && !SHORT_GO_RE.test(t.trim().toLowerCase()) && t.trim().toLowerCase() !== raw.toLowerCase());
    const ctxParts = [];
    if (state?.activeFiles?.length) ctxParts.push(`Active files: ${state.activeFiles.slice(0, 6).join(', ')}`);
    if (state?.designIntent) ctxParts.push(`Context: ${sanitizeContext(state.designIntent)}`);
    const idea = (latestIdea ?? state?.designIntent ?? raw).slice(0, 300);
    parts.push(`Refine existing: ${idea}${ctxParts.length ? ` [session context: ${ctxParts.join(' | ')}]` : ''}`);
    // Follow-up agreed block is sanitized: raw labels ("3d:", "motion:") and
    // values would trip capability rules in classifyTaskType and flip an
    // enhance refinement into a 3d/motion task. Rejections survive sanitizing.
    const followAgreed = agreedBlock ? sanitizeContext(agreedBlock, 600) : '';
    if (wsHint) parts.push(wsHint.trim());
    let out = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (!/[.]$/.test(out)) out += '.';
    if (followAgreed) out += `\n[agreed context — implement ALL of this, respect every REJECTED item:\n${followAgreed}]`;
    return out;
  } else {
    parts.push('Build');
    if (d.visualDirection?.length) parts.push(`a ${d.visualDirection.join(', ')}`);
    parts.push(d.pageType || 'landing page');
    if (d.product) parts.push(`for ${d.product}`);
    const details = [];
    if (d.features?.length) details.push(`with ${d.features.slice(0, 4).join(', ')}`);
    if (d.motion) details.push(`with ${d.motion} motion`);
    if (d.depth === '3d') details.push('with Three.js 3D depth');
    details.push('and responsive design');
    if (details.length) parts.push(details.join(', '));
    if (recent && !state?.designIntent) parts.push(`Context: ${recent}`);
    else if (state?.designIntent) parts.push(`Context: ${String(state.designIntent).slice(0, 400)}`);
  }
  if (wsHint) parts.push(wsHint.trim());
  let out = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!/[.]$/.test(out)) out += '.';
  // NOTE: header deliberately avoids CREATE_VERB words (build/create/design/
  // generate/scaffold) — "agreed design context" would flip a refinement into
  // a fresh create-page via rule 0 of classifyTaskType.
  if (agreedBlock) out += `\n[agreed context — implement ALL of this, respect every REJECTED item:\n${agreedBlock}]`;
  return out;
}

/** True when the router failed because no live provider produced anything
 * (health probe was a false positive: revoked key, quota, server down). */
function isNoProviderError(error) {
  return /no provider produced text/i.test(String(error?.message ?? error));
}

/** Local turn: session-meta answered directly, discussion answered from intent,
 * build triggers executed offline. */
async function offlineTurn(request, state, { bus, history, onToken, onProgress = () => {} } = {}) {
  try {
    const meta = matchSessionMeta(request);
    if (meta) {
      const text = answerSessionMeta(meta, state);
      onToken?.(text);
      state.conversation.push({ role: 'assistant', text });
      return { kind: 'answer', text, streamed: true, state, offline: true };
    }
    if (isOfflineBuildRequest(request, state)) {
      const readiness = assessBuildReadiness(request, state);
      if (!readiness.ready) return refuseBuild(readiness, state, { onToken });
      const buildRequest = synthesizeOfflineBuildRequest(request, state);
      return await runBuildAndRecord(buildRequest, request, state, { bus, history, onToken, onProgress });
    }
    foldOfflineIntent(request, state);
    const text = offlineDiscussionReply(request, state);
    onToken?.(text);
    state.conversation.push({ role: 'assistant', text });
    return { kind: 'answer', text, streamed: true, state, offline: true };
  } catch (error) {
    const text = String(error?.message ?? error);
    state.conversation.push({ role: 'assistant', text: `Unable to finish: ${text}` });
    return { kind: 'error', error: text, state };
  }
}

async function runBuildAndRecord(buildRequest, originalRaw, state, { bus, history, onToken, onProgress }) {
  state.currentTask = buildRequest;
  state.phase = 'build';
  state.designIntent = buildRequest.slice(0, 600);
  const off = bus.on((event) => {
    if (event.type === 'file.write') onProgress({ type: 'edit', text: event.rel });
    if (event.type === 'skills.retrieved') onProgress({ type: 'skill', text: event.ids.join(', ') });
    if (event.type === 'thought') onProgress({ type: 'inspect', text: String(event.text).slice(0, 240) });
  });
  let outcome;
  try {
    outcome = await runBuild(buildRequest, { workspaceDir: state.workspaceDir, config: state.config, bus, history, onToken, progress: onProgress, agreed: state.agreed });
  } finally { off(); }
  const run = outcome.run;
  state.lastBuildTurn = state.turnCount ?? 0;
  state.activeFiles = [...new Set([...(state.activeFiles ?? []), ...run.writes.map((w) => w.rel)])];
  state.skillsUsed = [...new Set([...(state.skillsUsed ?? []), ...(run.skills?.ids ?? [])])];
  state.todoItems = (run.plan?.steps ?? []).map((step) => ({ ...step, status: run.status === 'done' ? 'completed' : 'blocked' }));
  state.taskHistory.push({ request: originalRaw, taskType: run.understanding?.taskType, status: run.status, files: run.writes.map((w) => w.rel) });
  const summary = `${run.status}: ${run.summary || 'Build finished.'} Files: ${run.writes.map((w) => w.rel).join(', ') || 'none'}`;
  state.conversation.push({ role: 'assistant', text: summary });
  return { kind: 'task', run, summary, state };
}

export async function converse(request, state, { bus = new EventBus(), onProgress = () => {}, onToken } = {}) {
  // persist workspace path if user mentioned it earlier (chat.mjs also handles live switch, this is fallback)
  const pathMatch = String(request ?? '').match(/([A-Za-z]:\\[^\s"'`]+)/);
  if (pathMatch) {
    try {
      const { default: path } = await import('node:path');
      const { default: fs } = await import('node:fs');
      const resolved = path.resolve(pathMatch[1].replace(/[,.;]+$/, ''));
      fs.mkdirSync(resolved, { recursive: true });
      state.workspaceDir = resolved;
      state.workspacePath = resolved;
    } catch {}
  }

  state.config ??= loadConfig({ workspaceDir: state.workspaceDir });
  const router = createRouter({ config: state.config, bus });
  state.turnCount = (state.turnCount ?? 0) + 1;
  state.conversation ??= [];
  state.activeFiles ??= [];
  state.skillsUsed ??= [];
  state.taskHistory ??= [];
  state.conversation.push({ role: 'user', text: request, turn: state.turnCount });
  const history = state.conversation.slice(-16).map((m) => ({ role: m.role, content: String(m.text).slice(0, 6000) }));
  const system = `You are Artisan, a senior frontend architect + design engineer in a terminal. You think like an insane planner — you break every request into structure → design system → layout → interactivity → polish, but you NEVER show your planning to the user.

Converse naturally for greetings/small talk. But when the user describes something to BUILD (landing page, 3d, floating, theme, etc.), you do NOT write code snippets in chat and you do NOT ask endless questions. You THINK deeply in one silent step (hidden behind the "Thinking..." animation the terminal shows), then immediately call buildSite. Your thinking is not visible — only the final build result is.

PLANNING (internal, insane detail, hidden — just enrich the build request):
1. Confirm page structure in one sentence (hero, features, footer, pricing, etc.)
2. Design system: spacing 4/8/16/24/32/48/64, type 14/16/20/24/32/48, colors (primary/neutral/accent from user's theme + white/black), Grid/Flexbox only, 768px breakpoint, separate CSS file, semantic HTML, single h1.
3. 3D/floating: Three.js for phone (lightweight, <100k), CSS parallax + floating orbs for points, performant, prefers-reduced-motion guard, no heavy canvas.
4. Enrich the build request with ALL details from conversation (e.g., "dark blue theme #0f172a, 3D phone, floating points, premium editorial").

TOOL: buildSite(request). This invokes the frontend builder that writes real files to disk.
- Call it as soon as the user has described what to build, even if some details are missing — pick the most standard interpretation and proceed. Ask at most ONE clarifying question total ever, then build anyway. Never ask "what 3D elements?" if user already said "phone".
- To call buildSite, emit ONLY this and nothing else — no prose, no breakdown, no "Sure! Let's break down":
\`\`\`json
[{"tool":"buildSite","args":{"request":"<complete detailed request with all requirements + workspace if mentioned>"}}]
\`\`\`
Otherwise respond in natural language (greetings, thanks, questions). Never claim files changed before receiving a tool result. Never write code examples in chat — real files are written via buildSite.

Workspace: ${state.workspaceDir}
Known files: ${(state.activeFiles ?? []).join(', ') || 'none yet'}
Last build: ${state.currentTask || 'none'}`;
  let streamed = false;
  // --- OFFLINE PATH: no live model. Discussion stays local (never enters the
  // liveOnly provider path); only explicit build triggers execute via runBuild
  // (deterministic engine). No fake responses: builds report real run status.
  const hasLive = await router.hasLiveModel().catch(() => false);
  if (!hasLive) {
    return offlineTurn(request, state, { bus, history, onToken, onProgress });
  }
  let reply;
  try {
    // Do NOT stream the initial chat reply — we need to know if it's a tool call first.
    // If it's a tool call we hide the planning prose entirely (user sees only Thinking...).
    reply = await router.text(undefined, { kind: 'chat', system, messages: history, maxTokens: 1600, temperature: 0.35, liveOnly: true });
  } catch (error) {
    // The health probe claimed a live model, but generation produced nothing
    // (key revoked, quota exhausted, server down). Fall back to local handling
    // instead of surfacing the raw provider error for a discussion turn.
    if (isNoProviderError(error)) {
      return offlineTurn(request, state, { bus, history, onToken, onProgress });
    }
    throw error;
  }
  try {
    const parsed = parseToolCalls(reply.text);
    let build = parsed.calls.find((call) => call.tool === 'buildSite');

    // Fallback: if model didn't call buildSite but user said "okay cool start work" / "yea go ahead", synthesize from history
    const isShortGo = /^(okay cool start work|yea go a ?head|go ahead|start|build it|ok|okay|yea|yes|yeah go|go a head)\b/i.test(String(request ?? '').trim().toLowerCase()) && (state.designIntent || state.conversation.some(m => /landing|3d|floating|phone|theme|ai tool/i.test(m.text)));
    if (!build && isShortGo) {
      // Synthesize from accumulated intent + last user messages
      const recent = state.conversation.slice(-6).map(m => m.text).join(' | ').slice(0, 800);
      const workspaceHint = state.workspaceDir && state.workspaceDir !== process.cwd() ? ` in ${state.workspaceDir}` : (String(request).match(/[A-Za-z]:\\[^\s]+/)?.[0] ? ` in ${String(request).match(/[A-Za-z]:\\[^\s]+/)[0]}` : '');
      const synth = `Build premium landing for AI tool with ${recent}${workspaceHint} — dark blue theme, 3D phone with Three.js, floating points with CSS parallax, hero CTA, features x3, footer, separate CSS/JS, Grid/Flexbox, 768px breakpoint, prefers-reduced-motion.`;
      build = { tool: 'buildSite', args: { request: synth } };
    }

    if (!build) {
      // Not a build — stream the answer now (so Thinking... stops and text appears)
      if (reply.text) { onToken?.(reply.text); streamed = true; }
      state.conversation.push({ role: 'assistant', text: reply.text });
      return { kind: 'answer', text: reply.text, streamed, state };
    }
    if (typeof build.args.request !== 'string' || !build.args.request.trim()) {
      // Model called buildSite with empty request — synthesize from history + current input
      const recent = state.conversation.slice(-4).map(m => m.text).join(' | ').slice(0, 800);
      const wsHint = state.workspaceDir && state.workspaceDir !== process.cwd() ? ` in ${state.workspaceDir}` : '';
      build.args.request = `Build premium landing for AI tool Neura — dark blue #06070a, 3D phone with Three.js, floating points, hero with Start Building CTA, 3 features, footer${wsHint} | ${recent} | ${String(request).slice(0, 400)}`.slice(0, 1200);
    }
    // Hard precondition (both paths): never invent a project. A model-requested
    // build with no actionable context is refused gracefully, like a trigger.
    {
      const readiness = assessBuildReadiness(request, state);
      if (!readiness.ready) return refuseBuild(readiness, state, { onToken });
    }
    // The implementation input must carry the accumulated decisions explicitly.
    try {
      const block = renderAgreedContext(state.agreed);
      if (block && !build.args.request.includes('agreed')) {
        build.args.request += `\n[agreed context — implement ALL of this, respect every REJECTED item:\n${block}]`;
      }
    } catch {}
    state.currentTask = build.args.request;
    state.phase = 'build';
    state.designIntent = build.args.request;
    const off = bus.on((event) => {
      if (event.type === 'file.write') onProgress({ type: 'edit', text: event.rel });
      if (event.type === 'skills.retrieved') onProgress({ type: 'skill', text: event.ids.join(', ') });
      if (event.type === 'thought') onProgress({ type: 'inspect', text: String(event.text).slice(0, 240) });
    });
    let outcome;
    try {
      outcome = await runBuild(build.args.request, { workspaceDir: state.workspaceDir, config: state.config, bus, history, onToken, progress: onProgress, agreed: state.agreed });
    } finally { off(); }
    const run = outcome.run;
    state.lastBuildTurn = state.turnCount ?? 0;
    state.activeFiles = [...new Set([...state.activeFiles, ...run.writes.map((w) => w.rel)])];
    state.skillsUsed = [...new Set([...state.skillsUsed, ...(run.skills?.ids ?? [])])];
    state.todoItems = (run.plan?.steps ?? []).map((step) => ({ ...step, status: run.status === 'done' ? 'completed' : 'blocked' }));
    state.taskHistory.push({ request, taskType: run.understanding?.taskType, status: run.status, files: run.writes.map((w) => w.rel) });
    const summary = `${run.status}: ${run.summary || 'Build finished.'} Files: ${run.writes.map((w) => w.rel).join(', ') || 'none'}`;
    state.conversation.push({ role: 'assistant', text: summary });
    return { kind: 'task', run, summary, state };
  } catch (error) {
    const text = String(error?.message ?? error);
    state.conversation.push({ role: 'assistant', text: `Unable to finish: ${text}` });
    return { kind: 'error', error: text, state };
  }
}
