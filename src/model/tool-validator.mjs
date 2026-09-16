/**
 * Defensive JSON tool-call parsing for 7B.
 * Validates shape, retries once with error fed back to model if parsing fails.
 */

import { extractJson } from './json.mjs';
import { validateToolCall } from '../tools/qwen-context.mjs';

export function parseAndValidateToolCalls(rawText) {
  const text = String(rawText ?? '');
  // try fenced json block first, then raw
  const parsed = extractJson(text);
  if (!parsed.ok) {
    return { ok: false, error: `Tool JSON parse failed: ${parsed.error}. Expected: [{"tool":"read_file|write_file|edit_file|list_directory|run_bash","args":{...}}]`, strategy: parsed.strategy, raw: parsed.raw?.slice(0, 400) };
  }
  const value = parsed.value;
  const entries = Array.isArray(value) ? value : (value && typeof value === 'object' && (value.tool || value.done || value.name) ? [value] : []);
  if (!entries.length) {
    return { ok: false, error: 'No tool calls found. Emit a JSON array: [{"tool":"...","args":{}}]', raw: text.slice(0, 300) };
  }
  const calls = [];
  const errors = [];
  let doneEntry = null;
  for (const e of entries) {
    if (e && e.done === true) { doneEntry = e; continue; }
    const v = validateToolCall(e);
    if (!v.ok) errors.push(v.error);
    else calls.push({ tool: v.tool, args: normalizeArgs(v.tool, v.args) });
  }
  if (doneEntry) return { ok: true, done: true, summary: String(doneEntry.summary ?? ''), calls: [] };
  if (errors.length && calls.length === 0) {
    return { ok: false, error: errors.join('; '), calls: [] };
  }
  // If some valid + some invalid, surface invalid as warning but still proceed with valid
  return { ok: true, calls, warnings: errors.length ? errors : undefined };
}

function normalizeArgs(tool, args) {
  // Map legacy keys to canonical for execution
  if (tool === 'read_file') return { path: args.path ?? args.rel ?? args.file ?? '' };
  if (tool === 'write_file') return { path: args.path ?? args.rel ?? args.file ?? '', content: args.content ?? args.text ?? '' };
  if (tool === 'edit_file') {
    const edits = args.edits ?? args.patches ?? args.edits ?? [];
    return { path: args.path ?? args.rel ?? args.file ?? '', edits: Array.isArray(edits) ? edits.map((e) => ({ oldText: e.oldText ?? e.old ?? e.search ?? '', newText: e.newText ?? e.new ?? e.replace ?? '' })) : [] };
  }
  if (tool === 'list_directory') return { path: args.path ?? args.prefix ?? '' };
  if (tool === 'run_bash') return { command: args.command ?? args.cmd ?? '', args: args.args ?? args.arguments ?? [] };
  return args;
}

export function retryMessage(error) {
  return `TOOL CALL ERROR: ${error}\n\nFix and retry — you have ONE retry. Emit a corrected JSON array with exactly: [{"tool":"read_file|write_file|edit_file|list_directory|run_bash","args":{...}}]\nRules: write_file needs {"path","content"}; edit_file needs {"path","edits":[{"oldText","newText"}]}; read_file needs {"path"}; list_directory needs {"path":""}; run_bash needs {"command","args":[]}.\nDo NOT invent other tools. Do NOT output prose outside the JSON block on retry.`;
}
