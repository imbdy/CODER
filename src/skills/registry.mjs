/**
 * Skill registry: loads every SKILL.md below the configured roots and exposes a
 * queryable index. Skills are Artisan's expertise store — they are *retrieved*
 * per task rather than dumped into context.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';
import { estimateTokens, unique } from '../core/util.mjs';

export class SkillRegistry {
  constructor({ roots = [], logger } = {}) {
    this.roots = roots.map((root) => path.resolve(root));
    this.logger = logger;
    this.skills = new Map();
    this.byTrigger = new Map();
    this.byCategory = new Map();
    this.loadedAt = undefined;
    this.warnings = [];
  }

  load() {
    this.skills.clear();
    this.byTrigger.clear();
    this.byCategory.clear();
    this.warnings = [];
    for (const root of this.roots) {
      if (!fs.existsSync(root)) {
        this.warnings.push(`skill root not found: ${root}`);
        continue;
      }
      for (const file of findSkillFiles(root)) this.#register(file);
    }
    this.loadedAt = new Date().toISOString();
    this.logger?.debug(`loaded ${this.skills.size} skills`, { roots: this.roots, warnings: this.warnings });
    return this;
  }

  #register(file) {
    let source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch (error) {
      this.warnings.push(`cannot read ${file}: ${error.message}`);
      return;
    }
    const { data, body } = parseFrontmatter(source);
    const dirName = path.basename(path.dirname(file));
    const name = String(data.name ?? dirName);
    const skill = {
      id: name,
      name,
      dir: path.dirname(file),
      file,
      category: String(data.category ?? 'general'),
      priority: String(data.priority ?? 'normal'),
      frameworks: normalizeArray(data.frameworks),
      libraries: normalizeArray(data.libraries),
      triggers: normalizeArray(data.triggers),
      description: String(data.description ?? firstParagraph(body)),
      body,
      tokens: estimateTokens(body),
      raw: source,
    };
    if (this.skills.has(skill.id)) this.warnings.push(`duplicate skill id "${skill.id}" (${file})`);
    this.skills.set(skill.id, skill);
    for (const trigger of skill.triggers) {
      const key = String(trigger).toLowerCase().trim();
      if (!key) continue;
      if (!this.byTrigger.has(key)) this.byTrigger.set(key, []);
      this.byTrigger.get(key).push(skill.id);
    }
    if (!this.byCategory.has(skill.category)) this.byCategory.set(skill.category, []);
    this.byCategory.get(skill.category).push(skill.id);
  }

  get size() {
    return this.skills.size;
  }

  list() {
    return [...this.skills.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id) {
    return this.skills.get(id);
  }

  has(id) {
    return this.skills.has(id);
  }

  categories() {
    return [...this.byCategory.keys()].sort();
  }

  triggers() {
    return [...this.byTrigger.keys()].sort();
  }

  /** Skills that declare a given framework/library. */
  byFramework(name) {
    const needle = String(name).toLowerCase();
    return this.list().filter((skill) =>
      skill.frameworks.some((f) => f.toLowerCase() === needle) ||
      skill.libraries.some((l) => l.toLowerCase() === needle));
  }

  /** Full text for a set of ids (used to render the retrieved-skills context block). */
  documents(ids, { includeMetadata = true } = {}) {
    return ids
      .map((id) => this.skills.get(id))
      .filter(Boolean)
      .map((skill) => (includeMetadata
        ? `## Skill: ${skill.name}\n> ${skill.description}\n> category: ${skill.category} | priority: ${skill.priority}${skill.libraries.length ? ` | libraries: ${skill.libraries.join(', ')}` : ''}\n\n${skill.body}`
        : skill.body));
  }

  describe() {
    return {
      root: this.roots,
      count: this.skills.size,
      categories: this.categories(),
      loadedAt: this.loadedAt,
      warnings: this.warnings,
    };
  }
}

function findSkillFiles(root, depth = 0, out = []) {
  if (depth > 4) return out;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) findSkillFiles(full, depth + 1, out);
    else if (/^skill\.md$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function normalizeArray(value) {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  return unique(list.map((item) => String(item).trim()).filter(Boolean));
}

function firstParagraph(body) {
  const line = String(body ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('```') && !l.startsWith('-'));
  return line ?? '';
}

export function createSkillRegistry({ skills, logger } = {}) {
  return new SkillRegistry({ roots: skills?.roots ?? [], logger }).load();
}