/**
 * Qwen2.5-7B minimal tool context.
 * Exposes exactly 5 tools: read_file, write_file, edit_file, list_directory, run_bash
 * Fewer tools = more reliable calls for 7B. Each tool has a single JSON shape.
 */

import { execFile } from 'node:child_process';
import { readWorkspaceFile, writeWorkspaceFile, applySearchReplace, resolveInWorkspace } from '../workspace/writer.mjs';
import { walk } from '../workspace/files.mjs';
import { ToolError } from '../core/errors.mjs';

const BLOCKED = [/rm\s+-rf\s+\//i, /:\(\)\s*\{.*\}.*&/i, /mkfs/i, /shutdown/i, /reboot/i, /format\s+[a-z]:/i];

export const QWEN_TOOL_SPECS = [
  { name: 'read_file', description: 'Read a file from workspace. Args: {"path": "index.html"}', args: { path: 'Relative path' } },
  { name: 'write_file', description: 'Create/overwrite file with full content. Args: {"path": "styles/main.css", "content": "..."}', args: { path: 'Relative path', content: 'Full file content' } },
  { name: 'edit_file', description: 'Edit file via search/replace. Args: {"path": "index.html", "edits": [{"oldText":"...","newText":"..."}]}', args: { path: 'Relative path', edits: 'Array of {oldText, newText}' } },
  { name: 'list_directory', description: 'List workspace files. Args: {"path": ""} optional prefix', args: { path: 'Optional prefix filter' } },
  { name: 'run_bash', description: 'Run shell command. Args: {"command": "npm", "args": ["run","build"]}', args: { command: 'Command', args: 'Array of args' } },
];

// Alias map so we can still handle legacy calls if model emits old names
const ALIASES = {
  readFile: 'read_file',
  listFiles: 'list_directory',
  writeFile: 'write_file',
  patchFile: 'edit_file',
  exec: 'run_bash',
  read_file: 'read_file',
  write_file: 'write_file',
  edit_file: 'edit_file',
  list_directory: 'list_directory',
  run_bash: 'run_bash',
  // internal skill tools — allowed but not advertised to 7B
  readSkill: 'readSkill',
  listSkills: 'listSkills',
};

export function normalizeToolName(raw) {
  return ALIASES[String(raw ?? '').trim()] ?? String(raw ?? '').trim();
}

const INTERNAL_ALLOWED = new Set(['readSkill', 'listSkills']);

export function validateToolCall(entry) {
  if (!entry || typeof entry !== 'object') return { ok: false, error: 'tool call must be an object' };
  const raw = String(entry.tool ?? entry.name ?? '').trim();
  const tool = normalizeToolName(raw);
  const isInternal = INTERNAL_ALLOWED.has(raw) || INTERNAL_ALLOWED.has(tool);
  const isKnown = QWEN_TOOL_SPECS.some((s) => s.name === tool) || isInternal;
  if (!isKnown) return { ok: false, error: `unknown tool "${raw}". Allowed: ${QWEN_TOOL_SPECS.map((s) => s.name).join(', ')}` };
  const args = entry.args ?? entry.arguments ?? {};
  if (typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: 'args must be an object' };
  // Per-tool shape checks (literal, no judgment)
  if (tool === 'read_file' && !args.path && !args.rel && !args.file) return { ok: false, error: 'read_file requires {"path": "..."}' };
  if (tool === 'write_file' && (!args.path && !args.rel && !args.file)) return { ok: false, error: 'write_file requires {"path": "..."}' };
  if (tool === 'write_file' && args.content === undefined && args.text === undefined) return { ok: false, error: 'write_file requires {"content": "..."}' };
  if (tool === 'edit_file' && (!args.path && !args.rel && !args.file)) return { ok: false, error: 'edit_file requires {"path": "..."}' };
  if (tool === 'edit_file' && !args.edits && !args.patches) return { ok: false, error: 'edit_file requires {"edits": [{"oldText":"...","newText":"..."}]}' };
  if (tool === 'run_bash' && !args.command && !args.cmd) return { ok: false, error: 'run_bash requires {"command": "..."}' };
  if (raw === 'readSkill' && !args.id && !args.skill && !args.name) return { ok: false, error: 'readSkill requires {"id": "..."}' };
  return { ok: true, tool: isInternal ? raw : tool, args };
}

export function createQwenToolContext({ workspaceDir, config, bus, dryRun = false, registry } = {}) {
  const calls = [];
  const record = (tool, args, result) => {
    calls.push({ tool, args, ok: !result?.error, at: new Date().toISOString() });
    bus?.emit('tool.call', { tool, args });
    if (result?.error) bus?.emit('tool.result', { tool, ok: false, error: result.error });
    else bus?.emit('tool.result', { tool, ok: true });
  };

  const ctx = {
    calls,
    // canonical 5
    read_file(path) {
      const rel = String(path ?? '').trim();
      const content = readWorkspaceFile(workspaceDir, rel);
      record('read_file', { path: rel }, { bytes: (content ?? '').length });
      if (content === undefined) throw new ToolError(`file not found: ${rel}`);
      return content;
    },
    write_file(path, content) {
      const rel = String(path ?? '').trim();
      if (calls.filter((c) => c.tool === 'write_file').length >= (config?.policy?.maxWritesPerRun ?? 400)) throw new ToolError('write budget exceeded');
      const res = writeWorkspaceFile(workspaceDir, rel, String(content ?? ''), { dryRun });
      record('write_file', { path: rel }, res);
      bus?.emit('file.write', res);
      return res;
    },
    edit_file(path, edits) {
      const rel = String(path ?? '').trim();
      const list = Array.isArray(edits) ? edits : [];
      // normalize to writer's expected {search,replace} or {old,new}
      const patches = list.map((e) => ({
        search: e.oldText ?? e.old ?? e.search ?? '',
        replace: e.newText ?? e.new ?? e.replace ?? '',
      }));
      const current = ctx.read_file(rel);
      const { text, applied, failed } = applySearchReplace(current, patches, { allowFuzzy: true });
      if (failed.length && failed.length === patches.length) throw new ToolError(`edit_file failed on ${rel}: ${failed[0].reason}`);
      return ctx.write_file(rel, text);
    },
    list_directory(prefix = '') {
      const { files } = walk(workspaceDir, { ignore: config?.workspace?.ignore ?? [] });
      const rels = files.map((f) => f.rel).filter((r) => !prefix || r.startsWith(prefix));
      record('list_directory', { path: prefix }, { count: rels.length });
      return rels;
    },
    run_bash(command, args = [], { timeoutMs } = {}) {
      if (!config?.policy?.allowShell) throw new ToolError('shell disabled by policy');
      const cmd = String(command ?? '').trim();
      const cmdArgs = Array.isArray(args) ? args : [];
      const full = [cmd, ...cmdArgs].join(' ');
      for (const re of BLOCKED) if (re.test(full)) throw new ToolError(`blocked command: ${full}`);
      record('run_bash-start', { command: full }, {});
      return new Promise((resolve, reject) => {
        execFile(cmd, cmdArgs, { cwd: workspaceDir, timeout: timeoutMs ?? config?.policy?.commandTimeoutMs ?? 120000, windowsHide: true }, (err, stdout, stderr) => {
          if (err) { record('run_bash', { command: full }, { error: String(err.message) }); reject(new ToolError(`command failed: ${full}`, { details: { stderr: String(stderr).slice(0, 2000) } })); }
          else { record('run_bash', { command: full }, { bytes: String(stdout).length }); resolve({ stdout: String(stdout), stderr: String(stderr), code: 0 }); }
        });
      });
    },
    resolve(rel) { return resolveInWorkspace(workspaceDir, rel); },
    // internal skill tools — not advertised but allowed for compat (terminal-flow test)
    listSkills() {
      const skills = registry ? registry.list() : [];
      const list = skills.map((skill) => ({ id: skill.id, category: skill.category, description: skill.description }));
      record('listSkills', {}, { count: list.length });
      return list;
    },
    readSkill(id) {
      const wanted = String(id ?? '').trim();
      const skill = registry?.get(wanted);
      if (!skill) {
        const available = registry ? registry.list().map((entry) => entry.id).join(', ') : 'none loaded';
        throw new ToolError(`unknown skill: ${wanted}. Available: ${available}`);
      }
      record('readSkill', { id: skill.id }, { tokens: skill.tokens });
      return `# Skill: ${skill.name}\n> ${skill.description}\n> category: ${skill.category}${skill.libraries.length ? ` | libraries: ${skill.libraries.join(', ')}` : ''}\n\n${skill.body}`;
    },
    // compat aliases for internal callers that still use old names
    get readFile() { return (rel) => ctx.read_file(rel); },
    get writeFile() { return (rel, c) => ctx.write_file(rel, c); },
    get patchFile() { return (rel, patches) => ctx.edit_file(rel, patches.map((p) => ({ oldText: p.old ?? p.search, newText: p.new ?? p.replace })) ); },
    get listFiles() { return (prefix) => ctx.list_directory(prefix); },
    get exec() { return (cmd, args, opts) => ctx.run_bash(cmd, args, opts); },
  };
  // alias qwen names to also be reachable via computed access
  ctx.readSkill = ctx.readSkill.bind(ctx);
  ctx.listSkills = ctx.listSkills.bind(ctx);
  return ctx;
}
