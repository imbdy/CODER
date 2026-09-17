/**
 * Interactive conversational session — stateful REPL that reuses runTask.
 *
 * Maintains compact structured state:
 * {
 *   currentTask, taskHistory, todoItems, completedWork,
 *   activeFiles, designIntent, skillsUsed, unresolvedIssues,
 *   conversation, workspaceDir, config
 * }
 *
 * Conversational memory is compact — we do NOT dump full history into every model call.
 * Follow-ups are resolved by enriching the request with recent context (designIntent,
 * activeFiles) before calling runTask.
 */

import { converse } from './conversation.mjs';
import { runBuild } from './agent-build.mjs';
import { makeId, nowIso } from '../core/util.mjs';
import { classifyTaskType } from '../reason/understand.mjs';
import { createRouter } from '../model/router.mjs';
import { EventBus } from '../core/events.mjs';
import { createAgreedContext, updateAgreedContext, agreedFromIntent, applyAgreedToRequest, renderAgreedContext } from './agreed-context.mjs';

// ------------------------------------------------ state
export function createInteractiveState({ workspaceDir, config } = {}) {
  return {
    id: makeId('chat'),
    workspaceDir: workspaceDir ?? process.cwd(),
    config,
    createdAt: nowIso(),
    // compact session state per spec
    currentTask: null,
    taskHistory: [], // { request, taskType, status, at, files }
    todoItems: [], // { id, title, status: pending|in_progress|completed|blocked, goal }
    completedWork: [], // { title, files, at }
    activeFiles: [], // rel paths touched recently
    designIntent: '', // accumulating design intent (legacy string)
    designIntentObj: {
      product: '',
      pageType: '',
      visualDirection: [],
      motion: '',
      depth: '',
      interaction: '',
      tone: '',
      responsive: false,
      constraints: [],
      features: [],
      rawHistory: [],
    },
    phase: 'discuss', // discuss → build (ONE agent; internal states only)
    agentState: 'CONVERSATION', // CONVERSATION|UNDERSTANDING|INSPECTION|SKILL_SELECTION|PLANNING|DESIGN_SPEC|IMPLEMENTATION|VISUAL_QA|ITERATION|TESTING|COMPLETED
    agreed: createAgreedContext(), // compact persistent decisions: discussion → execution
    skillsUsed: [], // ids
    unresolvedIssues: [],
    conversation: [], // { role: user|assistant, text, at }
    turnCount: 0,
    // workspace truth
    workspacePath: workspaceDir ?? process.cwd(),
  };
}

// ------------------------------------------------ TODO helpers
function buildTodosFromPlan(plan, understanding) {
  if (!plan?.steps?.length) {
    // fallback simple todos
    const t = understanding?.taskType ?? 'task';
    return [{ id: 't1', title: `Execute: ${t}`, goal: String(understanding?.subject ?? ''), status: 'pending' }];
  }
  return plan.steps.map((s, i) => ({
    id: s.id ?? `todo_${i + 1}`,
    title: s.title ?? s.goal ?? `Step ${i + 1}`,
    goal: s.goal ?? '',
    files: s.files ?? [],
    skills: s.skills ?? [],
    status: 'pending',
  }));
}

export function todoText(state) {
  if (!state.todoItems.length) return '(no active TODOs)';
  const lines = state.todoItems.map((t) => {
    const box = t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[→]' : t.status === 'blocked' ? '[!]' : '[ ]';
    return `${box} ${t.title}`;
  });
  return lines.join('\n');
}

export function statusText(state) {
  const last = state.taskHistory[state.taskHistory.length - 1];
  const intent = state.designIntentObj ?? {};
  const intentSummary = intent.product || intent.visualDirection?.length || intent.features?.length
    ? JSON.stringify({ product: intent.product, visual: intent.visualDirection, motion: intent.motion, depth: intent.depth, interaction: intent.interaction, tone: intent.tone, responsive: intent.responsive, features: intent.features, constraints: intent.constraints })
    : (state.designIntent || '(none)');
  return [
    `Session: ${state.id} | workspace: ${state.workspaceDir} | phase: ${state.phase ?? 'discuss'}`,
    `Turns: ${state.turnCount} | currentTask: ${state.currentTask ?? '(none)'}`,
    `DesignIntent: ${intentSummary}`,
    `Active files: ${state.activeFiles.slice(-8).join(', ') || '(none)'}`,
    `Skills used: ${[...new Set(state.skillsUsed)].slice(-8).join(', ') || '(none)'}`,
    `Last task: ${last ? `${last.taskType} — ${last.status} — ${last.request.slice(0, 80)}` : '(none)'}`,
    `TODO:\n${todoText(state)}`,
    state.unresolvedIssues.length ? `Issues: ${state.unresolvedIssues.join('; ')}` : '',
  ].filter(Boolean).join('\n');
}

// ------------------------------------------------ request classification
const QUESTION_RE = /^(what|why|how|which|where|when|who|is|are|can you|explain|tell me|what have you|what did you)\b/i;
const STATUS_RE = /^\s*(status|what.*changed|what.*done|todo|todos)\b/i;
const STOP_RE = /^\s*(stop|cancel|abort|wait|hold on)\s*[!.]*\s*$/i;

export function classifyMessage(text) {
  const t = String(text ?? '').trim();
  if (!t) return 'empty';
  if (/^\/\w+/.test(t)) return 'command';
  if (STOP_RE.test(t)) return 'stop';
  if (STATUS_RE.test(t) && t.length < 80) return 'status';
  if (QUESTION_RE.test(t) && !/build|make|add|create|change|update|fix|improve|refine|remove|delete|premium|responsive|motion|redesign/i.test(t)) return 'question';
  // continuation cues: short follow-ups like "make it ...", "actually...", "more ..."
  if (/^(make it|add |change |update |actually|more |keep |but |also )/i.test(t) && t.length < 120) return 'followup';
  return 'task';
}

// enrich short follow-up with session context so runTask gets enough signal
// IMPORTANT: do not inject words that poison classifyTaskType. Skill ids like "micro-interactions"
// contain "motion" triggers, page/login/card contain create-page triggers, so we never inject
// raw skill ids or raw designIntent verbatim. We sanitize heavily.
export function enrichRequest(raw, state) {
  const text = String(raw ?? '').trim();
  const type = classifyMessage(text);
  const needsContext = type === 'followup' || (text.length < 60 && state.designIntent);
  const hasPronoun = /\b(it|this|that|the (card|page|button|hero|component|login|site))\b/i.test(text);
  if ((needsContext || hasPronoun) && state.currentTask) {
    const ctxParts = [];
    // Sanitize: strip words that would misclassify next request (build/create, page/auth/component nouns, motion/responsive triggers)
    const sanitize = (s) => String(s ?? '')
      .replace(/\b(build|create|generate|scaffold|design|redesign)\b/gi, 'work on')
      .replace(/\b(micro-interactions|responsive-design|animation-principles|page-transitions|motion|responsive|3d|parallax|transition)\b/gi, 'style')
      .replace(/\b(login|log in|sign in|sign-?in|sign up|sign-?up|register|registration|auth|passkey)\b/gi, 'item')
      .replace(/\b(button|card|badge|modal|navbar|nav bar|footer|header|input|checkbox|toggle|tag|chip|tooltip|dropdown|hero|pricing table|pricing|testimonial|faq|form field|search bar|sidebar)\b/gi, 'item')
      .replace(/\b(landing|marketing site|homepage|home page|website|web ?site|site|page|screen)\b/gi, 'item')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);
    const sanitizedIntent = sanitize(state.designIntent);
    if (sanitizedIntent) ctxParts.push(`Context: ${sanitizedIntent}`);
    if (state.activeFiles.length) ctxParts.push(`Active files: ${state.activeFiles.slice(0, 4).join(', ')}`);
    if (state.skillsUsed.length) ctxParts.push(`Prior skills: ${state.skillsUsed.length} skills used`);
    const prevSanitized = sanitize(state.currentTask);
    if (ctxParts.length) {
      return `${text} [session context: ${ctxParts.join(' | ')}; previous: ${prevSanitized}]`;
    }
  }
  return text;
}

// Heuristic: short follow-ups that look like refinements of an existing page should be treated as enhance,
// not as fresh create-component/page builds. This preserves prior work (login card etc).
export function maybeEnhance(taskType, raw, state) {
  if (!state || !state.taskHistory?.length) return taskType;
  if (!['create-component', 'create-page', 'create-app'].includes(taskType)) return taskType;
  const msgKind = classifyMessage(raw);
  const hasPronoun = /\b(it|this|that|the (card|page|button|hero|component|login|site))\b/i.test(String(raw));
  const isShortFollowup = String(raw).trim().length < 90 && (msgKind === 'followup' || hasPronoun || msgKind === 'task');
  // If short and we have prior work, treat as enhance (refine existing)
  if (isShortFollowup) return 'enhance';
  return taskType;
}

// ------------------------------------------------ build trigger & design intent

const BUILD_TRIGGER_SHORT_RE = /^(build it|go ahead|start|make it|do it|build this|implement it|please build|ok build it|yes build it|let'?s do it|ship it|okay,?\s*implement it|let'?s build)\.?$/i;
const BUILD_TRIGGER_RE = BUILD_TRIGGER_SHORT_RE;
export function isBuildTrigger(text, state) {
  const raw = String(text ?? '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  // short explicit triggers — exact match only (not prefix with extra words like "Make it more premium")
  if (BUILD_TRIGGER_SHORT_RE.test(lower) && raw.length < 40) {
    if (state?.designIntentObj?.product || state?.designIntent || state?.taskHistory?.length) return true;
    if (/^(build it|go ahead|start|make it|do it)\.?$/.test(lower)) return true;
  }
  // detailed build request containing create verb + substantial content
  if (/\b(build|create|scaffold|generate)\b/i.test(raw) && raw.length > 18) return true;
  if (/^\s*build me\b/i.test(raw)) return true;
  // also "Okay, implement it." with punctuation
  if (/^okay,?\s*implement it\.?$/i.test(lower)) return true;
  if (/^let'?s build(\s+this)?\.?$/i.test(lower)) return true;
  return false;
}

export function extractDesignIntent(raw) {
  const t = String(raw ?? '').toLowerCase();
  const intent = {
    product: '',
    pageType: '',
    visualDirection: [],
    motion: '',
    depth: '',
    interaction: '',
    tone: '',
    responsive: false,
    constraints: [],
    features: [],
    rawHistory: [String(raw).trim()],
  };
  // product
  const mProduct = raw.match(/for\s+(?:an?\s+)?([^.,;]+?)(?:\s+with|\s*$|\.)/i);
  if (mProduct) {
    let p = mProduct[1].trim();
    // clean
    p = p.replace(/\b(a|an|the)\b/gi, '').trim();
    if (p.length > 2 && p.length < 60) intent.product = p;
  }
  // page type
  if (/\blanding page\b/i.test(raw)) intent.pageType = 'landing page';
  else if (/\blogin\b/i.test(raw)) intent.pageType = 'login page';
  else if (/\bpage\b/i.test(raw)) intent.pageType = 'page';

  // visual directions
  const visuals = ['premium', 'cinematic', 'minimal', 'strong hero', 'hero', 'calm', 'floating', 'dark', 'light'];
  for (const v of visuals) {
    if (new RegExp(`\\b${v}\\b`, 'i').test(raw)) {
      if (!intent.visualDirection.includes(v)) intent.visualDirection.push(v);
    }
  }
  if (/\bminimal\b/i.test(raw) && !intent.visualDirection.includes('minimal')) intent.visualDirection.push('minimal');
  if (/\bpremium\b/i.test(raw) && !intent.visualDirection.includes('premium')) intent.visualDirection.push('premium');
  if (/\bcinematic\b/i.test(raw) && !intent.visualDirection.includes('cinematic')) intent.visualDirection.push('cinematic');

  // motion
  if (/\bsubtle motion\b/i.test(raw) || (/\bsubtle\b/i.test(raw) && /\bmotion\b/i.test(raw))) intent.motion = 'subtle';
  else if (/\bstrong motion\b/i.test(raw) || /\bmotion\b/i.test(raw)) intent.motion = 'subtle';
  if (/\bno motion\b|\bremove motion\b/i.test(raw)) intent.motion = 'none';

  // depth
  if (/\b3d\b/i.test(raw)) intent.depth = '3d';
  if (/\bremove.*3d\b|\bno 3d\b/i.test(raw)) intent.depth = 'none';
  if (/\bdepth\b/i.test(raw) && !intent.depth) intent.depth = '3d';

  // interaction
  if (/\breact to.*mouse\b|\bmouse-?reactive\b|\bmouse\b/i.test(raw) && /\b3d\b/i.test(raw)) intent.interaction = 'mouse-reactive';
  else if (/\bfloating\b/i.test(raw) && /\bnav\b/i.test(raw)) intent.features.push('floating navigation');
  else if (/\bfloating\b/i.test(raw)) intent.features.push('floating');

  // tone
  if (/\bcalm\b/i.test(raw)) intent.tone = 'calm';
  if (/\bless crowded\b|\bcalmer\b/i.test(raw)) intent.tone = 'calm';
  if (/\bstrong\b/i.test(raw) && /\bhero\b/i.test(raw)) intent.features.push('strong hero');

  // responsive
  if (/\bresponsive\b/i.test(raw)) intent.responsive = true;

  // constraints
  if (/\bminimal\b/i.test(raw)) intent.constraints.push('minimal');
  if (/\bcalm\b/i.test(raw)) intent.constraints.push('calm');

  // features
  if (/\bhero\b/i.test(raw) && !intent.features.includes('hero')) intent.features.push('hero');
  if (/\bstrong hero\b/i.test(raw)) intent.features.push('strong hero');
  if (/\bnavigat/i.test(raw)) intent.features.push('navigation');

  return intent;
}

export function mergeDesignIntent(existing, update) {
  const out = { ...existing };
  if (!out.product && update.product) out.product = update.product;
  else if (update.product) out.product = update.product; // latest wins if provided
  if (update.pageType) out.pageType = update.pageType;
  for (const v of update.visualDirection ?? []) if (!out.visualDirection.includes(v)) out.visualDirection.push(v);
  // handle removals
  if (update.depth === 'none') out.depth = 'none';
  else if (update.depth) out.depth = update.depth;
  if (update.motion) out.motion = update.motion;
  if (update.interaction) out.interaction = update.interaction;
  if (update.tone) out.tone = update.tone;
  if (update.responsive) out.responsive = true;
  for (const c of update.constraints ?? []) if (!out.constraints.includes(c)) out.constraints.push(c);
  for (const f of update.features ?? []) if (!out.features.includes(f)) out.features.push(f);
  // handle negation: if raw contains "remove the 3d" etc
  const rawLower = (update.rawHistory?.[0] ?? '').toLowerCase();
  if (/\bremove\b.*\b3d\b|\bno 3d\b/.test(rawLower)) {
    out.depth = 'none';
    out.interaction = '';
  }
  if (/\bremove\b.*\bfloating\b/.test(rawLower)) {
    out.features = out.features.filter((x) => !/floating/.test(x));
  }
  out.rawHistory = [...(out.rawHistory ?? []), ...(update.rawHistory ?? [])].slice(-10);
  // prune duplicates
  out.visualDirection = [...new Set(out.visualDirection)];
  out.constraints = [...new Set(out.constraints)];
  out.features = [...new Set(out.features)];
  return out;
}

export function synthesizeBuildRequest(state) {
  const d = state.designIntentObj ?? {};
  const parts = [];
  parts.push('Build');
  if (d.visualDirection?.length) parts.push(`a ${d.visualDirection.join(', ')}`);
  if (d.pageType) parts.push(d.pageType);
  else parts.push('landing page');
  if (d.product) parts.push(`for ${d.product}`);
  const details = [];
  if (d.features?.includes('hero') || d.features?.includes('strong hero')) details.push('with a strong cinematic hero');
  if (d.depth === '3d') {
    if (d.interaction === 'mouse-reactive') details.push('with Three.js 3D scene and WebGL depth that reacts to the mouse');
    else details.push('with Three.js 3D scene and WebGL depth');
  }
  if (d.motion === 'subtle') details.push('with subtle motion and framer motion');
  else if (d.motion && d.motion !== 'none') details.push(`with ${d.motion} motion and framer motion`);
  if (d.tone === 'calm') details.push('with a calm minimal tone');
  if (d.features?.includes('floating navigation')) details.push('with floating navigation');
  if (d.responsive) details.push('and responsive design');
  else details.push('and responsive design');
  if (details.length) parts.push(details.join(', '));
  // add constraints
  if (d.constraints?.length) parts.push(`Constraints: ${d.constraints.join(', ')}.`);
  return parts.join(' ').replace(/\s+/g, ' ').trim() + '.';
}

export function generateDiscussionReply(state, raw) {
  const d = state.designIntentObj;
  const lines = [];
  lines.push(`Got it. I understand the direction${d.product ? ` for ${d.product}` : ''}${d.visualDirection?.length ? ` as ${d.visualDirection.join(' + ')}` : ''}${d.motion ? `, with ${d.motion} motion` : ''}${d.depth === '3d' ? ` and ${d.depth} depth${d.interaction ? ` (${d.interaction})` : ''}` : ''}${d.tone ? `, tone: ${d.tone}` : ''}.`);
  // Identify requirements
  const ux = [];
  if (d.features?.includes('hero')) ux.push('strong hero');
  if (d.features?.includes('floating navigation')) ux.push('floating navigation');
  if (d.pageType) ux.push(d.pageType);
  if (ux.length) lines.push(`UX: ${ux.join(', ')}.`);
  if (d.visualDirection?.length) lines.push(`Visual: ${d.visualDirection.join(', ')}.`);
  if (d.motion || d.depth) lines.push(`Interaction: ${[d.motion ? `${d.motion} motion` : '', d.depth ? `${d.depth} depth` : '', d.interaction].filter(Boolean).join(', ')}.`);
  // constraints
  if (d.constraints?.length) lines.push(`Constraints: ${d.constraints.join(', ')}.`);
  // Identify ambiguities / question
  let question = '';
  if (!d.product) question = 'What product or brand is this for?';
  else if (d.depth === '3d' && !d.interaction) question = 'Should the 3D element be decorative or interactive (e.g., react to mouse)?';
  else if (!d.motion) question = 'Should motion be subtle or more pronounced?';
  else if (d.visualDirection?.length < 2) question = 'Any specific visual references or tone you want to emphasize?';
  if (question) {
    lines.push(`Before building, I need to clarify: ${question}`);
    lines.push(`Say "Build it" when ready, or keep refining the idea.`);
  } else {
    lines.push(`This is ready to build. Say "Build it" when you want me to start, or keep refining.`);
  }
  // Suggest improvements / tradeoffs
  if (d.depth === '3d' && d.motion === 'subtle') {
    lines.push(`Note: 3D + subtle motion works well for premium feel but keep it performant (single GPU-friendly effect).`);
  }
  return lines.join('\n');
}

async function executeBuild(buildRequest, originalRaw, state, { bus, onProgress } = {}) {
  const request = String(buildRequest ?? '').trim();
  const progress = onProgress ?? (() => {});
  // Update state before run
  state.currentTask = originalRaw ?? request;
  state.turnCount += 1;
  state.conversation.push({ role: 'user', text: originalRaw ?? request, at: nowIso() });
  state.todoItems = [];
  // Also update designIntent string
  if (!state.designIntent) state.designIntent = request.slice(0, 300);
  else if (request.length > 10 && !state.designIntent.toLowerCase().includes(request.toLowerCase().slice(0, 20))) {
    state.designIntent = `${state.designIntent} | ${request}`.slice(0, 600);
  }
  let taskType = classifyTaskType(request);
  // Build trigger synthesized requests are always intended as page builds; if classification is off due to sanitized context, force enhance? But synthesized should be create-page
  progress({ type: 'understand', text: `understand → ${taskType}` });
  const liveBus = bus ?? new EventBus();
  const off = liveBus.on((ev) => {
    switch (ev.type) {
      case 'phase': progress({ type: 'inspect', text: ev.phase }); break;
      case 'thought': if (String(ev.text ?? '').length) progress({ type: 'inspect', text: String(ev.text).split('\n')[0].slice(0, 90) }); break;
      case 'skills.retrieved': for (const id of (ev.ids ?? [])) progress({ type: 'skill', text: id }); break;
      case 'plan.created': progress({ type: 'todo', text: `${ev.steps} steps planned` }); break;
      case 'file.write': progress({ type: 'edit', text: ev.rel }); break;
      case 'verify.result': progress({ type: 'verify', text: ev.summary ?? (ev.ok ? 'PASS' : 'CHECK') }); break;
      case 'improve.iteration': progress({ type: 'edit', text: `fix #${ev.iteration}` }); break;
      case 'tool.call':
        if (ev.tool && ev.tool !== 'writeFile') progress({ type: 'tool', text: `${ev.tool}${ev.args?.rel ? ` ${ev.args.rel}` : ''}${ev.args?.id ? ` ${ev.args.id}` : ''}` });
        break;
      default: break;
    }
  });
  // Enrich build request with workspace context? For initial build we don't need extra enrich, but include activeFiles if any
  let enriched = request;
  // we could enrich with workspace context but keep it minimal to avoid poisoning
  try {
    let outcome;
    outcome = await runBuild(enriched, {
      workspaceDir: state.workspaceDir,
      config: state.config,
      overrides: { maxIterations: 2 },
      bus: liveBus,
      progress,
    });
    off();
    const run = outcome.run;
    // Prefer structured todos from state-machine run; fallback to legacy plan-based todos
    let todos;
    if (run.todos?.length) {
      todos = run.todos.map(t=> ({ id: t.id, title: t.description ?? t.title, description: t.description ?? t.title, goal: t.completionCondition ?? t.description, files: t.files ?? [], skills: t.skills ?? [], status: t.status ?? (run.status==='done'?'completed': run.status==='needs-fix'?'blocked':'pending'), priority: t.priority ?? 'medium' } ));
      // If run provided todoStats, ensure statuses reflect actual run status
      if (run.status === 'done') for (const t of todos) t.status='completed';
      else if (run.status === 'needs-fix') { for(let i=0;i<todos.length-1;i++) if(todos[i].status!=='completed') todos[i].status='completed'; const last=todos[todos.length-1]; if(last && last.status!=='completed') last.status='blocked'; }
    } else {
      todos = buildTodosFromPlan(run.plan, run.understanding);
      if (run.status === 'done') {
        for (const t of todos) t.status = 'completed';
      } else if (run.status === 'needs-fix') {
        for (let i = 0; i < todos.length - 1; i++) todos[i].status = 'completed';
        if (todos.length) todos[todos.length - 1].status = 'blocked';
      } else if (run.status === 'failed') {
        if (todos.length) todos[0].status = 'blocked';
      } else {
        for (const t of todos) t.status = 'completed';
      }
    }
    state.todoItems = todos;
    if (run.skills?.ids?.length) {
      for (const sid of run.skills.ids) if (!state.skillsUsed.includes(sid)) state.skillsUsed.push(sid);
    }
    if (run.skillsRead?.length) for (const sid of run.skillsRead) if (!state.skillsUsed.includes(sid)) state.skillsUsed.push(sid);
    for (const t of todos) {
      if (t.status === 'completed') progress({ type: 'todo', text: `✓ ${t.title}` });
      else if (t.status === 'in_progress') progress({ type: 'todo', text: `→ ${t.title}` });
      else if (t.status === 'blocked') progress({ type: 'todo', text: `! ${t.title} (blocked)` });
      else progress({ type: 'todo', text: `· ${t.title}` });
    }
    for (const w of run.writes ?? []) {
      if (!state.activeFiles.includes(w.rel)) state.activeFiles.push(w.rel);
    }
    if (run.verification) {
      if (!run.verification.ok) {
        if (!state.unresolvedIssues.includes(run.verification.summary)) state.unresolvedIssues.push(run.verification.summary);
      } else {
        state.unresolvedIssues = state.unresolvedIssues.filter((x) => x !== run.verification.summary);
      }
    }
    progress({ type: 'done', text: run.status });
    state.taskHistory.push({
      request: originalRaw ?? request,
      enriched,
      taskType: run.understanding?.taskType ?? taskType,
      status: run.status,
      at: nowIso(),
      files: (run.writes ?? []).map((w) => w.rel),
      score: run.critique?.overall,
    });
    if (run.writes?.length) {
      state.completedWork.push({ title: (originalRaw ?? request).slice(0, 80), files: run.writes.map((w) => w.rel), at: nowIso() });
    }
    state.conversation.push({ role: 'assistant', text: run.status === 'done' ? `Done — ${run.understanding?.taskType ?? 'task'} completed` : `Status: ${run.status}`, at: nowIso() });
    return {
      kind: 'task',
      run,
      outcome,
      todos,
      status: run.status,
      summary: outcome.run ? `${run.status} — ${run.understanding?.taskType ?? taskType}` : 'failed',
      state,
    };
  } catch (e) {
    off();
    state.unresolvedIssues.push(String(e?.message ?? e).slice(0, 200));
    return { kind: 'error', error: String(e?.message ?? e), state };
  }
}

// ------------------------------------------------ conversation (real chat)

/** Does this message ask for code/design work, or is it just conversation? */
const REFINE_RE = /\b(build|create|make|add|change|swap|switch|use|remove|delete|drop|fix|update|rewrite|refactor|implement|animate|redesign|polish|improve|shrink|enlarge|darken|lighten|recolor|recolour|move|replace|tweak|adjust|scaffold|convert)\b|\b(hero|navbar|nav|footer|header|button|card|form|login|signup|pricing|testimonial|faq|section|page|site|website|landing|dashboard|component|css|stylesheet|font|typeface|palette|colou?r|accent|animation|transition|motion|hover|scroll|responsive|mobile|theme|layout|grid|spacing)\b/i;

export function looksLikeRefinement(text) {
  return REFINE_RE.test(String(text ?? ''));
}

/** The system prompt for plain conversation — no tools, no code, just talking. */
function chatSystemPrompt(state) {
  const intent = state.designIntentObj ?? {};
  const intentBits = [
    intent.product && `product/brand: ${intent.product}`,
    intent.pageType && `page type: ${intent.pageType}`,
    intent.visualDirection?.length && `visual direction: ${intent.visualDirection.join(', ')}`,
    intent.motion && `motion: ${intent.motion}`,
    intent.depth && `depth: ${intent.depth}`,
    intent.tone && `tone: ${intent.tone}`,
    intent.features?.length && `wants: ${intent.features.join(', ')}`,
  ].filter(Boolean);
  const inspection = state.lastInspection ?? {};
  const lines = [
    'You are Artisan — a senior frontend designer and engineer, chatting with one user in a terminal.',
    '',
    'STYLE: talk like a person. Short, warm, direct — one to four sentences unless they ask for detail.',
    'No headings, no bullet lists unless they genuinely help. Never say you are an AI or a language model.',
    'You can talk about anything: their idea, design opinions, fonts, colour, motion, tradeoffs — or small talk.',
    'If they ask how you are or say hi, answer like a friendly human teammate would ("Pretty good — ready when you are").',
    'Never deflect with "I am just a program/computer/AI".',
    'When they describe something they want built or changed, be a good design partner: reflect the direction back',
    'in a line, maybe ask ONE sharp question, and let them know to say "Build it" when they want the actual code.',
    'Never write code or file contents while chatting.',
    '',
    `Workspace: ${state.workspaceDir}`,
    `- project kind: ${inspection.kind ?? 'unknown'} | framework: ${inspection.framework ?? 'none'} | styling: ${inspection.styling ?? 'plain-css'}`,
  ];
  if (state.activeFiles.length) lines.push(`- files built so far: ${state.activeFiles.slice(0, 6).join(', ')}`);
  lines.push(intentBits.length ? `- what they asked for so far: ${intentBits.join(' | ')}` : '- what they asked for so far: nothing yet');
  return lines.join('\n');
}

/** Canned reply only used when no live model is reachable. */
function fallbackChatReply(state) {
  const intent = state.designIntent;
  if (state.activeFiles.length) {
    return `Still here. So far I built: ${state.activeFiles.join(', ')}. Tell me what to change, or say "Build it" with a new idea.`;
  }
  if (intent) {
    return `Noted — direction so far: ${String(intent).slice(0, 140)}. Say "Build it" whenever you want the code.`;
  }
  return `Hey — I'm Artisan. Tell me what you want to build (for example "a dark landing page for a coffee brand"), we refine it together, and I write the code when you say "Build it".\n\n(I can't reach a live model right now, so this reply is canned — start Ollama with qwen2.5-coder:7b for real conversation.)`;
}

/**
 * Real conversation turn: the model answers, we keep a compact history.
 * Falls back to a canned line when no LLM is reachable so the REPL never dies.
 */
export async function chatReply(rawRequest, state) {
  const request = String(rawRequest ?? '').trim();
  state.turnCount += 1;
  state.conversation.push({ role: 'user', text: request, at: nowIso() });

  // Fold real design signal into the session intent — never chitchat or questions.
  const isJustAQuestion = classifyMessage(request) === 'question' || /\?\s*$/.test(request);
  if (!isJustAQuestion && (looksLikeRefinement(request) || request.length > 40)) {
    try {
      const upd = extractDesignIntent(request);
      if (upd.product || upd.pageType || upd.visualDirection.length || upd.tone || upd.features.length || upd.depth || upd.motion) {
        state.designIntentObj = mergeDesignIntent(state.designIntentObj, upd);
        state.designIntent = state.designIntent
          ? `${state.designIntent} | ${request}`.slice(0, 600)
          : request.slice(0, 300);
      }
    } catch { /* intent capture is best-effort */ }
  }

  // Ground the chat in what the workspace actually is (cheap, read-only).
  try {
    const { inspectWorkspace } = await import('../workspace/scanner.mjs');
    const inspection = inspectWorkspace(state.workspaceDir, state.config);
    state.lastInspection = { kind: inspection.projectKind, framework: inspection.framework, styling: inspection.styling };
  } catch { /* keep previous knowledge */ }

  let text = '';
  try {
    const router = createRouter({ config: state.config });
    if (await router.hasLiveModel()) {
      const history = state.conversation.slice(-10).map((message) => ({
        role: message.role === 'user' ? 'user' : 'assistant',
        content: String(message.text ?? '').slice(0, 700),
      }));
      const response = await router.text(undefined, {
        kind: 'chat',
        system: chatSystemPrompt(state),
        messages: history,
        maxTokens: 600,
        temperature: 0.7,
        phase: 'chat',
      });
      text = String(response.text ?? '').trim();
    }
  } catch { /* fall through to the canned reply */ }

  if (!text) text = fallbackChatReply(state);
  state.conversation.push({ role: 'assistant', text, at: nowIso() });
  return { kind: 'answer', text, state };
}

// ------------------------------------------------ execution with TODO / progress
// ONE continuous agent: DISCUSS → DECIDE → EXECUTE → REPORT → DISCUSS.
// `converse` owns the model-driven loop (discussion + build triggers);
// executeTurn is the single entry the CLI calls every turn.
export async function executeTurn(rawRequest, state, { bus, onProgress, onToken } = {}) {
  const input = String(rawRequest ?? '').trim();
  if (!input) return { kind: 'empty' };
  if (input.startsWith('/')) {
    const command = handleCommand(input, state);
    return { kind: command.exit ? 'exit' : 'answer', text: command.text, state };
  }
  // Fold every user turn into the agreed context first — execution later
  // receives ALL decisions, never just the last message.
  try {
    state.agreed = updateAgreedContext(state.agreed ?? createAgreedContext(), input);
    const upd = extractDesignIntent(input);
    state.designIntentObj = mergeDesignIntent(state.designIntentObj ?? createInteractiveState({}).designIntentObj, upd);
    state.agreed = agreedFromIntent(state.designIntentObj, state.agreed);
  } catch { /* context fold is best-effort */ }
  return converse(input, state, { bus, onProgress, onToken });
}

/** Retained deterministic interaction path for offline integrations. */
export async function executeLegacyTurn(rawRequest, state, { bus, onProgress } = {}) {
  const request = String(rawRequest ?? '').trim();
  if (!request) return { kind: 'empty' };

  const kind = classifyMessage(request);

  if (kind === 'stop') {
    return { kind: 'stop', text: 'Stopped. Session preserved. Tell me what to do next.', state };
  }
  if (kind === 'command') {
    const cmd = handleCommand(request, state);
    if (cmd.exit) return { kind: 'exit', state };
    return { kind: 'answer', text: cmd.text, state };
  }
  if (kind === 'status') {
    // Session introspection stays deterministic — it reads state, not opinions.
    return handleQuestion(request, state, kind);
  }
  if (kind === 'question') {
    // Anything conversational goes to the model.
    return chatReply(request, state);
  }

  // --- TWO-PHASE: DISCUSS vs BUILD ---
  // Check build trigger first — explicit transition to execution
  if (isBuildTrigger(request, state)) {
    // Determine build request: short trigger vs detailed
    let buildRequest;
    const isShort = BUILD_TRIGGER_RE.test(request.trim().toLowerCase()) && request.trim().length < 40;
    if (isShort) {
      if (state.designIntentObj?.product || state.designIntentObj?.visualDirection?.length || state.designIntentObj?.features?.length) {
        buildRequest = synthesizeBuildRequest(state);
      } else if (state.designIntent) {
        buildRequest = state.designIntent;
      } else {
        // no prior intent, treat short trigger as error but fallback to raw
        buildRequest = request;
      }
    } else {
      // detailed build request like "Build me a premium login page"
      buildRequest = request;
      // also capture intent from this detailed request
      const upd = extractDesignIntent(request);
      state.designIntentObj = mergeDesignIntent(state.designIntentObj ?? createInteractiveState({}).designIntentObj, upd);
      if (!state.designIntent) state.designIntent = request.slice(0, 300);
      else state.designIntent = `${state.designIntent} | ${request}`.slice(0, 600);
    }
    // If buildRequest was synthesized, also ensure designIntent is preserved
    // Transition phase
    state.phase = 'build';
    // Execute build with synthesized request — fall through to execution logic below using buildRequest as the effective request
    return executeBuild(buildRequest, request, state, { bus, onProgress });
  }

  // If we are still in discuss phase and have no completed builds, this is a
  // conversation turn: the model replies, and "Build it" above starts the work.
  if (state.phase === 'discuss' && state.taskHistory.length === 0) {
    return chatReply(request, state);
  }

  // After the first build: refinement requests execute, everything else is chat.
  if (!looksLikeRefinement(request)) {
    return chatReply(request, state);
  }

  // Otherwise: treat as execution task (follow-up modification or direct build after initial phase)
  // For task / followup / command-like tasks
  // classify on raw (so follow-up "Make it more premium." stays enhance, not poisoned by enriched build verb)
  let taskType = classifyTaskType(request);
  taskType = maybeEnhance(taskType, request, state);
  let enriched = enrichRequest(request, state);
  // If we coerced to enhance, ensure the enriched string actually triggers enhance cue and not create-*
  if (taskType === 'enhance' && classifyTaskType(enriched) !== 'enhance') {
    // prepend an enhance cue that the deterministic classifier recognizes, without poison words (no "design")
    enriched = `Refine existing: ${enriched}`;
  }

  // Update state before run
  state.currentTask = request;
  state.turnCount += 1;
  state.conversation.push({ role: 'user', text: request, at: nowIso() });

  // Running TODO scaffolding — will be replaced once plan is available via bus listener
  state.todoItems = [];
  const progress = onProgress ?? (() => {});

  // Attach bus listener to drive TODO lifecycle and concise output
  // We use runTask's internal bus; to capture todo we intercept via a wrapper bus proxy.
  // Simpler: run task and then derive todos from its plan result.

  // Also update designIntent incrementally (compact)
  if (!state.designIntent) state.designIntent = request.slice(0, 300);
  else if (request.length > 10 && !state.designIntent.toLowerCase().includes(request.toLowerCase().slice(0, 20))) {
    state.designIntent = `${state.designIntent} | ${request}`.slice(0, 600);
  }
  // Also update structured intent for follow-up modifications (e.g., "make hero less crowded" updates tone/features)
  try {
    const upd2 = extractDesignIntent(request);
    // only merge if it actually contains visual cues (to avoid polluting with generic "make it responsive")
    if (upd2.visualDirection.length || upd2.tone || upd2.features.length || upd2.depth || upd2.motion) {
      state.designIntentObj = mergeDesignIntent(state.designIntentObj, upd2);
    }
  } catch {}

  let interrupted = false;
  const ac = new AbortController();
  const sigHandler = () => { interrupted = true; ac.abort(); };
  // caller handles SIGINT; we expose controller

  progress({ type: 'understand', text: `understand → ${taskType}` });

  // live streaming: hook bus before run starts so we can emit concise progress during execution
  const liveBus = bus ?? new EventBus();
  const off = liveBus.on((ev) => {
    switch (ev.type) {
      case 'phase': progress({ type: 'inspect', text: ev.phase }); break;
      case 'thought': if (String(ev.text ?? '').length) progress({ type: 'inspect', text: String(ev.text).split('\n')[0].slice(0, 90) }); break;
      case 'skills.retrieved': for (const id of (ev.ids ?? [])) progress({ type: 'skill', text: id }); break;
      case 'plan.created': progress({ type: 'todo', text: `${ev.steps} steps planned` }); break;
      case 'file.write': progress({ type: 'edit', text: ev.rel }); break;
      case 'verify.result': progress({ type: 'verify', text: ev.summary ?? (ev.ok ? 'PASS' : 'CHECK') }); break;
      case 'improve.iteration': progress({ type: 'edit', text: `fix #${ev.iteration}` }); break;
      default: break;
    }
  });

  let outcome;
  try {
    outcome = await runBuild(enriched, {
      workspaceDir: state.workspaceDir,
      config: state.config,
      overrides: { maxIterations: 2 },
      bus: liveBus,
      progress,
    });
  } catch (e) {
    state.unresolvedIssues.push(String(e?.message ?? e).slice(0, 200));
    return { kind: 'error', error: String(e?.message ?? e), state };
  }

  off();
  const run = outcome.run;

  // Prefer structured todos from run; fallback to legacy plan-based
  let todos;
  if (run.todos?.length) {
    todos = run.todos.map(t=> ({ id: t.id, title: t.description ?? t.title, description: t.description ?? t.title, goal: t.completionCondition ?? t.description, files: t.files ?? [], skills: t.skills ?? [], status: t.status ?? (run.status==='done'?'completed': run.status==='needs-fix'?'blocked':'pending'), priority: t.priority ?? 'medium' } ));
    if (run.status === 'done') for (const t of todos) t.status='completed';
    else if (run.status === 'needs-fix') { for(let i=0;i<todos.length-1;i++) if(todos[i].status!=='completed') todos[i].status='completed'; const last=todos[todos.length-1]; if(last && last.status!=='completed') last.status='blocked'; }
  } else {
    todos = buildTodosFromPlan(run.plan, run.understanding);
    if (run.status === 'done') {
      for (const t of todos) t.status = 'completed';
    } else if (run.status === 'needs-fix') {
      for (let i = 0; i < todos.length - 1; i++) todos[i].status = 'completed';
      if (todos.length) todos[todos.length - 1].status = 'blocked';
    } else if (run.status === 'failed') {
      if (todos.length) todos[0].status = 'blocked';
    } else {
      for (const t of todos) t.status = 'completed';
    }
  }
  state.todoItems = todos;

  // Update state quietly (liveBus already printed inspect/skill/edit/verify once)
  // Only emit concise per-TODO completion and final done here
  if (run.skills?.ids?.length) {
    for (const sid of run.skills.ids) if (!state.skillsUsed.includes(sid)) state.skillsUsed.push(sid);
  }
  if (run.skillsRead?.length) for (const sid of run.skillsRead) if (!state.skillsUsed.includes(sid)) state.skillsUsed.push(sid);
  for (const t of todos) {
    if (t.status === 'completed') progress({ type: 'todo', text: `✓ ${t.title}` });
    else if (t.status === 'in_progress') progress({ type: 'todo', text: `→ ${t.title}` });
    else if (t.status === 'blocked') progress({ type: 'todo', text: `! ${t.title} (blocked)` });
    else progress({ type: 'todo', text: `· ${t.title}` });
  }
  for (const w of run.writes ?? []) {
    if (!state.activeFiles.includes(w.rel)) state.activeFiles.push(w.rel);
  }
  if (run.verification) {
    if (!run.verification.ok) {
      if (!state.unresolvedIssues.includes(run.verification.summary)) state.unresolvedIssues.push(run.verification.summary);
    } else {
      state.unresolvedIssues = state.unresolvedIssues.filter((x) => x !== run.verification.summary);
    }
  }
  progress({ type: 'done', text: run.status });

  // Update history
  state.taskHistory.push({
    request,
    enriched,
    taskType: run.understanding?.taskType ?? taskType,
    status: run.status,
    at: nowIso(),
    files: (run.writes ?? []).map((w) => w.rel),
    score: run.critique?.overall,
  });
  if (run.writes?.length) {
    state.completedWork.push({ title: request.slice(0, 80), files: run.writes.map((w) => w.rel), at: nowIso() });
  }
  state.conversation.push({ role: 'assistant', text: run.status === 'done' ? `Done — ${run.understanding?.taskType ?? 'task'} completed` : `Status: ${run.status}`, at: nowIso() });

  return {
    kind: 'task',
    run,
    outcome,
    todos,
    status: run.status,
    summary: outcome.run ? `${run.status} — ${run.understanding?.taskType ?? taskType}` : 'failed',
    state,
    interrupted,
  };
}

function handleQuestion(text, state, kind) {
  const q = text.toLowerCase();
  // status-like
  if (kind === 'status' || /what have you changed|what did you change|status|todo/.test(q)) {
    return { kind: 'answer', text: statusText(state), state };
  }
  // "what's causing this?" generic explanation from unresolved issues / last run
  if (state.unresolvedIssues.length) {
    return { kind: 'answer', text: `Current issues: ${state.unresolvedIssues.join('; ')}\n\n${statusText(state)}`, state };
  }
  const last = state.taskHistory[state.taskHistory.length - 1];
  if (last) {
    return {
      kind: 'answer',
      text: `Last task: "${last.request}" → ${last.status} (${last.taskType}). Files: ${last.files.join(', ') || 'none'}.\n${todoText(state)}\n\nAsk me to fix, change, or continue — I remember the workspace context.`,
      state,
    };
  }
  return { kind: 'answer', text: `No task yet. Tell me what to build — e.g. "Build me a red button" or "Build a premium login page".\n${statusText(state)}`, state };
}

// ------------------------------------------------ slash commands
export function handleCommand(line, state) {
  const cmd = String(line ?? '').trim().toLowerCase();
  if (cmd === '/help' || cmd === '/h' || cmd === 'help') {
    return {
      text: [
        'Commands:',
        '  /help     — show this help',
        '  /status   — show session TODO + files + intent',
        '  /todo     — show current TODO list',
        '  /skills   — show skills used this session',
        '  /clear    — clear screen (keeps session)',
        '  /exit     — exit chat (or Ctrl+C, Ctrl+D)',
        '  /stop     — stop current task (if running)',
        '',
        'Just type naturally: "Make it more premium", "Add motion", "Use blue instead".',
      ].join('\n'),
    };
  }
  if (cmd === '/status') return { text: statusText(state) };
  if (cmd === '/todo') return { text: `TODO:\n${todoText(state)}` };
  if (cmd === '/skills') {
    const s = [...new Set(state.skillsUsed)];
    return { text: s.length ? `Skills used: ${s.join(', ')}` : 'No skills used yet.' };
  }
  if (cmd === '/clear') return { text: '\x1b[2J\x1b[H', clear: true };
  if (cmd === '/exit' || cmd === '/quit' || cmd === '/q') return { exit: true };
  if (cmd === '/stop') return { text: 'No task running. Use Ctrl+C to interrupt a running task.', stop: true };
  return { text: `Unknown command: ${line}. Try /help` };
}
