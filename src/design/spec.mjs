/**
 * Design spec — INTERNAL contract: DESIGN → EXPERIENCE → MOTION → TECH → BUILD → QA.
 * Deterministic, no LLM. Shared by runTask + runAgent so code implements a spec.
 */
const FEEL_MAP = {
  cinematic: ['cinematic', 'film', 'dramatic', 'epic'],
  premium: ['premium', 'luxury', 'high-end', 'high end', 'refined'],
  futuristic: ['futuristic', 'sci-fi', 'scifi', 'cyber', 'neo', 'insane', 'crazy'],
  playful: ['playful', 'fun', 'quirky', 'friendly'],
  calm: ['calm', 'quiet', 'minimal', 'serene', 'subtle'],
  editorial: ['editorial', 'magazine', 'literary'],
  technical: ['developer', 'api', 'dashboard', 'tool', 'console', 'devtool'],
};
function feelsOf(request = '') {
  const t = String(request).toLowerCase();
  const out = [];
  for (const [k, words] of Object.entries(FEEL_MAP)) if (words.some((w) => t.includes(w))) out.push(k);
  return out.length ? out : ['confident'];
}
function buildMotion(request = '', taskType = '') {
  const t = String(request).toLowerCase();
  const cinematic = /cinematic|scrub|pin\b|storytelling/.test(t);
  const scrollStory = /scroll|story|journey|timeline|chapter|narrative/.test(t);
  const parallax = /parallax|depth|float/.test(t);
  const cursor = /cursor|magnetic|spotlight/.test(t);
  const layers = [];
  if (scrollStory || cinematic) layers.push({ layer: 'scroll-story', what: 'section reveals sequenced to scroll (scrub)', why: 'narrative order', tech: 'gsap+scrolltrigger', when: 'storytelling pages only' });
  else layers.push({ layer: 'reveal', what: 'IO fade+rise on entry', why: 'reading-order hierarchy', tech: 'css+vanilla-js', when: 'default' });
  if (parallax) layers.push({ layer: 'parallax', what: '2 layers max, <=8% viewport, rAF', why: 'hero depth', tech: 'css', when: 'hero only' });
  if (cursor) layers.push({ layer: 'cursor', what: 'magnetic CTA / spotlight', why: 'conversion focus', tech: 'css+vanilla-js', when: 'pointer:fine only' });
  if (taskType.startsWith('create') || /hover|micro/.test(t)) layers.push({ layer: 'micro', what: 'hover lift 2px + press settle', why: 'affordance', tech: 'css', when: 'controls only' });
  return { layers, budget: cinematic ? { maxLayers: 4, maxScrub: 2, easing: 'expo.out/power3.out', dur: '240ms base, 720ms cinematic' } : { maxLayers: 2, maxScrub: 0, easing: 'power3.out', dur: '160-260ms base, 420ms slow' }, cinematic, reducedMotion: true, seq: 'entrance → interaction → exit; one easing family' };
}
function buildTech(request = '', taskType = '', inspection = {}) {
  const t = String(request).toLowerCase();
  const explicit3D = /\b3d\b|three\.?js|r3f|react-three|webgl|shader|immersive/.test(t);
  const ifHelps = /use 3d if|3d if it helps|3d if needed|if it helps/.test(t);
  const libs = (inspection.libraries ?? []).map((l) => String(l).toLowerCase());
  const hasReact = /react|next/.test(String(inspection.framework ?? '').toLowerCase()) || libs.some((l) => /react|next|three/.test(l));
  const simple = /simple|minimal|fast|lightweight|static/.test(t);
  let depth = 'css';
  let reason = 'no 3D requested; depth via CSS layers and type';
  let fallback = 'pure CSS; zero GPU cost';
  if (explicit3D && !simple) {
    if (/shader|distort|liquid|water|flow through|warp/.test(t)) { depth = 'shader'; reason = 'custom flow/distortion needs WebGL'; fallback = 'static gradient layer when WebGL off'; }
    else if (hasReact && /interactive|configurator|drag|orbit|scene/.test(t)) { depth = 'r3f'; reason = 'interactive object inside React tree'; fallback = 'CSS 3D preview + static figure'; }
    else if (/hero|floating|spin|rotat|orbit|scene/.test(t) || ifHelps) { depth = 'threejs'; reason = 'hero focal object earns one bounded scene'; fallback = 'CSS parallax orbs when WebGL off / reduced-motion'; }
    else { depth = 'threejs'; reason = '3D explicitly requested; one bounded hero scene'; fallback = 'CSS depth layer when WebGL off'; }
  }
  if (taskType === '3d' && depth === 'css') { depth = 'threejs'; reason = 'task type is 3d: one GPU-friendly hero effect'; fallback = 'CSS depth layer when WebGL off'; }
  return { depth, depthReason: reason, fallback, animation: /gsap|scrolltrigger|scrub|pin\b|timeline|choreograph|cinematic/.test(t) ? 'gsap' : 'vanilla', smoothScroll: /smooth.*scroll|lenis|buttery|silky/.test(t) ? 'lenis-via-cdn' : 'css-smooth', perf: { gpu: depth === 'css' ? 'none' : 'one hero canvas, DPR<=2, pause offscreen/hidden', mobile: depth === 'css' ? 'full fidelity' : 'reduce geometry, hide canvas <60rem, keep CSS depth', loading: depth === 'css' ? 'no loader' : 'async CDN, content readable before WebGL' }, framework: inspection.framework ?? 'static' };
}
function conceptOf(request = '', feels = [], direction) {
  const t = String(request).toLowerCase();
  const cues = [];
  if (/water|flow|liquid/.test(t)) cues.push('fluid flow through typography');
  if (/futuristic|insane|crazy|neon|cyber/.test(t)) cues.push('instrument-panel depth');
  if (/editorial|magazine|serif|paper/.test(t)) cues.push('print-grade type, hairlines over cards');
  if (/dashboard|developer|api|console|tool/.test(t)) cues.push('mono-labelled precision surfaces');
  if (/soft|calm|warm|friendly/.test(t)) cues.push('soft surfaces, generous air');
  return `${feels.join('/')} register; ${direction?.name ?? 'chosen direction'} discipline; ${cues.length ? cues.join('; ') : 'one focal idea per viewport, asymmetry over symmetry'}`;
}
export function buildDesignSpec({ request = '', understanding = {}, direction, inspection = {}, agreed = {} } = {}) {
  const taskType = understanding.taskType ?? 'create-page';
  const feels = feelsOf(request);
  const motion = buildMotion(request, taskType);
  const tech = buildTech(request, taskType, inspection);
  const t = String(request).toLowerCase();
  // Explicit conversation decisions (avoid/emphasis) — first-class spec inputs,
  // not just request-text keywords. Negations ("not purple", "restrained hero")
  // and focus ("typography as main focus") must survive into the contract.
  const avoid = Array.isArray(agreed.avoid) ? agreed.avoid : [];
  const emphasis = Array.isArray(agreed.emphasis) ? agreed.emphasis : [];
  const avoidText = avoid.join(' | ').toLowerCase();
  const emphasisText = [...emphasis, String(request)].join(' | ').toLowerCase();
  const restrainedHero = /\bhero\b/.test(avoidText) && /(overload|crowd|busy|huge|oversized|too?\s*big|clutter|restrain|minimal|simple)/.test(avoidText);
  const avoidPurple = /purple/.test(avoidText);
  const typeFocus = /(typograph|display type|headline).*focus|focus.*(typograph|display type|headline)/.test(emphasisText);
  // Rich design decisions — stored BEFORE major implementation to prevent generic components
  const visual_direction = direction
    ? `${direction.name} (${direction.id}) — ${direction.summary}; character ${direction.character.join(', ')}; rules: ${direction.rules.slice(0,2).join('; ')}`
    : 'confident register; single focal idea per viewport, asymmetry over symmetry';
  const layout_strategy = direction?.grid ?? 'asymmetric 7/5 split hero, bento/features grid, 12-col institutional for dense sections; nav + hero (one focal) + proof + features + showcase + testimonials + cta + footer';
  const typography = (direction
    ? `display ${direction.fonts.display} tight tracking ${direction.tracking.display}, body 16px/1.65 measure <=62ch, mono ${direction.fonts.mono} for labels; scale ${direction.typeScale}`
    : 'display tight tracking; body 16px/1.65 mono labels; measure <=62ch');
  const typographyOut = typeFocus ? `typography as primary focus; ${typography}` : typography;
  const colorOut = (direction
    ? `theme ${direction.theme}/${direction.neutral}; accent ${direction.accent} as signal only 60-30-10; surfaces layered (base+atmosphere max 1), grain 2-4%`
    : 'one accent as signal only 60-30-10; neutral substrate + layered depth')
    + (avoidPurple ? '; AVOID purple AI-SaaS gradient cliché (explicitly rejected)' : '');
  const hero_concept = (() => {
    if (restrainedHero) return 'restrained hero: typography-led single focal, generous whitespace, calm composition, no overload, no oversized title';
    if (/cinematic|premium|futuristic/.test(t) && tech.depth !== 'css') return `cinematic hero: bounded WebGL focal (${tech.depth}) + parallax orbs + scrimmed typography, depth 40-60px, vignette edges, one atmosphere`;
    if (/cinematic|premium/.test(t)) return 'cinematic hero: layered depth via CSS orbs + full-bleed figure, display type large with tight tracking, asymmetry 7/5';
    if (direction?.id === 'editorial-serif') return 'editorial hero: oversized serif breaking grid, hairlines over cards, marginal whitespace, paper substrate';
    if (direction?.id === 'terminal-mono') return 'terminal hero: monospace density, keycap affordances, bracket/caret glyphs, left-aligned structure';
    return 'hero: one focal object, asymmetrical composition, headline + proof + dual CTA, supporting figure on 5-col side';
  })();
  const motion_language = `${motion.seq}; easing family ${motion.budget.easing}; durations ${motion.budget.dur}; layers: ${(motion.layers||[]).map(l=>l.layer).join('+')}; reduced-motion fallback static`;
  const depth3d_strategy = `${tech.depth} — ${tech.depthReason}; fallback: ${tech.fallback}; perf: ${tech.perf.gpu}; mobile: ${tech.perf.mobile}`;
  const interaction_strategy = (() => {
    const parts = [];
    if (motion.layers.some(l=>l.layer==='cursor')) parts.push('magnetic CTA / spotlight on pointer:fine only');
    if (motion.layers.some(l=>l.layer==='parallax')) parts.push('parallax 2 layers max <=8% viewport, rAF, hero-only');
    if (tech.depth !== 'css') parts.push(`3D responds to mouse (0.5 damp) + scroll linkage (yRot 0.18 per 1200px), DPR<=1.8, pause when hidden`);
    parts.push('micro: hover lift 2px + press settle 1px, affordance only on controls');
    return parts.join('; ');
  })();
  const responsive_strategy = 'mobile-first; hero collapses <60rem single col, grids auto-fit min 280px, 768px breakpoint mandatory, 390px no overflow-x, WebGL hidden <60rem coarse pointer';
  const performance_constraints = tech.depth === 'css'
    ? 'no GPU cost; CSS only, <100KB JS, no loaders'
    : 'one hero canvas tri-count < 30k, async CDN importmap, content readable before WebGL, DPR 1.8 cap, offscreen pause, visibilitychange dispose';

  const design = {
    project: String(agreed.product ?? '').slice(0, 80) || understanding.subject || String(request).slice(0, 80),
    purpose: understanding.subject ?? String(request).slice(0, 80),
    feels,
    avoid,
    emphasis,
    direction: direction ? { id: direction.id, name: direction.name, summary: direction.summary, accent: direction.accent, theme: direction.theme } : undefined,
    visualConcept: conceptOf(request, feels, direction),
    visual_direction,
    layout_strategy,
    typography: typographyOut,
    color_system: colorOut,
    hero_concept,
    motion_language,
    '3d_strategy': depth3d_strategy,
    interaction_strategy,
    responsive_strategy,
    performance_constraints,
    composition: layout_strategy,
    responsive: responsive_strategy,
  };
  const iterations = [{ id: 'i1-structure', goal: 'structure + type + composition', files: ['index.html', 'styles/main.css'] }, { id: 'i2-motion', goal: 'motion + interactions + depth', files: ['styles/main.css', 'scripts/main.js'] }];
  if (tech.depth !== 'css') iterations.push({ id: 'i3-creative', goal: `creative layer (${tech.depth}) + fallback`, files: ['scripts/main.js'] });
  iterations.push({ id: 'i4-polish', goal: 'responsive + polish + gate', files: ['index.html', 'styles/main.css', 'scripts/main.js'] });
  return { design, motion, tech, plan: { iterations }, taskType, feels };
}
export function renderSpecBlock(spec) {
  if (!spec) return '';
  const L = [`DESIGN SPEC — ${spec.design?.purpose ?? ''} [${(spec.feels ?? []).join('/')}]`];
  if (spec.design?.project) L.push(`project: ${spec.design.project}`);
  if ((spec.design?.avoid ?? []).length) L.push(`avoid (must not build): ${spec.design.avoid.join(' | ')}`);
  if ((spec.design?.emphasis ?? []).length) L.push(`emphasis (must honor): ${spec.design.emphasis.slice(0, 6).join(' | ')}`);
  if (spec.design?.visualConcept) L.push(`concept: ${spec.design.visualConcept}`);
  if (spec.design?.direction) L.push(`direction: ${spec.design.direction.name} (${spec.design.direction.id})`);
  L.push(`visual_direction: ${spec.design?.visual_direction ?? ''}`);
  L.push(`layout_strategy: ${spec.design?.layout_strategy ?? ''}`);
  L.push(`typography: ${spec.design?.typography ?? ''}`);
  L.push(`color_system: ${spec.design?.color_system ?? ''}`);
  L.push(`hero_concept: ${spec.design?.hero_concept ?? ''}`);
  L.push(`motion_language: ${spec.design?.motion_language ?? ''}`);
  L.push(`3d_strategy: ${spec.design?.['3d_strategy'] ?? ''}`);
  L.push(`interaction_strategy: ${spec.design?.interaction_strategy ?? ''}`);
  L.push(`responsive_strategy: ${spec.design?.responsive_strategy ?? ''}`);
  L.push(`performance_constraints: ${spec.design?.performance_constraints ?? ''}`);
  for (const m of spec.motion?.layers ?? []) L.push(`- motion ${m.layer}: ${m.what} [${m.tech}]`);
  L.push(`3D/tech: ${spec.tech?.depth} — ${spec.tech?.depthReason}; fallback: ${spec.tech?.fallback}; anim: ${spec.tech?.animation}`);
  L.push(`order: ${(spec.plan?.iterations ?? []).map((i) => i.id).join(' -> ')}`);
  return L.join('\n');
}
export function specSkillPhases(spec) {
  const p = new Set(['structure']);
  if ((spec?.tech?.depth ?? 'css') !== 'css') p.add('creative');
  if (spec?.motion?.cinematic || spec?.tech?.animation === 'gsap' || (spec?.motion?.layers ?? []).length > 1) p.add('motion');
  p.add('polish');
  return [...p];
}

