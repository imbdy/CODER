/**
 * Skill selection — discover → evaluate → select → load → track.
 *
 * The model (when live) reads the catalogue (id + category + one-line
 * description, ~46 lines) and picks the modules this specific build needs.
 * The runtime validates the ids, adds the skills the chosen technology makes
 * mandatory, applies the always-include policy, loads the full bodies inside a
 * token budget and records exactly which bodies were injected. Offline, the
 * scoring retriever picks instead. Either way the result says how it was chosen.
 */

import { extractJson } from '../model/json.mjs';
import { createRetriever } from './retriever.mjs';
import { estimateTokens } from '../core/util.mjs';

const TECH_DEPTHS = new Set(['css', 'threejs', 'r3f', 'shader']);
const TECH_ANIMATION = new Set(['css', 'vanilla', 'gsap']);

export function catalogueLines(registry) {
  return registry.list().map((skill) => `- ${skill.id} [${skill.category}] ${String(skill.description).slice(0, 110)}`);
}

/** Skills the runtime insists on for a given technology / brief, filtered to what exists. */
export function requiredSkillsFor({ tech = {}, inspection = {}, brief = {}, registry, complexity = 'standard' } = {}) {
  const need = new Set();
  const framework = String(inspection?.framework ?? '').toLowerCase();
  const isReact = /react|next/.test(framework);
  const depth = String(tech.depth ?? 'css');
  const animation = String(tech.animation ?? 'css');
  if (complexity !== 'trivial') { need.add('anti-slop'); need.add('visual-design'); }
  if (complexity === 'complex') { need.add('typography'); need.add('layout'); }
  if (depth === 'threejs') { need.add('threejs'); need.add('3d-performance'); if (!isReact) need.add('vanilla-motion'); }
  if (depth === 'r3f') { need.add('react-three-fiber'); need.add('threejs'); need.add('3d-performance'); }
  if (depth === 'shader') { need.add('shaders'); need.add('webgl'); need.add('3d-performance'); }
  if (animation === 'gsap') { need.add('gsap'); need.add('animation-principles'); if (!isReact) need.add('vanilla-motion'); }
  else if (animation === 'vanilla' || (brief?.agreed?.motion)) { need.add('animation-principles'); need.add(isReact ? 'motion' : 'vanilla-motion'); }
  if (framework === 'next') need.add('nextjs');
  else if (framework === 'react') need.add('react');
  if (String(inspection?.styling ?? '') === 'tailwind') need.add('tailwind');
  const emphasis = [brief?.agreed?.typography, ...(brief?.agreed?.accepted ?? [])].join(' ').toLowerCase();
  if (/typograph/.test(emphasis)) need.add('typography');
  if (brief?.mode === 'refine') need.add('design-review');
  return [...need].filter((id) => !registry || registry.has(id));
}

function selectionPrompt({ brief, inspection, catalogue, maxSkills }) {
  return [
    'SKILL SELECTION — choose the expertise modules to load for this build.',
    `Load only what THIS task needs (typically 4–${maxSkills}). Fundamentals first (visual design, typography, layout, anti-generic), then the specific techniques the design calls for. Do not load 3D, shader or scroll-choreography modules unless the design actually uses them.`,
    'Also decide the cheapest technology tier that achieves the agreed design:',
    '  depth: css (layers, perspective, transforms) | threejs (bounded WebGL scene) | r3f (React Three Fiber, React projects only) | shader (custom GLSL — rarely justified)',
    '  animation: css (transitions/keyframes) | vanilla (IntersectionObserver + rAF + CSS) | gsap (timelines, scrub, pin — only for real scroll choreography)',
    '',
    'BRIEF:',
    brief.text,
    '',
    `WORKSPACE: ${inspection?.projectKind ?? 'unknown'} | framework ${inspection?.framework ?? 'none'} | styling ${inspection?.styling ?? 'plain-css'} | ${inspection?.isEmpty ? 'empty folder' : `${inspection?.fileCount ?? 0} files`}`,
    '',
    'CATALOGUE (id [category] description):',
    ...catalogue,
    '',
    'Reply with STRICT JSON only: {"skills":[{"id":"typography","why":"one short reason"}],"tech":{"depth":"css","animation":"vanilla","why":"one sentence"},"notes":"optional one line"}',
  ].join('\n');
}

/**
 * @param {object} input
 * @param {object} input.router      model router (may be offline)
 * @param {object} input.registry    skill registry
 * @param {{text: string, mode: string, agreed: object, taskType?: string}} input.brief
 * @param {object} [input.inspection]
 * @param {object} [input.config]
 * @param {string} [input.complexity]
 * @returns {Promise<{ids: string[], loaded: Array<{id: string, tokens: number}>, contextBlock: string, method: string, selection: Array<{id, why, source}>, tech: object, required: string[], skipped: string[], catalogueSize: number, summary: string}>}
 */
export async function selectSkills({ router, registry, brief, inspection = {}, config = {}, bus, logger, complexity = 'standard' } = {}) {
  const maxSkills = Number(config?.skills?.maxSkillsPerTask ?? 8);
  const budgetTokens = Number(config?.runtime?.skillBudgetTokens ?? 14000);
  const always = [...(config?.skills?.alwaysInclude ?? [])].filter((id) => registry.has(id));
  const catalogue = catalogueLines(registry);
  bus?.emit('skills.discovered', { count: catalogue.length });

  let method = 'retriever';
  let modelPicks = [];
  let tech = { depth: 'css', animation: 'vanilla', why: 'default — decided heuristically' };
  let notes = '';
  let live = false;
  try { live = router ? await router.hasLiveModel() : false; } catch { live = false; }
  if (live) {
    try {
      const response = await router.text(selectionPrompt({ brief, inspection, catalogue, maxSkills }), {
        kind: 'skill-selection', phase: 'skill-selection', liveOnly: true, maxTokens: 700, temperature: 0.2,
        system: 'You are a senior frontend design engineer choosing which expertise modules to load. Reply with STRICT JSON only.',
      });
      const parsed = extractJson(response.text);
      if (parsed.ok && parsed.value && typeof parsed.value === 'object') {
        const picks = Array.isArray(parsed.value.skills) ? parsed.value.skills : [];
        modelPicks = picks.map((p) => (typeof p === 'string' ? { id: p, why: '' } : { id: String(p?.id ?? ''), why: String(p?.why ?? '').slice(0, 120) })).filter((p) => p.id);
        const t = parsed.value.tech ?? {};
        tech = {
          depth: TECH_DEPTHS.has(String(t.depth)) ? String(t.depth) : 'css',
          animation: TECH_ANIMATION.has(String(t.animation)) ? String(t.animation) : 'vanilla',
          why: String(t.why ?? '').slice(0, 200),
          libraries: Array.isArray(t.libraries) ? t.libraries.map(String).slice(0, 6) : [],
        };
        notes = String(parsed.value.notes ?? '').slice(0, 200);
        method = 'model';
      } else {
        logger?.debug('skill selection: model reply was not JSON; using retriever');
      }
    } catch (error) {
      logger?.debug('skill selection: model call failed; using retriever', { error: String(error?.message ?? error) });
    }
  }
  if (!/react|next/.test(String(inspection?.framework ?? '').toLowerCase()) && tech.depth === 'r3f') tech.depth = 'threejs';

  const selection = [];
  const seen = new Set();
  const add = (id, why, source) => {
    const key = String(id ?? '').trim();
    if (!key || seen.has(key)) return;
    if (!registry.has(key)) { selection.push({ id: key, why, source, missing: true }); return; }
    seen.add(key);
    selection.push({ id: key, why, source });
  };
  for (const pick of modelPicks) add(pick.id, pick.why, 'model');
  if (method !== 'model') {
    const retriever = createRetriever({ registry, config, logger });
    const got = retriever.retrieve({ request: brief.text, taskType: brief.taskType ?? 'create-page', workspace: inspection, maxSkills, budgetTokens });
    for (const entry of got.skills) add(entry.id, entry.reasons?.[0] ?? 'retriever score', 'retriever');
  }
  const required = requiredSkillsFor({ tech, inspection, brief, registry, complexity });
  for (const id of required) add(id, 'required by the chosen technology/design', 'required');
  for (const id of always) add(id, 'always-include policy', 'always');

  // Budgeted load — required + always first, then the model's picks in its order.
  const priority = (entry) => (entry.source === 'required' ? 0 : entry.source === 'always' ? 1 : 2);
  const ordered = selection.filter((e) => !e.missing).sort((a, b) => priority(a) - priority(b));
  const loaded = [];
  const skipped = [];
  let tokens = 0;
  for (const entry of ordered) {
    const skill = registry.get(entry.id);
    const cost = skill?.tokens ?? estimateTokens(skill?.body ?? '');
    const overCount = loaded.length >= maxSkills + required.length;
    if (overCount || (tokens + cost > budgetTokens && loaded.length >= 3)) { skipped.push(entry.id); continue; }
    loaded.push({ id: entry.id, tokens: cost, source: entry.source });
    tokens += cost;
  }
  const ids = loaded.map((e) => e.id);
  const contextBlock = registry.documents(ids).join('\n\n---\n\n');
  const summary = `${method}: ${ids.join(', ')}${skipped.length ? ` (skipped over budget: ${skipped.join(', ')})` : ''}`;
  bus?.emit('skills.retrieved', { ids, method, required, loaded: ids });
  logger?.debug('skills selected', { method, ids, skipped, tech });
  return { ids, loaded, contextBlock, tokens, method, selection, tech, notes, required, skipped, catalogueSize: catalogue.length, summary };
}
