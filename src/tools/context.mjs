/** Tool context: the agent's hands. Policy-guarded read/write/patch/shell. */
import { execFile } from 'node:child_process';
import { readWorkspaceFile, writeWorkspaceFile, applySearchReplace, resolveInWorkspace } from '../workspace/writer.mjs';
import { walk } from '../workspace/files.mjs';
import { ToolError } from '../core/errors.mjs';
const BLOCKED = [/rm\s+-rf\s+\//i, /:\(\)\s*\{.*\}.*&/i, /mkfs/i, /shutdown/i, /reboot/i, /format\s+[a-z]:/i];
export function createToolContext({ workspaceDir, config, bus, dryRun = false, registry = undefined } = {}) {
  const calls = [];
  const record = (tool, args, result) => {
    calls.push({ tool, args, ok: !result?.error, at: new Date().toISOString() });
    bus?.emit('tool.call', { tool, args });
    if (result?.error) bus?.emit('tool.result', { tool, ok: false, error: result.error });
    else bus?.emit('tool.result', { tool, ok: true });
  };
  const ctx = {
    calls,
    readFile(rel) {
      const content = readWorkspaceFile(workspaceDir, rel);
      record('read', { rel }, { content: (content ?? '').length });
      if (content === undefined) throw new ToolError(`file not found: ${rel}`);
      return content;
    },
    listFiles(prefix = '') {
      const { files } = walk(workspaceDir, { ignore: config?.workspace?.ignore ?? [] });
      const rels = files.map((f) => f.rel).filter((r) => !prefix || r.startsWith(prefix));
      record('list', { prefix }, { count: rels.length });
      return rels;
    },
    writeFile(rel, content) {
      if (calls.filter((c) => c.tool === 'write').length >= (config?.policy?.maxWritesPerRun ?? 400)) throw new ToolError('write budget exceeded');
      const res = writeWorkspaceFile(workspaceDir, rel, String(content ?? ''), { dryRun });
      record('write', { rel }, res);
      bus?.emit('file.write', res);
      return res;
    },
    patchFile(rel, patches) {
      const current = ctx.readFile(rel);
      const { text, applied, failed } = applySearchReplace(current, patches, { allowFuzzy: true });
      if (failed.length && failed.length === patches.length) throw new ToolError(`patch failed on ${rel}: ${failed[0].reason}`);
      return ctx.writeFile(rel, text);
    },
    exec(cmd, args = [], { timeoutMs } = {}) {
      if (!config?.policy?.allowShell) throw new ToolError('shell disabled by policy');
      const full = [cmd, ...args].join(' ');
      for (const re of BLOCKED) if (re.test(full)) throw new ToolError(`blocked command: ${full}`);
      record('exec-start', { cmd: full }, {});
      return new Promise((resolve, reject) => {
        execFile(cmd, args, { cwd: workspaceDir, timeout: timeoutMs ?? config?.policy?.commandTimeoutMs ?? 120000, windowsHide: true }, (err, stdout, stderr) => {
          if (err) { record('exec', { cmd: full }, { error: String(err.message) }); reject(new ToolError(`command failed: ${full}`, { details: { stderr: String(stderr).slice(0, 2000) } })); }
          else { record('exec', { cmd: full }, { bytes: String(stdout).length }); resolve({ stdout: String(stdout), stderr: String(stderr), code: 0 }); }
        });
      });
    },
    resolve(rel) { return resolveInWorkspace(workspaceDir, rel); },
    /** Skill catalogue — ids + one-line descriptions, cheap enough for every turn. */
    listSkills() {
      const skills = registry ? registry.list() : [];
      const list = skills.map((skill) => ({ id: skill.id, category: skill.category, description: skill.description }));
      record('listSkills', {}, { count: list.length });
      return list;
    },
    /** Full expert guidance for one skill. The agent is expected to use this. */
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
  };
  return ctx;
}
export const TOOL_DEFS = [
  { name: 'readFile', desc: 'Read a workspace file' },
  { name: 'writeFile', desc: 'Create/update a workspace file (jailed, diffed)' },
  { name: 'patchFile', desc: 'Search/replace patch with fuzzy fallback' },
  { name: 'listFiles', desc: 'List workspace files' },
  { name: 'exec', desc: 'Run an allow-listed shell command' },
  { name: 'listSkills', desc: 'List available design skills (discover: id + category + description)' },
  { name: 'readSkill', desc: 'Read one skill (expert guidance) by id — full body injected into context' },
  { name: 'list_skills', desc: 'Alias for listSkills' },
  { name: 'read_skill', desc: 'Alias for readSkill' },
];
