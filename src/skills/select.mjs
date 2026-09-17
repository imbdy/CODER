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
import { ambitionRegister } from '../agent/prompts.mjs';
import { createRetriever } from './retriever.mjs';
import { estimateTokens } from '../core/util.mjs';

const TECH_DEPTHS = new Set(['css', 'threejs', 'r3f', 'shader']);
const TECH_ANIMATION = new Set(['css', 'vanilla', 'gsap']);

/**
 * The catalogue the model chooses from. All 57 lines cost ~1.7k tokens, which is
 * most of a minute on a metered tier, so `limit` narrows it to the strongest
 * candidates (scored by the retriever) plus everything the runtime will require
 * anyway — the model still chooses, from a shortlist rather than the shelf.
 */
export function catalogueLines(registry, { limit, keep = [], request = '', taskType = 'create-page', workspace = {}, config = {}, logger } = {}) {
  const all = registry.list();
  const line = (skill) => `- ${skill.id} [${skill.category}] ${String(skill.description).slice(0, 110)}`;
  if (!limit || all.length <= limit) return all.map(line);
  const scored = createRetriever({ registry, config, logger }).retrieve({ request, taskType, workspace, maxSkills: limit, budgetTokens: Number.MAX_SAFE_INTEGER });
  const shortlist = new Set([...keep, ...scored.ids, ...scored.excluded.map((e) => e.id)]);
  const picked = all.filter((skill) => shortlist.has(skill.id)).slice(0, limit);
  return (picked.length ? picked : all.slice(0, limit)).map(line);
}

/** Skills the runtime insists on for a given technology / brief, filtered to what exists. */
export function requiredSkillsFor({ tech = {}, inspection = {}, brief = {}, registry, complexity = 'standard' } = {}) {
  const need = new Set();
  const framework = String(inspection?.framework ?? '').toLowerCase();
  const isReact = /react|next/.test(framework);
  const depth = String(tech.depth ?? 'css');
  const animation = String(tech.animation ?? 'css');
  const text = `${brief?.text ?? ''}`.toLowerCase();
  const pageLike = /landing|page|site|home|marketing|portfolio|hero/.test(text) || ['create-page', 'create-app', 'redesign'].includes(brief?.taskType);
  // The mandatory set is deliberately small: the four decisions no build may
  // skip (identity, palette, type pairing, anti-generic) plus the ones the task
  // shape demands. Everything else is a candidate the model picks or phase
  // retrieval adds — piling sixteen "required" skills on is a dump, not taste.
  if (complexity !== 'trivial') {
    need.add('anti-slop'); need.add('art-direction'); need.add('color-systems'); need.add('type-pairing');
  }
  if (pageLike && brief?.mode !== 'refine') { need.add('hero-composition'); need.add('copywriting'); }
  if (/\b(icon|illustration|diagram|logo|wordmark|svg|texture|grain)\b/.test(text)) need.add('svg-craft');
  if (/\b(scroll|parallax|sticky|pin|scrub|reveal|stagger)\b/.test(text) || animation === 'gsap') need.add('scroll-choreography');
  if (depth !== 'css' || animation === 'gsap' || /\b(performance|fast|60fps|lighthouse)\b/.test(text)) need.add('performance-budget');
  // A brief that asks for cinema must get the journey architecture, not just the
  // Three.js basics: without it the model reaches for a hero canvas with a few
  // shapes in it, which is the 3D form of a templated page.
  if (ambitionRegister(text) === 'cinematic') {
    need.add('cinematic-direction'); need.add('webgl-scroll-journey'); need.add('threejs'); need.add('shaders');
    need.add('3d-performance'); need.add('scroll-choreography'); need.add('performance-budget');
    if (isReact) need.add('react-three-fiber'); else need.add('vanilla-motion');
  }
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
export async function selectSkills({ router, registry, brief, inspection = {}, config = {}, bus, logger, complexity = 'standard', catalogueLimit } = {}) {
  const maxSkills = Number(config?.skills?.maxSkillsPerTask ?? 8);
  const budgetTokens = Number(config?.runtime?.skillBudgetTokens ?? 14000);
  const always = [...(config?.skills?.alwaysInclude ?? [])].filter((id) => registry.has(id));
  const catalogue = catalogueLines(registry, {
    limit: catalogueLimit,
    keep: requiredSkillsFor({ tech: {}, inspection, brief, registry, complexity }),
    request: brief?.text ?? '', taskType: brief?.taskType ?? 'create-page', workspace: inspection, config, logger,
  });
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
        bus?.emit('warn', { message: 'skill selection fell back to the retriever: the model reply was not JSON' });
      }
    } catch (error) {
      logger?.debug('skill selection: model call failed; using retriever', { error: String(error?.message ?? error) });
      bus?.emit('warn', { message: 'skill selection fell back to the retriever: ' + String(error?.message ?? error).slice(0, 160) });
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
  // A hard ceiling on how many bodies load at once. Without it the model's picks
  // plus every required skill reached twenty, which is a dump, not a selection.
  const hardCap = Number(config?.skills?.maxLoadedSkills ?? 12);
  for (const entry of ordered) {
    const skill = registry.get(entry.id);
    const cost = skill?.tokens ?? estimateTokens(skill?.body ?? '');
    const overCount = loaded.length >= Math.min(hardCap, maxSkills + required.length);
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
