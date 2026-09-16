/** Conversation owns intent; the existing generator is exposed as one tool. */
import { createRouter } from '../model/router.mjs';
import { loadConfig } from '../core/config.mjs';
import { runBuild } from './agent-build.mjs';
import { parseToolCalls } from '../agent/agent.mjs';
import { EventBus } from '../core/events.mjs';

export async function converse(request, state, { bus = new EventBus(), onProgress = () => {}, onToken } = {}) {
  state.config ??= loadConfig({ workspaceDir: state.workspaceDir });
  const router = createRouter({ config: state.config, bus });
  state.turnCount++;
  state.conversation.push({ role: 'user', text: request });
  const history = state.conversation.slice(-16).map((m) => ({ role: m.role, content: String(m.text).slice(0, 6000) }));
  const system = `You are Artisan, a friendly frontend engineer and design partner in a terminal.
Converse naturally, answer questions, discuss ideas, and write code examples when requested. Do not turn greetings, thanks, or design questions into builds. Be honest about being an AI if asked.
Keep replies concise unless detail is requested. You remember the conversation below.
TOOL: buildSite(request). This invokes the existing frontend tool agent in the user's workspace.
Only call it when the user asks you to create or change actual project files. A question about building is NOT permission to edit. Resolve "build it" and feedback using the conversation; ask ONE question if the intended project or change is unclear. No mandatory "Build it" phrase.
To call buildSite, emit ONLY a JSON array in a json fence: [{"tool":"buildSite","args":{"request":"complete task with agreed requirements"}}]. Otherwise respond in natural language. Never claim files changed before receiving a tool result.
Workspace: ${state.workspaceDir}
Known files: ${state.activeFiles.join(', ') || 'none yet'}
Last build: ${state.currentTask || 'none'}`;
  let streamed = false;
  // Buffer only the opening characters to keep tool JSON out of terminal prose.
  let pending = '';
  let mode = '';
  const receive = (chunk) => {
    pending += chunk;
    if (!mode && (pending.trimStart().startsWith('```') || /^[\[{]/.test(pending.trimStart()))) mode = 'tool';
    if (!mode && pending.trimStart().length >= 4) mode = 'text';
    if (mode === 'text') { onToken?.(pending); streamed ||= Boolean(onToken); pending = ''; }
  };
  try {
    if (!(await router.hasLiveModel())) throw new Error('Ollama is unavailable. Start ollama serve and check qwen2.5-coder:7b.');
    const reply = await router.text(undefined, { kind: 'chat', system, messages: history, maxTokens: 1600, temperature: 0.35, onToken: receive, liveOnly: true });
    const parsed = parseToolCalls(reply.text);
    const build = parsed.calls.find((call) => call.tool === 'buildSite');
    if (!build) {
      if (pending && mode !== 'tool') { onToken?.(pending); streamed ||= Boolean(onToken); }
      state.conversation.push({ role: 'assistant', text: reply.text });
      return { kind: 'answer', text: reply.text, streamed, state };
    }
    if (typeof build.args.request !== 'string' || !build.args.request.trim()) throw new Error('buildSite requires a non-empty request.');
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
