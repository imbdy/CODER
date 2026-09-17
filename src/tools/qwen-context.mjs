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
  { name: 'list_skills', description: 'Discover available design skills. Args: {} — returns [{id, category, description}]', args: {} },
  { name: 'read_skill', description: 'Read full expert guidance for one skill. Args: {"id": "motion"} — returns markdown body', args: { id: 'Skill id' } },
  { name: 'update_todo', description: 'Progress a structured TODO. Args: {"id": "I1", "status": "in_progress|completed|blocked", "note": "optional"}', args: { id: 'todo id', status: 'status' } },
  { name: 'run_qa', description: 'Render the page in a headless browser and critique it now. Args: {}', args: {} },
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
  list_skills: 'list_skills',
  read_skill: 'read_skill',
  update_todo: 'update_todo',
  updateTodo: 'update_todo',
  run_qa: 'run_qa',
  runQa: 'run_qa',
  visual_qa: 'run_qa',
  // legacy internal names
  readSkill: 'read_skill',
  listSkills: 'list_skills',
};

export function normalizeToolName(raw) {
  return ALIASES[String(raw ?? '').trim()] ?? String(raw ?? '').trim();
}

export function validateToolCall(entry) {
  if (!entry || typeof entry !== 'object') return { ok: false, error: 'tool call must be an object' };
  const raw = String(entry.tool ?? entry.name ?? '').trim();
  const tool = normalizeToolName(raw);
  const isKnown = QWEN_TOOL_SPECS.some((s) => s.name === tool);
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
  if (tool === 'read_skill' && !args.id && !args.skill && !args.name) return { ok: false, error: 'read_skill requires {"id": "..."}' };
  if (tool === 'update_todo' && (!args.id || !args.status)) return { ok: false, error: 'update_todo requires {"id": "I1", "status": "in_progress|completed|blocked"}' };
  return { ok: true, tool, args };
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
    list_skills() {
      const skills = registry ? registry.list() : [];
      const list = skills.map((skill) => ({ id: skill.id, category: skill.category, description: skill.description }));
      record('list_skills', {}, { count: list.length });
      bus?.emit('skills.retrieved', { ids: list.map(s=>s.id), count: list.length, discovery: true });
      return list;
    },
    read_skill(id) {
      const wanted = String(id ?? '').trim();
      const skill = registry?.get(wanted);
      if (!skill) {
        const available = registry ? registry.list().map((entry) => entry.id).join(', ') : 'none loaded';
        throw new ToolError(`unknown skill: ${wanted}. Available: ${available}`);
      }
      record('read_skill', { id: skill.id }, { tokens: skill.tokens });
      bus?.emit('skills.retrieved', { ids: [skill.id], discovery: false, read: true });
      return `# Skill: ${skill.name}\n> ${skill.description}\n> category: ${skill.category}${skill.libraries.length ? ` | libraries: ${skill.libraries.join(', ')}` : ''}\n\n${skill.body}`;
    },
    // legacy aliases still work
    listSkills() { return ctx.list_skills(); },
    readSkill(id) { return ctx.read_skill(id); },
    // compat aliases for internal callers that still use old names
    get readFile() { return (rel) => ctx.read_file(rel); },
    get writeFile() { return (rel, c) => ctx.write_file(rel, c); },
    get patchFile() { return (rel, patches) => ctx.edit_file(rel, patches.map((p) => ({ oldText: p.old ?? p.search, newText: p.new ?? p.replace })) ); },
    get listFiles() { return (prefix) => ctx.list_directory(prefix); },
    get exec() { return (cmd, args, opts) => ctx.run_bash(cmd, args, opts); },
  };
  // keep legacy names bound too
  ctx.readSkill = ctx.read_skill.bind(ctx);
  ctx.listSkills = ctx.list_skills.bind(ctx);
  return ctx;
}
