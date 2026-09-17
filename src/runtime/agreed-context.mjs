/**
 * Agreed design context — the durable, compact record of what the user and the
 * agent have decided. It is the ONLY thing that flows from discussion into
 * execution: spec, skill selection, TODOs, implementation, visual QA and
 * follow-up refinements all read from it.
 *
 * Two writers:
 *   - the conversation model returns a structured patch every turn (mergeContextPatch)
 *   - offline, a deterministic extractor folds the user's words in (extractContextHeuristically)
 * Both produce the same schema, so execution never cares which one ran.
 */

const STRING_FIELDS = ['project', 'product', 'audience', 'purpose', 'composition', 'typography', 'color', 'layout', 'hero', 'interaction', 'motion', 'depth3d', 'summary'];
const LIST_FIELDS = ['visualDirection', 'tech', 'accepted', 'rejected', 'constraints', 'notes', 'changeRequests'];
const LIST_CAP = 14;

export function createAgreedContext() {
  return {
    version: 2,
    project: '', product: '', audience: '', purpose: '',
    visualDirection: [],
    composition: '', typography: '', color: '', layout: '', hero: '', interaction: '', motion: '', depth3d: '',
    tech: [],
    accepted: [], rejected: [], constraints: [], notes: [],
    changeRequests: [],
    summary: '',
    build: null,
    decisions: [],
    updatedAt: undefined,
  };
}

/** Upgrade older shapes (v1 lists for typography/color/motion/…) into v2. */
export function normalizeAgreedContext(ctx) {
  const c = { ...createAgreedContext(), ...(ctx ?? {}) };
  for (const key of STRING_FIELDS) if (Array.isArray(c[key])) c[key] = c[key].filter(Boolean).join('; ').slice(0, 240);
  if (Array.isArray(ctx?.acceptedIdeas)) c.accepted = uniq([...(c.accepted ?? []), ...ctx.acceptedIdeas]);
  if (Array.isArray(ctx?.rejectedIdeas)) c.rejected = uniq([...(c.rejected ?? []), ...ctx.rejectedIdeas]);
  for (const key of LIST_FIELDS) c[key] = uniq((c[key] ?? []).map(clean)).slice(-LIST_CAP);
  c.version = 2;
  return c;
}

function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 160); }
function uniq(list) {
  const seen = new Set();
  const out = [];
  for (const item of list.map(clean).filter(Boolean)) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
function removeMatching(list, value) {
  const needle = clean(value).toLowerCase();
  if (!needle) return list;
  return list.filter((item) => { const it = item.toLowerCase(); return !(it === needle || it.includes(needle) || needle.includes(it)); });
}

/** Merge a structured patch (from the model or the heuristic extractor). */
export function mergeContextPatch(ctx, patch, { source = 'model', turnText } = {}) {
  const c = normalizeAgreedContext(ctx);
  const p = patch && typeof patch === 'object' ? patch : {};
  for (const key of STRING_FIELDS) {
    if (typeof p[key] === 'string' && clean(p[key])) c[key] = clean(p[key]).slice(0, 240);
  }
  for (const key of LIST_FIELDS) {
    const raw = p[key];
    const list = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw.trim() ? [raw] : []);
    if (!list.length) continue;
    let merged = uniq([...c[key], ...list]);
    if (key === 'rejected') for (const item of list) c.accepted = removeMatching(c.accepted, item);
    if (key === 'accepted') for (const item of list) c.rejected = removeMatching(c.rejected, item);
    c[key] = merged.slice(-LIST_CAP);
  }
  if (p.clearChangeRequests === true) c.changeRequests = [];
  if (turnText) {
    c.decisions.push({ text: clean(turnText).slice(0, 160), at: new Date().toISOString(), source });
    if (c.decisions.length > 30) c.decisions = c.decisions.slice(-30);
  }
  c.updatedAt = new Date().toISOString();
  return c;
}

/* ---------------------------------------------------------- heuristic fold ---- */

const META_RE = /^(hi|hiya|hello|hey|yo|salam|marhaba|thanks|thank you|thx|help|what can you do\??|commands\??|who are you\??|status)\b|\bworkspace\b|\bdirector(y|ies)\b|where (are|r) (you|u) (working|building)/i;
const TRIGGER_RE = /^(ok(ay)?[,.! ]*)?(please[,. ]*)?(yes[,.! ]*)?(now[,. ]*)?(go( ahead)?( and)?[,. ]*)?(build|implement|make|do|ship|code|write|create|start( working| building)?|finish|execute|proceed|let'?s (build|do it|go|ship))( it| this| that| now| please| the (change|changes|update|updates|plan|design|site|page))?[.! ]*$/i;
const VISUAL_WORDS = ['cinematic', 'immersive', 'premium', 'futuristic', 'organic', 'minimal', 'minimalist', 'editorial', 'playful', 'calm', 'dark', 'light', 'brutalist', 'luxury', 'elegant', 'bold', 'warm', 'cold', 'monochrome', 'retro', 'technical', 'clean', 'quiet', 'dramatic'];

function objectPhrase(text) {
  // "a landing page for an AI developer tool" → project + product
  const m = text.match(/\b(landing page|home ?page|marketing site|website|web ?site|site|web app|app|dashboard|portfolio|login (?:page|screen)|sign-?up (?:page|flow)|checkout|pricing page|docs? site|blog|component library|hero section|hero|section|component|form|page)\b(?:\s+for\s+(?:an?\s+|my\s+|our\s+|the\s+)?([^.,;!?]{2,60}))?/i);
  if (!m) return {};
  const object = m[1].toLowerCase();
  const product = m[2] ? clean(m[2]).replace(/^(called|named)\s+/i, '') : '';
  return { project: product ? `${object} for ${product}` : object, product };
}

/** Deterministic extraction for one user turn (offline fallback). */
export function extractContextHeuristically(ctx, raw) {
  const text = clean(raw);
  const c = normalizeAgreedContext(ctx);
  if (!text || text.startsWith('/')) return c;
  const lower = text.toLowerCase();
  if (META_RE.test(text) && text.length < 60) return mergeContextPatch(c, {}, { source: 'heuristic', turnText: text });
  if (TRIGGER_RE.test(text)) return mergeContextPatch(c, {}, { source: 'heuristic', turnText: text });
  const patch = {};
  const hasBuild = Boolean(c.build);

  if (!c.project) {
    const obj = objectPhrase(text);
    if (obj.project) patch.project = obj.project;
    if (obj.product && !c.product) patch.product = obj.product;
  }
  if (!c.purpose && text.length > 24 && !/\b(not|don'?t|no)\b/.test(lower)) patch.purpose = text.slice(0, 160);
  const audience = text.match(/\bfor\s+(developers|designers|founders|teams|students|enterprises|small businesses|marketers|engineers|creators|kids|parents)\b/i);
  if (audience) patch.audience = audience[1];

  const visuals = VISUAL_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(lower));
  if (visuals.length) patch.visualDirection = visuals;

  const rejected = [];
  for (const m of text.matchAll(/\b(?:not|no|never|without|avoid|don'?t (?:want|use|like)|do not (?:want|use)|skip|drop|remove)\s+(?:the\s+|any\s+|a\s+|an\s+)?(?:typical|usual|generic|standard|classic|cliché)?\s*([^.,;!?]{2,60})/gi)) {
    const chunk = clean(m[1]);
    if (chunk && !/^(sure|really|yet|now|just)\b/i.test(chunk)) rejected.push(chunk);
  }
  const typicalMatch = text.match(/\bnot\s+(?:the\s+|another\s+)?(?:typical|usual|generic|standard)\s+([^.,;!?]{2,60})/i);
  if (typicalMatch) rejected.push(clean(typicalMatch[1]));
  if (rejected.length) patch.rejected = rejected;

  if (/\b(hero|title|headline)\b/.test(lower) && /(overload|crowd|busy|clutter|too much|too big|oversized|heavy)/.test(lower)) patch.constraints = ['restrained hero — typography stays the focus'];
  const focus = text.match(/\b(typography|type|hero|motion|performance|simplicity|content|imagery|color|colour|layout|copy|product)\b[^.,;!?]{0,40}\b(?:main |primary |visual )?focus\b/i);
  if (focus) { patch.accepted = [`${focus[1].toLowerCase()} as the main focus`]; if (/typograph|type/.test(focus[1].toLowerCase())) patch.typography = 'typography is the primary visual element'; }

  if (/\b(typograph|font|serif|sans|tracking|headline|display type)\b/.test(lower) && !patch.typography) patch.typography = text.slice(0, 160);
  if (/\b(colou?r|palette|accent|gradient|neon|monochrome|dark mode|light mode)\b/.test(lower)) patch.color = text.slice(0, 160);
  if (/\b(motion|animat|scroll-driven|scroll|transition|parallax|scrub|micro-?interaction)\b/.test(lower)) patch.motion = text.slice(0, 160);
  if (/\b(3d|three\.?js|webgl|depth|spatial|immersive)\b/.test(lower)) patch.depth3d = text.slice(0, 160);
  if (/\b(hero)\b/.test(lower) && !/(overload|crowd)/.test(lower)) patch.hero = text.slice(0, 160);
  if (/\b(layout|grid|composition|asymmetr|bento|split|columns?)\b/.test(lower)) patch.layout = text.slice(0, 160);
  if (/\b(hover|cursor|click|drag|interactive|interaction)\b/.test(lower)) patch.interaction = text.slice(0, 160);
  const tech = ['react', 'next', 'nextjs', 'vue', 'svelte', 'astro', 'tailwind', 'gsap', 'three', 'three.js', 'r3f', 'lenis', 'framer', 'vanilla', 'plain html', 'static'].filter((w) => new RegExp(`\\b${w.replace('.', '\\.')}\\b`).test(lower));
  if (tech.length) patch.tech = tech;
  if (/\b(yes|yeah|exactly|perfect|love (it|that)|great|sounds good|like that|keep|go with)\b/.test(lower) && text.length < 200 && !TRIGGER_RE.test(text)) patch.accepted = [...(patch.accepted ?? []), text.slice(0, 120)];
  if (/\b(what if|maybe|could we|how about|perhaps)\b/.test(lower)) patch.notes = [`idea floated: ${text.slice(0, 120)}`];

  if (hasBuild && !/^(what|why|how|which|is|are|can|does|do)\b/.test(lower) && (/\b(make|add|change|update|remove|replace|tweak|adjust|move|swap|increase|decrease|more|less|bigger|smaller|darker|lighter|rework|redo|improve|refine|polish)\b/.test(lower))) {
    patch.changeRequests = [text.slice(0, 160)];
  }
  return mergeContextPatch(c, patch, { source: 'heuristic', turnText: text });
}

/** Backwards-compatible alias (older code called updateAgreedContext(ctx, text)). */
export function updateAgreedContext(ctx, raw) { return extractContextHeuristically(ctx, raw); }

/* ---------------------------------------------------------------- readiness ---- */

/** Is there enough agreed substance to execute without inventing anything? */
export function contextReadiness(ctx, { hasBuild = false } = {}) {
  const c = normalizeAgreedContext(ctx);
  const object = c.project || c.product || c.purpose || c.summary;
  const signals = [
    c.visualDirection.length, c.accepted.length, c.rejected.length, c.hero, c.typography, c.color, c.layout, c.motion, c.depth3d, c.composition, c.interaction, c.audience,
  ].filter((v) => (Array.isArray(v) ? v.length : Boolean(v))).length;
  if (hasBuild || c.build) {
    if (c.changeRequests.length) return { ready: true, mode: 'refine', reason: `${c.changeRequests.length} pending change request(s)` };
    return { ready: false, mode: 'refine', reason: 'nothing-new', signals };
  }
  if (!object) return { ready: false, mode: 'create', reason: 'empty-context', signals };
  if (signals < 1) return { ready: false, mode: 'create', reason: 'no-direction', signals };
  return { ready: true, mode: 'create', reason: `object + ${signals} design signal(s)`, signals };
}

/* ------------------------------------------------------------------ render ---- */

export function renderAgreedContext(ctx, { includeBuild = true, title = 'AGREED DESIGN CONTEXT' } = {}) {
  const c = normalizeAgreedContext(ctx);
  const lines = [];
  const add = (label, value) => { if (Array.isArray(value) ? value.length : value) lines.push(`${label}: ${Array.isArray(value) ? value.join(' | ') : value}`); };
  add('Project', c.project);
  add('Product', c.product);
  add('Audience', c.audience);
  add('Purpose', c.purpose && c.purpose !== c.project ? c.purpose : '');
  add('Summary', c.summary);
  add('Visual direction', c.visualDirection);
  add('Composition', c.composition);
  add('Layout', c.layout);
  add('Hero', c.hero);
  add('Typography', c.typography);
  add('Color', c.color);
  add('Motion', c.motion);
  add('3D / depth', c.depth3d);
  add('Interaction', c.interaction);
  add('Tech preferences', c.tech);
  add('Accepted', c.accepted);
  add('REJECTED (must NOT do)', c.rejected);
  add('Constraints', c.constraints);
  add('Pending change requests', c.changeRequests);
  if (includeBuild && c.build) lines.push(`Existing build: ${(c.build.files ?? []).join(', ') || 'files unknown'} (${c.build.at ?? ''})${c.build.summary ? ` — ${c.build.summary}` : ''}`);
  if (!lines.length) return '';
  return `${title}\n${lines.join('\n')}`;
}

export function contextDigest(ctx) {
  const c = normalizeAgreedContext(ctx);
  const bits = [];
  if (c.project) bits.push(c.project);
  if (c.visualDirection.length) bits.push(c.visualDirection.slice(0, 4).join('/'));
  if (c.rejected.length) bits.push(`avoid: ${c.rejected.slice(0, 3).join(', ')}`);
  if (c.changeRequests.length) bits.push(`pending: ${c.changeRequests.length}`);
  if (c.build) bits.push(`built: ${(c.build.files ?? []).length} files`);
  return bits.join(' · ') || '(nothing agreed yet)';
}

/** Compact, JSON-safe record for run logs / tests. */
export function snapshotAgreed(ctx) {
  const c = normalizeAgreedContext(ctx);
  return {
    project: c.project, product: c.product, summary: c.summary,
    visual: [...c.visualDirection], hero: c.hero, typography: c.typography, color: c.color, motion: c.motion, depth3d: c.depth3d,
    accepted: [...c.accepted], rejected: [...c.rejected], constraints: [...c.constraints], changeRequests: [...c.changeRequests],
    decisions: c.decisions.length, built: Boolean(c.build),
  };
}

/** Execution directives derived from the context: what to avoid, what to honor. */
export function directivesFromContext(ctx) {
  const c = normalizeAgreedContext(ctx);
  return {
    product: c.product || c.project,
    purpose: c.summary || c.purpose || c.project,
    visual: [...c.visualDirection],
    avoid: uniq([...c.rejected, ...c.constraints]),
    emphasis: uniq([c.typography, c.hero, ...c.accepted, c.motion, c.depth3d, c.composition, c.color, c.layout, c.interaction].filter(Boolean)),
  };
}

export function recordBuild(ctx, { files = [], summary = '', spec, skills = [], qaScore, mode = 'create', status = 'done' } = {}) {
  const c = normalizeAgreedContext(ctx);
  const previousFiles = c.build?.files ?? [];
  c.build = {
    at: new Date().toISOString(),
    files: uniq([...previousFiles, ...files]).slice(-40),
    summary: clean(summary).slice(0, 200),
    specSummary: spec?.design ? clean([spec.design.visual_direction, spec.design.hero_concept].filter(Boolean).join(' / ')).slice(0, 240) : c.build?.specSummary,
    skills: uniq([...(c.build?.skills ?? []), ...skills]).slice(-16),
    qaScore,
    mode,
    status,
    builds: (c.build?.builds ?? 0) + 1,
  };
  if (status === 'done' || status === 'needs-fix') {
    // Change requests that were executed become part of the accepted record.
    if (mode === 'refine' && c.changeRequests.length) c.accepted = uniq([...c.accepted, ...c.changeRequests.map((r) => `applied: ${r}`)]).slice(-LIST_CAP);
    c.changeRequests = [];
  }
  c.updatedAt = new Date().toISOString();
  return c;
}

/** Legacy helper: fold the rendered block into a request string. */
export function applyAgreedToRequest(request, ctx) {
  const block = renderAgreedContext(ctx);
  if (!block) return String(request ?? '');
  return `${String(request ?? '').trim()}\n[${block.replace(/\n/g, '\n')}]`;
}
