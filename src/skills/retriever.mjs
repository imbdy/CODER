/**
 * Skill retrieval.
 *
 * Rather than stuffing all 40+ skills into the prompt, Artisan scores every skill
 * against (a) the user request, (b) the classified task type, (c) the inspected
 * workspace and (d) the current plan step, then packs the best set into a token
 * budget. Retrieval is explainable: every selection carries its reasons.
 */

import { estimateTokens, unique } from '../core/util.mjs';
import { PHASE_SKILLS } from './phases.mjs';

export { PHASE_SKILLS } from './phases.mjs';
export function phaseSkillIds(phase) {
  return new Set(PHASE_SKILLS[phase] ?? []);
}

/** Skills that only make sense next to another skill. */
export const DEPENDENCIES = {
  'react-three-fiber': ['threejs', '3d-performance'],
  drei: ['react-three-fiber', 'threejs'],
  shaders: ['webgl'],
  distortion: ['shaders', 'webgl'],
  webgl: ['threejs'],
  '3d-performance': ['threejs'],
  particles: ['webgl', 'animation-principles'],
  molecules: ['motion', 'backgrounds'],
  aceternity: ['motion', 'backgrounds'],
  'react-bits': ['motion', 'micro-interactions'],
  'scroll-storytelling': ['gsap', 'parallax'],
  parallax: ['motion', 'animation-principles'],
  'page-transitions': ['motion'],
  'floating-elements': ['motion', 'animation-principles'],
  'text-effects': ['motion', 'typography'],
  'background-systems': ['backgrounds', 'visual-design'],
  'design-review': ['anti-slop', 'visual-design'],
  gsap: ['animation-principles'],
  'cursor-interactions': ['micro-interactions'],
  'design-tokens': ['visual-design'],
  'project-architecture': ['frontend-master'],
  'frontend-master': ['project-architecture'],
  'frontend-design-master': ['project-architecture'],
  'forms-and-states': ['accessibility'],
};

/** Task-type priors: which skills a senior engineer reaches for by default. */
export const TASK_PRIORS = {
  'create-component': { 'micro-interactions': 5, 'component-composition': 4, 'visual-design': 3, accessibility: 2.5, typography: 1.5, 'anti-slop': 1, 'design-tokens': 2.5 },
  'create-page': { 'frontend-master': 5, 'project-architecture': 4, layout: 4, typography: 3.5, 'design-tokens': 3, 'visual-design': 3, 'micro-interactions': 2.5, 'responsive-design': 2.5, 'anti-slop': 3, backgrounds: 1.5 },
  'create-app': { 'frontend-master': 5, 'project-architecture': 4.5, layout: 4, 'component-composition': 3, 'design-tokens': 3, 'ui-ux': 3, 'responsive-design': 2.5, accessibility: 2, 'forms-and-states': 2.5, 'anti-slop': 2.5 },
  enhance: { 'design-review': 4, 'visual-design': 4, 'design-tokens': 2.5, 'micro-interactions': 3, 'anti-slop': 3, typography: 2.5, motion: 2 },
  redesign: { 'frontend-master': 4, 'design-review': 4, 'visual-design': 4, 'design-tokens': 3.5, layout: 3.5, typography: 3, 'anti-slop': 3.5, 'component-composition': 2, 'forms-and-states': 1.5 },
  motion: { motion: 5, 'animation-principles': 4.5, 'micro-interactions': 4, 'page-transitions': 1.5, 'anti-slop': 2 },
  '3d': { 'react-three-fiber': 5, threejs: 4.5, drei: 4, '3d-performance': 4, webgl: 3, shaders: 2, 'anti-slop': 2 },
  responsive: { 'responsive-design': 6, layout: 4, accessibility: 3, 'frontend-performance': 2, 'anti-slop': 1.5 },
  performance: { 'frontend-performance': 6, '3d-performance': 2.5, 'image-media': 3, 'library-selection': 3 },
  accessibility: { accessibility: 6, 'forms-and-states': 3, 'ui-ux': 3, 'responsive-design': 2 },
  fix: { 'frontend-performance': 2, 'design-review': 2, accessibility: 2, 'responsive-design': 2 },
  review: { 'design-review': 6, 'anti-slop': 5, accessibility: 3, 'frontend-performance': 2.5, 'responsive-design': 2.5, typography: 2, layout: 2 },
  library: { 'library-selection': 6, 'component-composition': 3, 'ui-ux': 2 },
};

/** Category-level priors (complements per-skill priors above). */
export const CATEGORY_PRIORS = {
  'create-component': { animation: 2, quality: 1, visual: 1.5 },
  'create-page': { orchestration: 2, layout: 3, visual: 2.5, animation: 1.5 },
  'create-app': { orchestration: 2, layout: 2.5 },
  enhance: { quality: 3, visual: 2.5, animation: 2 },
  redesign: { orchestration: 1.5, visual: 3, layout: 2.5, quality: 2 },
  motion: { animation: 4.5 },
  '3d': { three: 4, animation: 1.5 },
  responsive: { layout: 3, quality: 1 },
  performance: { performance: 5 },
  accessibility: { quality: 2, a11y: 5 },
  fix: { quality: 2 },
  review: { quality: 4, visual: 2 },
  library: { architecture: 2.5 },
};

/** Words too generic to be a reliable trigger on their own. */
const WEAK_TRIGGERS = new Set(['ui', 'app', 'page', 'design', 'component', 'react', 'web']);

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function round(value) {
  return Math.round(value * 100) / 100;
}

export function summarise(packed) {
  return packed
    .map((entry) => `${entry.id}(${round(entry.score)})`)
    .join(', ');
}

export class SkillRetriever {
  constructor({ registry, config, logger }) {
    this.registry = registry;
    this.config = config;
    this.logger = logger;
  }

  /**
   * @param {object} input
   * @param {string} input.request    raw user request (or a step description)
   * @param {string} [input.taskType] classified task type
   * @param {object} [input.workspace] inspection result (framework, libraries, styling)
   * @param {string[]} [input.explicit] skills the caller wants forced in
   * @param {number} [input.maxSkills]
   * @param {number} [input.budgetTokens]
   */
  retrieve(input = {}) {
    const {
      request = '', taskType = 'create-page', workspace = {}, explicit = [],
      maxSkills = this.config?.skills?.maxSkillsPerTask ?? 7,
      budgetTokens = this.config?.runtime?.skillBudgetTokens ?? 9000,
      stepSkills = [],
    } = input;

    const always = new Set([...(this.config?.skills?.alwaysInclude ?? []), ...explicit, ...stepSkills]);
    const haystack = String(request).toLowerCase();
    const priors = TASK_PRIORS[taskType] ?? TASK_PRIORS['create-page'];
    const framework = String(workspace?.framework ?? '').toLowerCase();
    const libs = (workspace?.libraries ?? []).map((lib) => String(lib).toLowerCase());

    const scored = [];
    for (const skill of this.registry.list()) {
      const reasons = [];
      let score = 0;

      // 1. Trigger matches inside the request text.
      for (const trigger of skill.triggers) {
        const needle = String(trigger).toLowerCase();
        if (!needle) continue;
        const matched = needle.includes(' ')
          ? haystack.includes(needle)
          : new RegExp(`(?<![a-z0-9])${escapeRegex(needle)}(?![a-z0-9])`).test(haystack);
        if (!matched) continue;
        const weight = needle.includes(' ') ? 6 : (WEAK_TRIGGERS.has(needle) ? 1 : 3);
        score += weight;
        if (reasons.length < 5) reasons.push(`request mentions "${trigger}" (+${weight})`);
      }

      // 2. Task-type prior for this specific skill.
      const prior = priors[skill.id];
      if (prior) { score += prior; reasons.push(`task "${taskType}" prior (+${prior})`); }

      // 3. Workspace affinity.
      if (skill.frameworks.length) {
        if (skill.frameworks.some((f) => f.toLowerCase() === framework)) {
          score += 2.5;
          reasons.push(`framework ${framework} (+2.5)`);
        } else if (framework) {
          score -= 1;
        }
      }
      const libMatches = skill.libraries.filter((lib) => libs.includes(lib.toLowerCase()));
      if (libMatches.length) {
        score += 2 * libMatches.length;
        reasons.push(`installed: ${libMatches.join(', ')} (+${2 * libMatches.length})`);
      }

      // 4. Forced inclusion.
      if (always.has(skill.id)) { score += 100; reasons.push('always included'); }

      // 5. Author-declared priority.
      if (skill.priority === 'high') score += 1.5;
      else if (skill.priority === 'low') score -= 0.75;

      // 6. Category prior.
      const categoryPrior = CATEGORY_PRIORS[taskType]?.[skill.category] ?? 0;
      if (categoryPrior) { score += categoryPrior; reasons.push(`category ${skill.category} (+${categoryPrior})`); }

      if (score > 0) scored.push({ id: skill.id, score, reasons, tokens: skill.tokens, category: skill.category });
    }

    scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return this.#select({ scored, maxSkills, budgetTokens, always });
  }

  /** Dependency closure + budget packing, shared by all retrieval entry points. */
  #select({ scored, maxSkills, budgetTokens, always }) {
    const selected = [];
    const selectedIds = new Set();
    const add = (entry, reason) => {
      if (selectedIds.has(entry.id) || !this.registry.has(entry.id)) return false;
      selectedIds.add(entry.id);
      selected.push(reason ? { ...entry, reasons: [...entry.reasons, reason] } : entry);
      return true;
    };

    for (const candidate of scored) {
      if (selected.length >= maxSkills) break;
      if (candidate.score < 1.2 && !always?.has(candidate.id)) continue;
      add(candidate);
      for (const dep of DEPENDENCIES[candidate.id] ?? []) {
        if (selected.length >= maxSkills) break;
        const skill = this.registry.get(dep);
        if (!skill) continue;
        add(
          { id: dep, score: candidate.score - 1, reasons: [], tokens: skill.tokens, category: skill.category },
          `required by ${candidate.id}`,
        );
      }
    }

    const packed = [];
    let tokens = 0;
    for (const entry of selected) {
      const skill = this.registry.get(entry.id);
      if (!skill) continue;
      if (tokens + skill.tokens > budgetTokens && packed.length >= 2) continue;
      packed.push(entry);
      tokens += skill.tokens;
    }

    const ids = packed.map((entry) => entry.id);
    const reasons = Object.fromEntries(packed.map((entry) => [entry.id, entry.reasons]));
    const excluded = scored
      .filter((entry) => !selectedIds.has(entry.id))
      .slice(0, 12)
      .map((entry) => ({ id: entry.id, score: round(entry.score), reason: 'below cut or over budget' }));

    const contextBlock = this.registry.documents(ids).join('\n\n---\n\n');
    this.logger?.debug(`retrieved ${ids.length} skills`, { ids });
    return {
      ids,
      skills: packed.map((entry) => ({ id: entry.id, score: round(entry.score), reasons: entry.reasons, tokens: entry.tokens })),
      reasons,
      tokens,
      contextBlock,
      excluded,
      summary: summarise(packed),
    };
  }

  /** Retrieval for a single plan step (step-named skills are forced in). */
  retrieveForStep(step, base = {}) {
    const request = [step?.title, step?.goal, ...(step?.files ?? [])].filter(Boolean).join(' ');
    return this.retrieve({
      ...base,
      request,
      stepSkills: step?.skills ?? [],
      maxSkills: base.maxSkills ?? 4,
      budgetTokens: base.budgetTokens ?? 5000,
    });
  }

  /**
   * Phase-gated retrieval — the intelligent skill system.
   * Each phase loads ONLY what it needs (structure → creative → motion → polish),
   * so a 7B brain never drowns in 40 skills at once.
   * @param {{phases?: string[], request?: string, taskType?: string, workspace?: object, maxSkills?: number, budgetTokens?: number}} input
   */
  retrieveForPhases({ phases = ['structure'], request = '', taskType = 'create-page', workspace = {}, maxSkills = 4, budgetTokens = 5000 } = {}) {
    const out = { phases: {}, ids: [], contextBlocks: {} };
    const seen = new Set();
    for (const phase of phases) {
      const allowed = phaseSkillIds(phase);
      const got = this.retrieve({ request: `${request} phase:${phase}`, taskType, workspace, maxSkills, budgetTokens });
      // Keep only skills relevant to this phase (+ always-include policy skills).
      const always = new Set(this.config?.skills?.alwaysInclude ?? []);
      const ids = got.ids.filter((id) => always.has(id) || allowed.has(id) || allowed.has('*'));
      const fallback = got.ids.filter((id) => !seen.has(id)).slice(0, 1);
      const picked = ids.length ? ids : fallback;
      const docs = this.registry.documents(picked.filter((id) => !seen.has(id))).join('\n\n---\n\n');
      out.phases[phase] = { ids: picked, summary: picked.join(', '), contextBlock: docs };
      for (const id of picked) if (!seen.has(id)) { seen.add(id); out.ids.push(id); }
      out.contextBlocks[phase] = docs;
    }
    out.summary = out.ids.join(', ');
    out.contextBlock = phases.map((p) => `### Phase: ${p}\n${out.contextBlocks[p] || '(no additional guidance)'}`).join('\n\n---\n\n');
    return out;
  }
}

export function createRetriever({ registry, config, logger }) {
  return new SkillRetriever({ registry, config, logger });
}

export function estimateSkillTokens(ids, registry) {
  return unique(ids).reduce((acc, id) => acc + (registry.get(id)?.tokens ?? 0), 0);
}

export function tokensOf(text) {
  return estimateTokens(text);
}