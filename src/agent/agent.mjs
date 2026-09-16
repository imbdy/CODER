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
import { trimHistory } from '../model/history-trim.mjs';
import { parseAndValidateToolCalls, retryMessage } from '../model/tool-validator.mjs';
import { validateToolCall } from '../tools/qwen-context.mjs';

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

  bus.emit(EVENT.PHASE, { phase: 'inspect' });
  const inspection = inspectWorkspace(workspaceDir, config);
  bus.emit(EVENT.THOUGHT, { phase: 'inspect', text: summarizeInspection(inspection) });

  const taskType = classifyTaskType(request);
  const skills = retriever.retrieve({ request, taskType, workspace: inspection });
  bus.emit(EVENT.SKILLS, { ids: skills.ids });

  // The agent's hands: Qwen minimal 5-tool set (7B) — registry passed for readSkill admissibility
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
  });
  const userMessage = buildUserMessage(request, inspection, skills);
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
  const injectRepair = (step) => {
    if (config?.runtime?.agentRepairPass === false) return false;
    if (repairPasses >= MAX_REPAIR_PASSES) return false;
    const rels = actions
      .filter((action) => action.tool === 'writeFile' && action.result && !action.result.error && action.args.rel)
      .map((action) => ({ rel: action.args.rel }));
    if (!rels.length) return false;
    const check = checkStructure(workspaceDir, rels);
    const problems = [...check.issues, ...check.warnings];
    if (!problems.length) return false;
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
    return true;
  };

  bus.emit(EVENT.PHASE, { phase: 'agent' });
  // Qwen2.5-7B history trimming + retry state
  let consecutiveParseFailures = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    // Trim history before each LLM call — don't rely on long context retention (7B = 8-16k practical)
    const trimmedMessages = trimHistory(messages, {
      maxTokens: Number(config?.runtime?.contextBudgetTokens ?? 6000),
      keepLast: 4,
      maxMessages: 10,
    });
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

    const hasWork = output.fileWrites.length > 0 || output.calls.length > 0;
    if (!hasWork) {
      // No work in this turn: either it is finished, or it only talked.
      if (output.done) {
        if (injectRepair(step)) continue; // verify → fix, before accepting done
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
      const result = await executeTool(tools, tool, args);
      actions.push({ kind: 'tool', step, tool, args, result });
      bus.emit(EVENT.TOOL_CALL, { tool, args: { rel: args.rel, id: args.id, cmd: args.cmd } });
      if (result.error) {
        bus.emit(EVENT.ERROR, { message: `${tool}: ${result.error}` });
      } else {
        bus.emit(EVENT.TOOL_RESULT, { tool, ok: true });
        if (tool === 'writeFile') bus.emit(EVENT.FILE_WRITE, { rel: args.rel, bytes: String(args.content ?? '').length });
      }
      toolResults.push({ tool, args, result });
      transcript.push({ step, role: 'tool', tool, args: summarizeArgs(tool, args), result: summarizeResult(result) });
    }

    onStep?.({ step, think: output.think, calls: output.calls, writes: output.fileWrites });
    messages.push({ role: 'user', content: formatToolResults(toolResults) });

    // A model may write its files AND declare done in the same turn: run the
    // work first, report the results, then honour the done signal (this used to
    // skip the writes entirely).
    if (output.done) {
      if (injectRepair(step)) continue; // verify → fix, before accepting done
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

  const status = writes.length > 0 ? (done ? 'done' : 'needs-fix') : 'empty';
  bus.emit(EVENT.RUN_END, { status, files: writes.length });

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
    skillsRead: [...new Set(actions.filter((action) => action.tool === 'readSkill' && !action.result?.error).map((action) => action.args.id))],
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
function buildUserMessage(request, inspection, skills) {
  const skillNames = skills.ids.length ? skills.ids.join(', ') : 'none';
  const files = inspection.files?.map((file) => file.rel).slice(0, 30);
  return [
    `REQUEST: ${request}`,
    '',
    `WORKSPACE: ${inspection.root || process.cwd()}`,
    `Framework: ${inspection.framework || 'none'} | Styling: ${inspection.styling || 'plain-css'} | Empty: ${inspection.isEmpty ? 'yes' : 'no'}`,
    `Libraries: ${inspection.libraries?.length ? inspection.libraries.join(', ') : 'none'}`,
    `Files (${files?.length || 0}): ${files?.join(', ') || '(empty workspace)'}`,
    '',
    `SKILLS RETRIEVED FOR THIS TASK (${skillNames}) — also readable via readSkill:`,
    skills.contextBlock || '(skill context not available)',
    '',
    'Your turn. Start with a one-paragraph THINK, then read the skills you need, then write the files.',
    'Remember the stack rules above: never a single HTML file with everything inline.',
    'When the build is complete and verified, emit [{"done": true, "summary": "..."}].',
  ].join('\n');
}
