/** Conversation owns intent; the existing generator is exposed as one tool. */
import { createRouter } from '../model/router.mjs';
import { loadConfig } from '../core/config.mjs';
import { runBuild } from './agent-build.mjs';
import { parseToolCalls } from '../agent/agent.mjs';
import { EventBus } from '../core/events.mjs';

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
  state.turnCount++;
  state.conversation.push({ role: 'user', text: request });
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
Known files: ${state.activeFiles.join(', ') || 'none yet'}
Last build: ${state.currentTask || 'none'}`;
  let streamed = false;
  try {
    if (!(await router.hasLiveModel())) throw new Error('No live model available. Check GROQ_API_KEY or run ollama serve for local qwen2.5-coder:7b.');
    // Do NOT stream the initial chat reply — we need to know if it's a tool call first.
    // If it's a tool call we hide the planning prose entirely (user sees only Thinking...).
    const reply = await router.text(undefined, { kind: 'chat', system, messages: history, maxTokens: 1600, temperature: 0.35, liveOnly: true });
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
      outcome = await runBuild(build.args.request, { workspaceDir: state.workspaceDir, config: state.config, bus, history, onToken, progress: onProgress });
    } finally { off(); }
    const run = outcome.run;
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
