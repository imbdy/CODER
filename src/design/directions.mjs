/**
 * Direction library — Artisan's "art director".
 *
 * Ten intentionally distinct directions. Each is a coherent set of decisions (theme,
 * neutrals, accent, type pairing, density, radius, motion, composition bias) plus the
 * rules that preserve its identity and the anti-patterns that would break it. Choosing
 * a direction *before* writing code is what stops output from collapsing into the same
 * generic AI look every time.
 */

export const DIRECTIONS = [
  {
    id: 'editorial-serif',
    name: 'Editorial Serif',
    summary: 'Magazine-grade typography, warm paper substrate, asymmetric layout, generous marginal whitespace.',
    character: ['literary', 'confident', 'quiet', 'timeless'],
    bestFor: ['marketing-site', 'landing-page', 'static-page'],
    taskTypes: ['create-page', 'create-app', 'redesign'],
    keywords: ['editorial', 'magazine', 'portfolio', 'story', 'brand', 'report', 'agency', 'travel', 'culture', 'article', 'blog'],
    theme: 'light',
    neutral: 'warm',
    accent: '#b4532a',
    fonts: {
      sans: '"Inter", system-ui, sans-serif',
      display: '"Instrument Serif", "Iowan Old Style", Georgia, serif',
      mono: '"IBM Plex Mono", ui-monospace, monospace',
    },
    typeScale: 1.333,
    spacingBase: 4,
    density: 'airy',
    radius: 'sharp',
    tracking: { display: '-0.03em', heading: '-0.015em', body: '0' },
    motion: { base: '260ms', slow: '480ms', stagger: '70ms' },
    grid: 'asymmetric 7/5',
    maxWidth: '76rem',
    rules: [
      'Display type does the work: 5xl+ headlines with tight tracking, never a bold sans at default spacing.',
      'Keep prose at 62ch; let headlines break the grid on purpose.',
      '1px hairlines replace card borders and shadows.',
      'At least one image is full-bleed.',
      'Motion is opacity + 8px translation, never bounce.',
    ],
    antiPatterns: ['centered hero with two pill buttons', 'glass cards', 'neon gradients', 'emoji icons'],
  },
  {
    id: 'precision-dark',
    name: 'Precision Dark',
    summary: 'Instrument-panel dark surfaces, monospaced labels, crisp 1px structure, accent used strictly as signal.',
    character: ['technical', 'focused', 'engineered'],
    bestFor: ['product-app', 'component-library', 'web-app'],
    taskTypes: ['create-app', 'create-page', 'enhance'],
    keywords: ['dashboard', 'developer', 'api', 'console', 'analytics', 'tool', 'editor', 'monitoring', 'fintech', 'data', 'admin'],
    theme: 'dark',
    neutral: 'cool',
    accent: '#4f9dff',
    fonts: {
      sans: '"Inter", system-ui, sans-serif',
      display: '"Inter", system-ui, sans-serif',
      mono: '"JetBrains Mono", ui-monospace, monospace',
    },
    typeScale: 1.2,
    spacingBase: 4,
    density: 'compact',
    radius: 'soft',
    tracking: { display: '-0.02em', heading: '-0.01em', body: '0' },
    motion: { base: '180ms', slow: '320ms', stagger: '40ms' },
    grid: '12-col with fixed side rail',
    maxWidth: '88rem',
    rules: [
      'Mono face carries identity: labels, numbers, keys, metadata.',
      'Separate regions with 1px borders and surface tone, not shadows.',
      'Accent marks state (active, positive, focused) and nothing else.',
      'Tables and lists beat cards for dense data.',
      'Numbers are right-aligned with tabular-nums.',
    ],
    antiPatterns: ['glass blur panels', 'rainbow gradients', 'large rounded cards', 'decorative illustration'],
  },
  {
    id: 'soft-product',
    name: 'Soft Product',
    summary: 'Light, friendly and legible: soft surfaces, generous radii, calm accent, disciplined playful motion.',
    character: ['approachable', 'calm', 'useful'],
    bestFor: ['web-app', 'auth-flow', 'component-library'],
    taskTypes: ['create-component', 'create-page', 'create-app'],
    keywords: ['login', 'onboarding', 'form', 'saas', 'signup', 'profile', 'settings', 'friendly', 'consumer', 'subscription'],
    theme: 'light',
    neutral: 'neutral',
    accent: '#3b6df6',
    fonts: {
      sans: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif',
      display: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif',
      mono: '"Space Mono", ui-monospace, monospace',
    },
    typeScale: 1.25,
    spacingBase: 4,
    density: 'comfortable',
    radius: 'round',
    tracking: { display: '-0.02em', heading: '-0.01em', body: '0' },
    motion: { base: '220ms', slow: '380ms', stagger: '55ms', spring: 'cubic-bezier(0.34, 1.4, 0.64, 1)' },
    grid: 'single focal column',
    maxWidth: '68rem',
    rules: [
      'One focal object per screen; everything else recedes in contrast.',
      'Radii come from tokens only — never mixed arbitrarily.',
      'Inputs own every state: rest, hover, focus-visible, invalid, disabled, loading.',
      'Errors state the fix in the same sentence as the problem.',
      'Motion confirms actions (lift, settle), never distracts.',
    ],
    antiPatterns: ['split-screen hero with stock photo', 'shadow on everything', 'excessive iconography'],
  },
  {
    id: 'luxury-minimal',
    name: 'Luxury Minimal',
    summary: 'Ink and bone palette, hairline gold accent, enormous breathing room, one idea per screen.',
    character: ['premium', 'assured', 'quiet-luxury'],
    bestFor: ['landing-page', 'marketing-site', 'auth-flow'],
    taskTypes: ['create-page', 'redesign', 'enhance'],
    keywords: ['premium', 'luxury', 'boutique', 'hotel', 'jewellery', 'wine', 'membership', 'concierge', 'elegant', 'high-end', 'exclusive'],
    theme: 'dark',
    neutral: 'ink',
    accent: '#c9a227',
    fonts: {
      sans: '"Manrope", system-ui, sans-serif',
      display: '"Fraunces", "Instrument Serif", Georgia, serif',
      mono: '"IBM Plex Mono", ui-monospace, monospace',
    },
    typeScale: 1.28,
    spacingBase: 4,
    density: 'airy',
    radius: 'sharp',
    tracking: { display: '-0.02em', heading: '-0.01em', body: '0.01em' },
    motion: { base: '320ms', slow: '620ms', cinematic: '900ms', stagger: '90ms' },
    grid: 'centered column, wide margins',
    maxWidth: '70rem',
    rules: [
      'Whitespace is the primary material: section padding at the top of the scale.',
      'The accent appears at most once per viewport.',
      'Type is either small and precise or large and quiet — never medium and loud.',
      'Images are full-bleed or absent.',
      'Motion is slow, smooth and never bouncy.',
    ],
    antiPatterns: ['multiple accent colours', 'badges and pills', 'busy navigation', 'fast snappy UI motion'],
  },
  {
    id: 'kinetic-bold',
    name: 'Kinetic Bold',
    summary: 'Loud typographic scale, saturated flat blocks, hard edges, motion with attitude.',
    character: ['energetic', 'youthful', 'opinionated'],
    bestFor: ['landing-page', 'marketing-site'],
    taskTypes: ['create-page', 'redesign', 'motion'],
    keywords: ['bold', 'energetic', 'launch', 'festival', 'music', 'sport', 'startup', 'event', 'campaign', 'impactful', 'loud'],
    theme: 'light',
    neutral: 'ink',
    accent: '#ff4d00',
    fonts: {
      sans: '"Space Grotesk", "Inter", system-ui, sans-serif',
      display: '"Space Grotesk", "Inter", system-ui, sans-serif',
      mono: '"Space Mono", ui-monospace, monospace',
    },
    typeScale: 1.4,
    spacingBase: 4,
    density: 'comfortable',
    radius: 'sharp',
    tracking: { display: '-0.04em', heading: '-0.02em', body: '0' },
    motion: { base: '200ms', slow: '400ms', stagger: '45ms' },
    grid: 'broken grid, overlapping blocks',
    maxWidth: '80rem',
    rules: [
      'Headlines are oversized and may bleed off the edge; body copy stays small.',
      'Colour blocks are flat, opaque and few (2-3 maximum).',
      'Marquee or scroll interaction must be justified by content rhythm.',
      'Hover states move elements (translate/scale), not merely recolour them.',
      'With reduced-motion, swap the marquee for a static composition.',
    ],
    antiPatterns: ['soft pastel gradients', 'tiny type', 'decorative blur blobs', 'rounded everything'],
  },
  {
    id: 'swiss-grid',
    name: 'Swiss Grid',
    summary: 'Strict 12-column discipline, neutral surfaces, one signal accent, decoration earns its place.',
    character: ['rational', 'systematic', 'institutional'],
    bestFor: ['web-app', 'marketing-site', 'component-library'],
    taskTypes: ['create-page', 'create-app', 'responsive'],
    keywords: ['grid', 'documentation', 'institution', 'research', 'news', 'archive', 'catalogue', 'structured', 'design-system', 'library'],
    theme: 'light',
    neutral: 'neutral',
    accent: '#d32f2f',
    fonts: {
      sans: '"Inter", "Helvetica Neue", Arial, sans-serif',
      display: '"Inter", "Helvetica Neue", Arial, sans-serif',
      mono: '"IBM Plex Mono", ui-monospace, monospace',
    },
    typeScale: 1.25,
    spacingBase: 8,
    density: 'compact',
    radius: 'sharp',
    tracking: { display: '-0.02em', heading: '-0.01em', body: '0' },
    motion: { base: '150ms', slow: '300ms', stagger: '30ms' },
    grid: '12-col with visible module rhythm',
    maxWidth: '78rem',
    rules: [
      'Everything aligns to the column grid and an 8pt baseline.',
      'Left-align text; centre only genuinely symmetrical statements.',
      'Accent is a signal colour for actions, never decoration.',
      'Lists, definitions and tables are first-class layout citizens.',
      'Motion is functional: reveal, focus, transition. No personality.',
    ],
    antiPatterns: ['free-form asymmetric layout', 'multiple typefaces', 'decorative gradients', 'oversized imagery'],
  },
  {
    id: 'aurora-depth',
    name: 'Aurora Depth',
    summary: 'Restrained atmospheric depth: exactly one luminous field, layered translucency, precise text above it.',
    character: ['cinematic', 'modern', 'atmospheric'],
    bestFor: ['landing-page', 'auth-flow'],
    taskTypes: ['create-page', 'enhance', 'motion', '3d'],
    keywords: ['aurora', 'glow', 'depth', 'cinematic', 'ambient', 'ai', 'crypto', 'space', 'futuristic', 'gradient', 'immersive'],
    theme: 'dark',
    neutral: 'cool',
    accent: '#7c5cff',
    fonts: {
      sans: '"Inter", system-ui, sans-serif',
      display: '"Sora", "Inter", system-ui, sans-serif',
      mono: '"JetBrains Mono", ui-monospace, monospace',
    },
    typeScale: 1.26,
    spacingBase: 4,
    density: 'comfortable',
    radius: 'soft',
    tracking: { display: '-0.025em', heading: '-0.01em', body: '0' },
    motion: { base: '240ms', slow: '520ms', cinematic: '900ms', stagger: '70ms' },
    grid: 'centred stage with layered depth',
    maxWidth: '72rem',
    rules: [
      'EXACTLY ONE atmospheric effect: one gradient field, blurred form or canvas - never three.',
      'Grain/noise at 2-4% opacity to remove banding, not to look trendy.',
      'Foreground text sits on a real surface or scrim, never bare on the glow.',
      'Vignette the edges so the focal point is unambiguous.',
      'Animate the atmosphere extremely slowly (>20s loop) or not at all.',
    ],
    antiPatterns: ['rainbow mesh gradients', 'glass cards everywhere', 'glowing borders on every element', 'blur that obscures content'],
  },
  {
    id: 'terminal-mono',
    name: 'Terminal Mono',
    summary: 'Developer-native: monospace voice, dark substrate, keycap affordances, density as aesthetic.',
    character: ['precise', 'no-nonsense', 'insider'],
    bestFor: ['product-app', 'component-library', 'static-page'],
    taskTypes: ['create-app', 'create-page'],
    keywords: ['cli', 'terminal', 'developer', 'code', 'docs', 'infrastructure', 'self-hosted', 'open source', 'logs', 'config'],
    theme: 'dark',
    neutral: 'ink',
    accent: '#3ddc84',
    fonts: {
      sans: '"IBM Plex Mono", ui-monospace, monospace',
      display: '"IBM Plex Mono", ui-monospace, monospace',
      mono: '"IBM Plex Mono", ui-monospace, monospace',
    },
    typeScale: 1.18,
    spacingBase: 4,
    density: 'compact',
    radius: 'sharp',
    tracking: { display: '-0.01em', heading: '0', body: '0' },
    motion: { base: '120ms', slow: '260ms', stagger: '25ms' },
    grid: 'terminal window / two-pane',
    maxWidth: '84rem',
    rules: [
      'Everything is monospace and left-aligned; hierarchy comes from colour and case.',
      'Bracket, caret and border characters are real affordances.',
      'Keyboard-first: visible focus rings, shortcut hints, command hints.',
      'No photography; diagrams are structural, not illustrative.',
      'Motion is instant feedback only (blink, type-on, cursor).',
    ],
    antiPatterns: ['hero photography', 'serif display type', 'rounded pill buttons', 'soft shadows'],
  },
  {
    id: 'humanist-airy',
    name: 'Humanist Airy',
    summary: 'Warm white space, humanist sans, soft natural colour, generous rhythm - for content people actually read.',
    character: ['warm', 'trustworthy', 'unhurried'],
    bestFor: ['marketing-site', 'static-page', 'web-app'],
    taskTypes: ['create-page', 'enhance', 'responsive'],
    keywords: ['health', 'education', 'nonprofit', 'wellness', 'clinic', 'community', 'food', 'accessible', 'care', 'school'],
    theme: 'light',
    neutral: 'warm',
    accent: '#2f7d6f',
    fonts: {
      sans: '"Outfit", "Inter", system-ui, sans-serif',
      display: '"Fraunces", Georgia, serif',
      mono: '"IBM Plex Mono", ui-monospace, monospace',
    },
    typeScale: 1.22,
    spacingBase: 4,
    density: 'airy',
    radius: 'round',
    tracking: { display: '-0.015em', heading: '-0.01em', body: '0' },
    motion: { base: '260ms', slow: '460ms', stagger: '65ms' },
    grid: 'two columns with margin notes',
    maxWidth: '74rem',
    rules: [
      'Body text is 17-18px with 1.65 line-height; readability outranks compactness.',
      'Secondary colour is derived from the accent by mixing, never a second hue.',
      'Cards have one job each; never nest cards.',
      'Imagery is warm and human, never stock-generic.',
      'Motion eases content in; nothing flashes or bounces.',
    ],
    antiPatterns: ['aggressive contrast', 'neon accents', 'dense data chrome', 'all-caps paragraphs'],
  },
  {
    id: 'boutique-craft',
    name: 'Boutique Craft',
    summary: 'Tactile product storytelling: warm neutrals, crafted detail, real materials, considered micro-interactions.',
    character: ['artisanal', 'considered', 'specific'],
    bestFor: ['landing-page', 'marketing-site'],
    taskTypes: ['create-page', 'create-component', 'enhance'],
    keywords: ['coffee', 'craft', 'handmade', 'furniture', 'skincare', 'restaurant', 'bakery', 'ceramics', 'product', 'shop', 'artisan'],
    theme: 'light',
    neutral: 'warm',
    accent: '#7a4b2a',
    fonts: {
      sans: '"DM Sans", "Inter", system-ui, sans-serif',
      display: '"Libre Baskerville", Georgia, serif',
      mono: '"IBM Plex Mono", ui-monospace, monospace',
    },
    typeScale: 1.3,
    spacingBase: 4,
    density: 'comfortable',
    radius: 'soft',
    tracking: { display: '-0.02em', heading: '-0.01em', body: '0' },
    motion: { base: '240ms', slow: '500ms', stagger: '60ms' },
    grid: 'product-led asymmetric pairs',
    maxWidth: '72rem',
    rules: [
      'Show the subject large and real; no abstract filler.',
      'Texture (paper/grain/cloth) at low opacity, never glossy.',
      'Detail copy is specific ("single origin, washed, 1400m"), never "quality you can trust".',
      'Hover reveals provenance (material, origin, maker).',
      'Palette comes from the subject, not from a trend.',
    ],
    antiPatterns: ['tech-blue gradients', 'emoji as icons', 'generic stock people', 'identical pricing cards'],
  },
];

export function directionById(id) {
  return DIRECTIONS.find((direction) => direction.id === id);
}

/**
 * Score every direction against the request + the workspace.
 * @returns {Array<{direction: object, score: number, reasons: string[]}>} ranked
 */
export function rankDirections({ request = '', taskType = 'create-page', inspection = {}, limit = 4 } = {}) {
  const haystack = String(request).toLowerCase();
  const kind = inspection?.projectKind ?? 'web-app';
  const existing = inspection?.design ?? {};

  const ranked = DIRECTIONS.map((direction) => {
    const reasons = [];
    let score = 0;

    for (const keyword of direction.keywords) {
      if (haystack.includes(keyword)) {
        score += 4;
        reasons.push(`request mentions "${keyword}"`);
      }
    }
    if (direction.bestFor.includes(kind)) { score += 3; reasons.push(`fits project kind "${kind}"`); }
    if (direction.taskTypes.includes(taskType)) { score += 1.5; reasons.push(`supports task "${taskType}"`); }

    // Respect what already exists rather than fighting it.
    if (existing?.darkMode === 'dark' && direction.theme === 'light') { score -= 1.5; reasons.push('existing theme is dark'); }
    if (existing?.darkMode === 'light' && direction.theme === 'dark') { score -= 1.5; reasons.push('existing theme is light'); }
    if (existing?.accent && direction.accent && String(existing.accent).toLowerCase() === direction.accent.toLowerCase()) {
      score += 1;
      reasons.push('matches existing accent');
    }
    if (inspection?.libraries?.includes('three') && direction.id === 'aurora-depth') {
      score += 2;
      reasons.push('workspace already uses three.js');
    }
    // Continuity wins on enhancement work: whatever is already established is the anchor.
    if (taskType === 'enhance' || taskType === 'responsive' || taskType === 'motion') score += 0.5;
    // Memory anchor: a previous run in this workspace fixed the design language;
    // enhancement work must respect it instead of re-inventing the look.
    if (inspection?.memory?.designLanguage?.direction === direction.id
      && ['enhance', 'responsive', 'motion', '3d'].includes(taskType)) {
      score += 4;
      reasons.push('continuity with previous run');
    }

    return { direction, score: Number(score.toFixed(2)), reasons };
  });

  ranked.sort((a, b) => b.score - a.score || a.direction.id.localeCompare(b.direction.id));
  return ranked.slice(0, limit);
}

/* ------------------------------------------------- colour from request ---- */

const COLOR_WORDS = {
  red: '#d0342c', crimson: '#b91c1c', blue: '#2563eb', navy: '#1e3a8a', green: '#15803d',
  emerald: '#047857', teal: '#0f766e', cyan: '#0891b2', purple: '#7c3aed', violet: '#7c3aed',
  indigo: '#4f46e5', orange: '#ea580c', amber: '#d97706', yellow: '#ca8a04', gold: '#c9a227',
  pink: '#db2777', rose: '#e11d48', magenta: '#c026d3', brown: '#7a4b2a', black: '#111114',
  white: '#fafafa', charcoal: '#2b2b30', mint: '#2f7d6f', lavender: '#8b7fd6',
};

/** A colour the user explicitly asked for ("red button", "#4f46e5") wins over the direction's accent. */
export function colorIntentFromRequest(request = '') {
  const text = String(request ?? '').toLowerCase();
  const hex = text.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/);
  if (hex) return hex[0].length === 4 ? `#${hex[0].slice(1).split('').map((c) => c + c).join('')}` : hex[0];
  for (const [word, value] of Object.entries(COLOR_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return value;
  }
  return undefined;
}

/** Clone the direction with the requested accent pinned, so tokens + emitters follow it. */
export function applyColorIntent(direction, request = '') {
  const accent = colorIntentFromRequest(request);
  if (!accent) return { direction, accent: undefined, note: undefined };
  return {
    direction: { ...direction, accent },
    accent,
    note: `accent pinned to ${accent} because the request names a colour`,
  };
}

/**
 * Pick a direction. With an LLM available the agent *chooses* among the top
 * candidates (a genuinely high-leverage, tiny call). Without one, it still decides —
 * deterministically from the ranking.
 */
export async function chooseDirection({ request, taskType, inspection, router, bus, logger } = {}) {
  const candidates = rankDirections({ request, taskType, inspection, limit: 3 });
  const fallback = candidates[0];

  if (!router || !candidates.length) return { chosen: fallback.direction, candidates, method: 'ranking', reasons: fallback.reasons };

  const prompt = [
    'Pick the single best visual direction for this request. Reply with JSON: {"id": string, "why": string}.',
    '',
    `REQUEST: ${request}`,
    `TASK TYPE: ${taskType}`,
    `PROJECT KIND: ${inspection?.projectKind}`,
    `EXISTING: theme=${inspection?.design?.darkMode ?? 'n/a'} accent=${inspection?.design?.accent ?? 'n/a'} fonts=${(inspection?.design?.fontStack ?? []).map((f) => f.value).join(', ') || 'n/a'}`,
    '',
    'CANDIDATES:',
    ...candidates.map((candidate) => `- ${candidate.direction.id}: ${candidate.direction.summary} (character: ${candidate.direction.character.join(', ')})`),
    '',
    'Choose the candidate whose character best serves the request. Do not invent a new id.',
  ].join('\n');

  try {
    const result = await router.json(prompt, {
      kind: 'direction',
      payload: { request, taskType },
      phase: 'direction',
      maxTokens: 160,
      temperature: 0.2,
      validate: (value) => typeof value?.id === 'string',
    });
    const matched = candidates.find((candidate) => candidate.direction.id === String(result.value.id).trim());
    if (matched) {
      bus?.emit('decision', { kind: 'direction', choice: matched.direction.id, via: result.provider, why: result.value.why });
      return {
        chosen: matched.direction,
        candidates,
        method: result.provider === 'deterministic' ? 'heuristic' : `model:${result.provider}`,
        reasons: [...matched.reasons, result.value.why].filter(Boolean),
      };
    }
    logger?.debug('direction choice not in candidates; using ranking', { got: result.value.id });
  } catch (error) {
    logger?.debug('direction choice failed; using ranking', { error: String(error?.message ?? error) });
  }

  return { chosen: fallback.direction, candidates, method: 'ranking', reasons: fallback.reasons };
}

/** Prompt-ready description of a direction (used by planners and code generation). */
export function describeDirection(direction) {
  return [
    `${direction.name} (${direction.id}) — ${direction.summary}`,
    `Character: ${direction.character.join(', ')}`,
    `Rules:`,
    ...direction.rules.map((rule) => `- ${rule}`),
    `Never: ${direction.antiPatterns.join('; ')}`,
  ].join('\n');
}