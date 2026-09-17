/** Agreed design context — compact persistent decisions shared by
 * discussion AND execution. Concise decisions only, no chain-of-thought.
 * This is what lets "Perfect. Build it." implement everything agreed above,
 * not just the last message. */
export function createAgreedContext() {
  return {
    product: '',
    purpose: '',
    visualDirection: [],
    acceptedIdeas: [],
    rejectedIdeas: [],
    typography: [],
    color: [],
    motion: [],
    depth3d: [],
    layout: [],
    constraints: [],
    decisions: [], // [{ text, at }] newest last, capped
    lastSpecSummary: '',
    updatedAt: undefined,
  };
}

const REJECT_RE = /\b(don'?t like|remove|drop|no orb|not .*orb|less |reject|avoid|hate|too much)\b/i;
const ACCEPT_RE = /\b(yes|yeah|like that|love|perfect|good|great|keep|use that|let'?s do)\b/i;
// Session-meta ("hi", "what workspace…?", "status") carries no design signal
// and must not become purpose/product/visuals. Recorded, never extracted.
const META_RE = /^(hi|hiya|hello|hey|yo|salam|marhaba|thanks|thank you|thx|help|what can you do\??|commands\??)\b|\bworkspace\b|\bdirector(y|ies)\b|where (are|r) (you|u) (working|building)|(^|\b)(\/status|status)\b|what (have|did) you (done|built|changed|made)|progress so far/i;
// Local build-trigger guard (agreed-context must stay dependency-free:
// interactive.mjs owns the full isBuildTrigger, this is just enough to avoid
// treating "Build it" as an accepted design idea).
const BUILD_TRIGGER_SHORT_RE = /^(build it|go ahead|start|make it|do it|build this|implement it|please build|ok build it|yes build it|let'?s do it|ship it|okay,?\s*implement it|let'?s build)\.?$/i;
function isShortBuildTrigger(text) {
  const raw = String(text ?? '').trim().toLowerCase();
  return raw.length < 40 && BUILD_TRIGGER_SHORT_RE.test(raw);
}

/** Fold one discussion turn into the agreed context (deterministic, cheap). */
export function updateAgreedContext(ctx, raw) {
  const c = ctx ?? createAgreedContext();
  const text = String(raw ?? '').trim();
  if (!text) return c;
  const lower = text.toLowerCase();
  // Session-meta is history, not design: record it and extract nothing.
  if (META_RE.test(text)) {
    c.decisions.push({ text: text.slice(0, 160), at: new Date().toISOString() });
    if (c.decisions.length > 24) c.decisions = c.decisions.slice(-24);
    c.updatedAt = new Date().toISOString();
    return c;
  }
  const push = (list, value) => {
    const v = String(value ?? '').trim();
    if (v && !list.includes(v)) list.push(v);
  };
  // Rejections are first-class: "I don't like the orb" must survive to build.
  if (REJECT_RE.test(lower)) {
    const m = text.match(/(?:don'?t like|remove|drop|reject|avoid|no)\s+(?:the\s+)?([^.,;!]{2,60})/i);
    push(c.rejectedIdeas, (m?.[1] ?? text).trim().slice(0, 80));
  }
  // Explicit don't-wants: "I don't want the hero to be overloaded."
  {
    const m = text.match(/(?:don'?t want|do not want)\s+([^.,;!]{2,70})/i);
    if (m) {
      const chunk = m[1].trim().slice(0, 80);
      push(c.rejectedIdeas, chunk);
      // Hero restraint is a layout constraint the spec must honor.
      if (/\b(hero|title|headline)\b/i.test(chunk) && /(overload|crowd|busy|huge|oversized|too?\s*big|clutter|heavy|loaded)/i.test(chunk)) {
        push(c.constraints, 'restrained hero');
      }
    }
  }
  // "Not the typical X" rejections: "not the typical purple AI SaaS look".
  {
    const m = text.match(/\bnot\s+(?:the\s+|another\s+)?(?:typical|usual|generic)\s+([^.,;!]{2,60})/i);
    if (m) push(c.rejectedIdeas, m[1].trim().slice(0, 80));
  }
  // Focus declarations: "keep typography as the main focus".
  {
    const m = text.match(/\b(typography|type|hero|motion|performance|simplicity|content|imagery|color|colour|layout)\b[^.,;!]{0,30}\b(?:main\s+)?focus\b/i);
    if (m) push(c.acceptedIdeas, `${m[1].toLowerCase()} as main focus`);
  }
  // Visual / feel cues
  for (const w of ['cinematic', 'immersive', 'premium', 'futuristic', 'organic', 'minimal', 'editorial', 'playful', 'calm', 'dark', 'light', 'strong typography', 'typography', '3d', 'scroll', 'motion', 'parallax']) {
    if (lower.includes(w)) push(c.visualDirection, w);
  }
  if (/\b(orb|glow|gradient|bento|glass|cards?)\b/i.test(text)) {
    const m = text.match(/\b(orb|glow|gradient|bento|glass|cards?)\b[^.,;]{0,40}/i);
    if (m) (REJECT_RE.test(lower) ? push(c.rejectedIdeas, m[0].trim()) : push(c.acceptedIdeas, m[0].trim()));
  }
  if (/\b(typograph|font|serif|tracking|headline|title)\b/i.test(text)) push(c.typography, text.slice(0, 120));
  if (/\b(colo[u]?r|palette|dark|light|accent|blue|green|warm|neon)\b/i.test(text)) push(c.color, text.slice(0, 120));
  if (/\b(motion|animat|scroll|transition|hover|parallax|scrub)\b/i.test(text)) push(c.motion, text.slice(0, 120));
  if (/\b(3d|three|webgl|object|scene|depth|immersive|organic visual)\b/i.test(text)) push(c.depth3d, text.slice(0, 120));
  if (/\b(hero|layout|section|nav|grid|composition)\b/i.test(text)) push(c.layout, text.slice(0, 120));
  if (!c.product) {
    const m = text.match(/for\s+(?:an?\s+|my\s+)?([^.,;!]{2,50})/i);
    if (m && /tool|app|product|brand|site|page|startup/.test(m[1])) c.product = m[1].trim().slice(0, 60);
  }
  if (!c.purpose && text.length > 24 && !REJECT_RE.test(lower)) c.purpose = text.slice(0, 160);
  if (ACCEPT_RE.test(lower) && text.length > 8 && text.length < 200 && !isShortBuildTrigger(text)) push(c.acceptedIdeas, text.slice(0, 120));
  c.decisions.push({ text: text.slice(0, 160), at: new Date().toISOString() });
  if (c.decisions.length > 24) c.decisions = c.decisions.slice(-24);
  c.updatedAt = new Date().toISOString();
  return c;
}

/** Render agreed context as a compact block for build requests + discussion prompts. */
export function renderAgreedContext(c) {
  if (!c) return '';
  const parts = [];
  if (c.product) parts.push(`product: ${c.product}`);
  if (c.purpose) parts.push(`purpose: ${c.purpose}`);
  if (c.visualDirection?.length) parts.push(`visual: ${c.visualDirection.join(', ')}`);
  if (c.acceptedIdeas?.length) parts.push(`accepted: ${c.acceptedIdeas.slice(-6).join(' | ')}`);
  if (c.rejectedIdeas?.length) parts.push(`REJECTED (must not build): ${c.rejectedIdeas.slice(-6).join(' | ')}`);
  if (c.typography?.length) parts.push(`typography: ${c.typography.slice(-3).join(' | ')}`);
  if (c.color?.length) parts.push(`color: ${c.color.slice(-3).join(' | ')}`);
  if (c.motion?.length) parts.push(`motion: ${c.motion.slice(-3).join(' | ')}`);
  if (c.depth3d?.length) parts.push(`3d: ${c.depth3d.slice(-3).join(' | ')}`);
  if (c.layout?.length) parts.push(`layout: ${c.layout.slice(-3).join(' | ')}`);
  if (c.constraints?.length) parts.push(`constraints: ${c.constraints.join(', ')}`);
  return parts.join('\n');
}

/** Merge the legacy designIntentObj into the agreed context (one-way, lossless). */
export function agreedFromIntent(intentObj, ctx) {
  const c = ctx ?? createAgreedContext();
  const d = intentObj ?? {};
  if (d.product && !c.product) c.product = d.product;
  for (const v of d.visualDirection ?? []) if (!c.visualDirection.includes(v)) c.visualDirection.push(v);
  if (d.motion && !c.motion.length) c.motion.push(`${d.motion} motion`);
  if (d.depth === '3d' && !c.depth3d.length) c.depth3d.push(d.interaction ? `3d (${d.interaction})` : '3d');
  if (d.depth === 'none' && !c.rejectedIdeas.some((x) => /3d/i.test(x))) c.rejectedIdeas.push('3d');
  for (const f of d.features ?? []) if (!c.acceptedIdeas.some((x) => x.includes(f))) c.acceptedIdeas.push(f);
  if (d.tone && !c.visualDirection.includes(d.tone)) c.visualDirection.push(d.tone);
  if (d.responsive && !c.constraints.includes('responsive')) c.constraints.push('responsive');
  for (const x of d.constraints ?? []) if (!c.constraints.includes(x)) c.constraints.push(x);
  return c;
}

/** Agreed decisions folded into the build request so execution sees all context. */
export function applyAgreedToRequest(request, ctx) {
  const block = renderAgreedContext(ctx);
  if (!block) return String(request ?? '');
  return `${String(request ?? '').trim()}\n[agreed design context — implement ALL of this, respect every REJECTED item:\n${block}]`;
}

