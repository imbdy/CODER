/**
 * Art direction — the taste layer.
 *
 * A brief becomes ONE specific visual identity: substrate, type voice, palette,
 * hero composition, decoration budget and a single signature move. Every later
 * decision (tokens, CSS, markup, copy voice) is derived from it, so output reads
 * as a deliberate identity rather than a template with a different accent.
 *
 * Rules encoded here (see skills/art-direction, skills/type-pairing,
 * skills/color-systems, skills/materiality):
 *   - no commodity identity faces (Inter/Roboto/Open Sans/Lato/Arial)
 *   - dominant substrate + ONE signal accent, never an even rainbow
 *   - muted text is contrast-checked to 4.5:1 against its own substrate
 *   - the hero is never a centered stack with two pill buttons
 *   - decoration has a budget (max 2 layers) and each layer states its purpose
 *   - exactly one signature move per identity, and it is allowed to be risky
 */

import { adjust, contrastRatio, ensureContrast, mix, withAlpha } from './color.mjs';
import { ambitionRegister } from '../agent/prompts.mjs';
import { negativeText } from './negation.mjs';

/* ------------------------------------------------------------ directions ---- */

export const ART_DIRECTIONS = [
  {
    id: 'midnight-editorial',
    name: 'Midnight Editorial',
    sentence: 'An ink-black editorial stage where one italic serif headline carries the page and depth comes from layered scrims, not decoration.',
    mood: ['premium', 'cinematic', 'editorial', 'immersive', 'quiet', 'dramatic', 'elegant', 'storytelling'],
    domains: ['software', 'developer tool', 'ai', 'studio', 'media', 'finance'],
    theme: 'dark',
    substrate: { bg: '#0b0b0d', surface: '#131316', surfaceAlt: '#191a1e', text: '#f2ece2' },
    accent: '#e0a458',
    fonts: {
      display: '"Instrument Serif", "Iowan Old Style", Georgia, serif',
      text: '"Familjen Grotesk", ui-sans-serif, system-ui, sans-serif',
      mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
      google: ['Instrument+Serif:ital@0;1', 'Familjen+Grotesk:wght@400;500;600', 'JetBrains+Mono:wght@400;500'],
      displayWeight: 400,
      italicAccent: true,
      tracking: { display: '-0.022em', heading: '-0.015em', body: '0', caps: '0.14em' },
      displayScale: [2.9, 6.2, 5.4],
    },
    composition: 'editorial-split',
    rhythm: 'airy',
    radius: 'sharp',
    decoration: ['grain', 'scrim'],
    signature: 'one italic word inside the headline, set in the display serif',
    voice: 'editorial',
    motion: { base: '260ms', slow: '620ms', stagger: '70ms', ease: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    risk: 'the headline fills the left column at display scale and the italic word breaks the measure',
  },
  {
    id: 'cinema-noir',
    name: 'Cinema Noir',
    sentence: 'A near-black frame with grotesque display type at weight extremes, film grain and a single acid accent used like a light source.',
    mood: ['cinematic', 'immersive', 'dramatic', 'bold', 'futuristic', 'premium', 'dark', 'technical'],
    domains: ['ai', 'developer tool', 'software', 'agency', 'product', 'game'],
    theme: 'dark',
    substrate: { bg: '#08090a', surface: '#101113', surfaceAlt: '#16181a', text: '#ece7df' },
    accent: '#d7f75b',
    fonts: {
      display: '"Bricolage Grotesque", "Archivo", system-ui, sans-serif',
      text: '"Archivo", ui-sans-serif, system-ui, sans-serif',
      mono: '"JetBrains Mono", ui-monospace, monospace',
      google: ['Bricolage+Grotesque:opsz,wght@12..96,200..800', 'Archivo:wght@400;500;600', 'JetBrains+Mono:wght@400'],
      displayWeight: 800,
      italicAccent: false,
      tracking: { display: '-0.04em', heading: '-0.025em', body: '0', caps: '0.16em' },
      displayScale: [3.1, 7.6, 6.6],
    },
    composition: 'oversized-type',
    rhythm: 'tight',
    radius: 'sharp',
    decoration: ['grain', 'vignette'],
    signature: 'display type oversized until it breaks the right edge of the viewport',
    voice: 'severe',
    motion: { base: '220ms', slow: '560ms', stagger: '60ms', ease: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    risk: 'an acid-lime accent on near-black, used only for the primary action and one rule',
  },
  {
    id: 'archival-technical',
    name: 'Archival Technical',
    sentence: 'A bone-paper document: hairline rules, monospaced margin labels, a serif text face and one vermilion mark.',
    mood: ['technical', 'editorial', 'precise', 'archival', 'quiet', 'clean', 'minimal', 'trustworthy'],
    domains: ['developer tool', 'software', 'research', 'documentation', 'finance', 'hardware'],
    theme: 'light',
    substrate: { bg: '#f4f1ea', surface: '#ffffff', surfaceAlt: '#ece8de', text: '#17150f' },
    accent: '#bc3f1f',
    fonts: {
      display: '"Newsreader", "Iowan Old Style", Georgia, serif',
      text: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
      mono: '"IBM Plex Mono", ui-monospace, monospace',
      google: ['Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..500', 'IBM+Plex+Sans:wght@400;500;600', 'IBM+Plex+Mono:wght@400;500'],
      displayWeight: 400,
      italicAccent: true,
      tracking: { display: '-0.018em', heading: '-0.012em', body: '0', caps: '0.12em' },
      displayScale: [2.7, 5.8, 5.0],
    },
    composition: 'left-ruled',
    rhythm: 'airy',
    radius: 'sharp',
    decoration: ['rule', 'grain'],
    signature: 'monospaced margin annotations in a left rail, aligned to the baseline grid',
    voice: 'technical',
    motion: { base: '200ms', slow: '460ms', stagger: '50ms', ease: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    risk: 'no imagery at all — structure and type do the whole job',
  },
  {
    id: 'atelier-quiet',
    name: 'Atelier Quiet',
    sentence: 'Warm paper, enormous whitespace, a high-contrast serif display and small-caps labels; restraint is the statement.',
    mood: ['luxury', 'quiet', 'calm', 'minimal', 'elegant', 'premium', 'warm', 'refined'],
    domains: ['studio', 'brand', 'hospitality', 'fashion', 'portfolio', 'product'],
    theme: 'light',
    substrate: { bg: '#f8f6f2', surface: '#ffffff', surfaceAlt: '#efebe4', text: '#1b1a17' },
    accent: '#4f5d2f',
    fonts: {
      display: '"DM Serif Display", "Iowan Old Style", Georgia, serif',
      text: '"Familjen Grotesk", ui-sans-serif, system-ui, sans-serif',
      mono: '"IBM Plex Mono", ui-monospace, monospace',
      google: ['DM+Serif+Display:ital@0;1', 'Familjen+Grotesk:wght@400;500', 'IBM+Plex+Mono:wght@400'],
      displayWeight: 400,
      italicAccent: true,
      tracking: { display: '-0.015em', heading: '-0.01em', body: '0', caps: '0.18em' },
      displayScale: [2.6, 5.4, 4.8],
    },
    composition: 'offset-figure',
    rhythm: 'airy',
    radius: 'soft',
    decoration: ['rule'],
    signature: 'a single full-bleed figure that overlaps the type column by one grid unit',
    voice: 'warm',
    motion: { base: '280ms', slow: '680ms', stagger: '80ms', ease: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    risk: 'sections separated by whitespace alone — no cards, no borders, no shadows',
  },
  {
    id: 'press-brutal',
    name: 'Press Brutal',
    sentence: 'Newsprint energy: a 900-weight serif shouting at the top, thick rules, clipped corners and a tomato accent.',
    mood: ['bold', 'editorial', 'loud', 'brutalist', 'confident', 'playful', 'energetic'],
    domains: ['media', 'agency', 'event', 'community', 'brand', 'product'],
    theme: 'light',
    substrate: { bg: '#fbf7ef', surface: '#ffffff', surfaceAlt: '#f0eadd', text: '#141210' },
    accent: '#d8341f',
    fonts: {
      display: '"Fraunces", "Iowan Old Style", Georgia, serif',
      text: '"Archivo", ui-sans-serif, system-ui, sans-serif',
      mono: '"IBM Plex Mono", ui-monospace, monospace',
      google: ['Fraunces:ital,opsz,wght@0,9..144,600..900;1,9..144,600..900', 'Archivo:wght@400;500;700', 'IBM+Plex+Mono:wght@400'],
      displayWeight: 900,
      italicAccent: true,
      tracking: { display: '-0.035em', heading: '-0.02em', body: '0', caps: '0.1em' },
      displayScale: [3.0, 7.2, 6.4],
    },
    composition: 'fullbleed-type',
    rhythm: 'tight',
    radius: 'clipped',
    decoration: ['rule'],
    signature: 'a 3px rule under the masthead and clipped corners on every interactive surface',
    voice: 'direct',
    motion: { base: '180ms', slow: '420ms', stagger: '45ms', ease: 'cubic-bezier(0.2, 0.9, 0.1, 1)' },
    risk: 'the headline set at 900 weight, filling the full measure edge to edge',
  },
  {
    id: 'instrument-precision',
    name: 'Instrument Precision',
    sentence: 'A cool instrument panel: monospaced labels, tabular figures, 1px structure and a blue accent that only ever marks state.',
    mood: ['technical', 'precise', 'dark', 'clean', 'engineered', 'data', 'dashboard'],
    domains: ['developer tool', 'dashboard', 'analytics', 'infrastructure', 'fintech', 'monitoring'],
    theme: 'dark',
    substrate: { bg: '#0c0e11', surface: '#13161b', surfaceAlt: '#191d24', text: '#e8edf4' },
    accent: '#5aa2ff',
    fonts: {
      display: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
      text: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
      mono: '"IBM Plex Mono", ui-monospace, monospace',
      google: ['Space+Grotesk:wght@400;500;700', 'IBM+Plex+Mono:wght@400;500'],
      displayWeight: 700,
      italicAccent: false,
      tracking: { display: '-0.03em', heading: '-0.02em', body: '0', caps: '0.14em' },
      displayScale: [2.6, 6.0, 5.2],
    },
    composition: 'left-ruled',
    rhythm: 'compact',
    radius: 'soft',
    decoration: ['rule'],
    signature: 'a live-looking data strip of tabular figures directly under the headline',
    voice: 'technical',
    motion: { base: '160ms', slow: '380ms', stagger: '40ms', ease: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    risk: 'almost no colour: one blue, used only for state and the primary action',
  },
  {
    id: 'kinetic-syne',
    name: 'Kinetic Syne',
    sentence: 'Charged dark surface, wide geometric display type, a coral accent and one marquee that keeps the page moving.',
    mood: ['playful', 'energetic', 'kinetic', 'bold', 'futuristic', 'youthful', 'immersive'],
    domains: ['product', 'community', 'event', 'game', 'music', 'agency'],
    theme: 'dark',
    substrate: { bg: '#101014', surface: '#181820', surfaceAlt: '#1f1f28', text: '#f4f2ee' },
    accent: '#ff5c39',
    fonts: {
      display: '"Syne", ui-sans-serif, system-ui, sans-serif',
      text: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
      mono: '"JetBrains Mono", ui-monospace, monospace',
      google: ['Syne:wght@600;700;800', 'Space+Grotesk:wght@400;500', 'JetBrains+Mono:wght@400'],
      displayWeight: 800,
      italicAccent: false,
      tracking: { display: '-0.03em', heading: '-0.02em', body: '0', caps: '0.14em' },
      displayScale: [2.8, 6.4, 5.6],
    },
    composition: 'layered-scrim',
    rhythm: 'tight',
    radius: 'round',
    decoration: ['scrim', 'grain'],
    signature: 'a single slow marquee rule of product claims under the hero',
    voice: 'direct',
    motion: { base: '200ms', slow: '520ms', stagger: '55ms', ease: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    risk: 'coral against near-black at full saturation, used for one surface only',
  },
  {
    id: 'library-serif',
    name: 'Library Serif',
    sentence: 'A printed page: Baskerville text at reading measure, deep brick accent, footnote rules and no decoration at all.',
    mood: ['literary', 'classic', 'editorial', 'quiet', 'trustworthy', 'calm', 'warm'],
    domains: ['publishing', 'education', 'research', 'nonprofit', 'portfolio', 'writing'],
    theme: 'light',
    substrate: { bg: '#faf8f3', surface: '#ffffff', surfaceAlt: '#f1ede4', text: '#1c1917' },
    accent: '#8c2f19',
    fonts: {
      display: '"Libre Baskerville", Georgia, serif',
      text: '"Chivo", ui-sans-serif, system-ui, sans-serif',
      mono: '"IBM Plex Mono", ui-monospace, monospace',
      google: ['Libre+Baskerville:ital,wght@0,400;0,700;1,400', 'Chivo:wght@400;500;600', 'IBM+Plex+Mono:wght@400'],
      displayWeight: 700,
      italicAccent: true,
      tracking: { display: '-0.012em', heading: '-0.008em', body: '0', caps: '0.1em' },
      displayScale: [2.5, 5.6, 4.8],
    },
    composition: 'editorial-split',
    rhythm: 'airy',
    radius: 'sharp',
    decoration: ['rule'],
    signature: 'footnote-style annotations under each claim, numbered in the mono face',
    voice: 'editorial',
    motion: { base: '220ms', slow: '480ms', stagger: '55ms', ease: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    risk: 'a text-only hero: no figure, no panel, nothing but type and a rule',
  },
];

export const COMPOSITIONS = ['editorial-split', 'oversized-type', 'fullbleed-type', 'offset-figure', 'left-ruled', 'layered-scrim'];

export function artDirectionById(id) { return ART_DIRECTIONS.find((d) => d.id === id); }

/* --------------------------------------------------------------- choosing ---- */

const THEME_HINTS = { dark: /\b(dark|night|black|noir|midnight|moody)\b/i, light: /\b(light|bright|paper|white|airy|day)\b/i };
const SAAS_REJECTION = /(generic|typical|usual|standard).{0,24}(ai|saas|startup|template)|ai saas|saas landing|purple|glass|gradient|blob|orb/i;

/**
 * Score every direction against the brief and the agreed decisions.
 * @param {{request?: string, agreed?: object, inspection?: object, taskType?: string}} input
 */
export function chooseArtDirection({ request = '', agreed = {}, inspection = {}, taskType = 'create-page', lockedId } = {}) {
  const visual = [...(agreed.visual ?? agreed.visualDirection ?? [])].map((v) => String(v).toLowerCase());
  const avoid = [...(agreed.avoid ?? agreed.rejected ?? [])].map((v) => String(v).toLowerCase());
  const emphasis = [...(agreed.emphasis ?? agreed.accepted ?? [])].map((v) => String(v).toLowerCase());
  // An identity, once built, is the project's identity: a refinement must not
  // swap a dark editorial page for a light archival one behind the user's back.
  const locked = lockedId ? artDirectionById(lockedId) : undefined;
  if (locked) {
    return { direction: locked, score: Infinity, reasons: [`continuity: ${locked.name} is the identity this project was built with`], alternatives: [], locked: true };
  }
  // Positive-only text for positive signals: "no dark mode" must never read as a
  // request for a dark substrate.
  const NEGATIVE = /\b(no|not|never|without|avoid|don'?t|do not|instead of|rather than)\b/i;
  // A composed brief carries a rendered context block whose own labels
  // ("REJECTED (must NOT do): dark mode") would otherwise read as a request for
  // exactly what the user ruled out. Those lines are avoid-signal, never wants.
  const REJECTION_LINE = /^\s*(REJECTED|Avoid|Constraints|Pending change requests)\b/i;
  const lines = String(request).split(/\r?\n/);
  const wantLines = lines.filter((line) => !REJECTION_LINE.test(line));
  const rejectLines = lines.filter((line) => REJECTION_LINE.test(line));
  const clausesOf = (text) => text.split(/(?<=[.!?])\s+|\s*[;:—–]\s*/).map((c) => c.trim()).filter(Boolean);
  const positive = wantLines.flatMap(clausesOf).filter((clause) => !NEGATIVE.test(clause)).join(' ');
  const negative = [...wantLines.flatMap(clausesOf).filter((clause) => NEGATIVE.test(clause)), ...rejectLines].join(' | ');
  const hay = `${positive} ${visual.join(' ')} ${emphasis.join(' ')}`.toLowerCase();
  const avoidText = `${avoid.join(' | ')} ${negative}`.toLowerCase();
  const existingTheme = inspection?.design?.darkMode;

  const ranked = ART_DIRECTIONS.map((direction) => {
    const reasons = [];
    let score = 0;
    for (const word of direction.mood) {
      if (visual.includes(word)) { score += 4; reasons.push(`agreed direction "${word}"`); }
      else if (new RegExp(`\\b${word}\\b`, 'i').test(hay)) { score += 2; reasons.push(`brief mentions "${word}"`); }
    }
    for (const domain of direction.domains) if (hay.includes(domain)) { score += 2.5; reasons.push(`fits ${domain}`); }
    if (THEME_HINTS.dark.test(hay) && direction.theme === 'dark') { score += 3; reasons.push('dark substrate requested'); }
    if (THEME_HINTS.light.test(hay) && direction.theme === 'light') { score += 3; reasons.push('light substrate requested'); }
    if (existingTheme && existingTheme === direction.theme) { score += 1.5; reasons.push(`continuity with the existing ${existingTheme} theme`); }
    // Rejections: an identity that looks like the thing the user rejected loses.
    if (SAAS_REJECTION.test(avoidText) && direction.id === 'instrument-precision') { score -= 5; reasons.push('penalised: reads as the AI/SaaS look that was rejected'); }
    if (/\b(loud|shout|brutal|busy)\b/.test(avoidText) && ['press-brutal', 'kinetic-syne'].includes(direction.id)) score -= 4;
    if (/\b(serif|classic|old)\b/.test(avoidText) && ['library-serif', 'atelier-quiet', 'archival-technical'].includes(direction.id)) score -= 3;
    if (/\bdark\b/.test(avoidText) && direction.theme === 'dark') score -= 4;
    if (/\b(light|white|paper)\b/.test(avoidText) && direction.theme === 'light') score -= 4;
    // Typography-led briefs favour identities whose signature is typographic.
    if (/typograph/.test(hay) && ['midnight-editorial', 'cinema-noir', 'press-brutal', 'library-serif', 'archival-technical'].includes(direction.id)) { score += 2; reasons.push('typography-led identity'); }
    return { direction, score: Number(score.toFixed(2)), reasons: reasons.slice(0, 5) };
  }).sort((a, b) => b.score - a.score || a.direction.id.localeCompare(b.direction.id));

  const top = ranked[0];
  return { direction: top.direction, score: top.score, reasons: top.reasons, alternatives: ranked.slice(1, 4).map((r) => ({ id: r.direction.id, score: r.score })) };
}

/* ------------------------------------------------------------- decoration ---- */

/**
 * Decoration budget. Each layer must have a purpose; rejections remove layers.
 * A canvas is only earned when 3D/depth is explicitly wanted and not rejected.
 */
export function decorationFor(direction, { request = '', agreed = {} } = {}) {
  const avoid = [...(agreed.avoid ?? agreed.rejected ?? [])].join(' ').toLowerCase();
  const emphasis = [...(agreed.emphasis ?? agreed.accepted ?? [])].join(' ').toLowerCase();
  const hay = `${request} ${emphasis} ${(agreed.depth3d ?? '')} ${(agreed.motion ?? '')}`.toLowerCase();
  let layers = [...direction.decoration];
  const dropped = [];
  const drop = (name, why) => { if (layers.includes(name)) { layers = layers.filter((l) => l !== name); dropped.push(`${name} (${why})`); } };
  if (/\b(grain|noise|texture)\b/.test(avoid)) drop('grain', 'rejected');
  if (/\b(glass|glassmorph|blur)\b/.test(avoid)) drop('scrim', 'rejected');
  if (/\b(orb|blob|glow|gradient)\b/.test(avoid)) drop('glow', 'rejected');
  if (/\b(minimal|no decoration|nothing decorative|restrained|clean)\b/.test(`${avoid} ${emphasis}`)) layers = layers.slice(0, 1);
  const wants3d = /\b(3d|three\.?js|webgl|spatial|volumetric)\b/.test(hay);
  const depthWanted = wants3d || /\b(depth|immersive|dimensional)\b/.test(hay);
  const rejected3d = /\b(3d|webgl|canvas|three)\b/.test(avoid + ' ' + negativeText(request));
  // A brief that asks for cinema earns the canvas even when it never says
  // the word "webgl", and what it earns is a SUBJECT the camera studies
  // rather than a lattice dimmed to 0.5 behind the type.
  const cinematic = !rejected3d && ambitionRegister(hay) === 'cinematic';
  const canvas = (wants3d || cinematic) && !rejected3d;
  if (depthWanted && !canvas && !layers.includes('scrim') && !layers.includes('vignette')) layers.push('vignette');
  return {
    budget: 2,
    layers: layers.slice(0, 2),
    dropped,
    canvas,
    cinematic,
    canvasReason: cinematic
      ? 'a scroll-driven instrument: one instanced structure the camera studies, a generated environment map, an additive depth field, DPR capped at 2, adaptive quality, paused offscreen, a composed static frame for reduced-motion'
      : canvas
      ? 'a single low-contrast lattice behind the type: one canvas, DPR capped at 1.75, paused offscreen, hidden below 60rem, CSS depth as the fallback'
      : (rejected3d ? '3D was rejected — depth comes from layered value steps and type scale' : (depthWanted ? 'depth via layered scrim and value steps; a canvas would not add meaning here' : 'no depth layer needed')),
  };
}

/* ----------------------------------------------------------------- tokens ---- */

/** Overlay the identity onto a token set, guaranteeing readable muted text. */
export function applyArtDirection(tokens, direction, { decoration } = {}) {
  const s = direction.substrate;
  const theme = direction.theme;
  const accent = direction.accent;
  // Muted / faint text must survive WCAG at body size on EVERY surface it can
  // land on — the substrate and the raised surfaces. Checking only against the
  // page background is what let 4.47:1 text ship on a card.
  const grounds = [s.bg, s.surface, s.surfaceAlt].filter(Boolean);
  const readable = (start, target) => {
    let value = ensureContrast(start, s.bg, target);
    for (let step = 0; step < 24; step += 1) {
      if (grounds.every((ground) => contrastRatio(value, ground) >= target)) break;
      value = adjust(value, { l: theme === 'dark' ? 3 : -3 });
    }
    return value;
  };
  const muted = readable(mix(s.text, s.bg, theme === 'dark' ? 0.34 : 0.38), 4.6);
  const faint = readable(mix(s.text, s.bg, theme === 'dark' ? 0.5 : 0.52), 4.6);
  const [min, vw, max] = direction.fonts.displayScale ?? [2.8, 7, 6];
  const out = {
    ...tokens,
    theme,
    direction: direction.id,
    artDirection: direction.id,
    accent,
    accentHover: theme === 'dark' ? adjust(accent, { l: 8, s: 2 }) : adjust(accent, { l: -8 }),
    accentQuiet: theme === 'dark' ? adjust(accent, { l: -18, s: -12 }) : adjust(accent, { l: 24, s: -14 }),
    accentSoft: withAlpha(accent, theme === 'dark' ? 0.16 : 0.12),
    accentReadableOnBg: ensureContrast(accent, s.bg, 4.5),
    surfaces: {
      bg: s.bg,
      surface: s.surface,
      surfaceAlt: s.surfaceAlt,
      text: s.text,
      textMuted: muted,
      textFaint: faint,
      border: withAlpha(theme === 'dark' ? '#ffffff' : '#000000', theme === 'dark' ? 0.12 : 0.14),
      borderStrong: withAlpha(theme === 'dark' ? '#ffffff' : '#000000', theme === 'dark' ? 0.26 : 0.3),
    },
    text: {
      primary: s.text,
      secondary: muted,
      tertiary: faint,
      onAccent: contrastRatio('#ffffff', accent) >= 4.5 ? '#ffffff' : ensureContrast('#0b0b0c', accent, 4.5),
    },
    border: withAlpha(theme === 'dark' ? '#ffffff' : '#000000', theme === 'dark' ? 0.12 : 0.14),
    borderStrong: withAlpha(theme === 'dark' ? '#ffffff' : '#000000', theme === 'dark' ? 0.26 : 0.3),
    fonts: { sans: direction.fonts.text, display: direction.fonts.display, mono: direction.fonts.mono },
    tracking: { ...(tokens.tracking ?? {}), ...direction.fonts.tracking },
    fontSizes: {
      // Nothing readable goes below 12.8px: a 1.333 ratio pushes the xs step to
      // 9px, which the rendered QA (correctly) reports as unreadable.
      ...Object.fromEntries(Object.entries(tokens.fontSizes ?? {}).map(([key, value]) => {
        const rem = /^([\d.]+)rem$/.exec(String(value));
        return [key, rem && Number(rem[1]) < 0.8 ? '0.8rem' : value];
      })),
      display: `clamp(${min}rem, ${vw}vw, ${max}rem)`,
      h2: `clamp(1.9rem, 3.4vw, 2.9rem)`,
      h3: `clamp(1.12rem, 1.5vw, 1.35rem)`,
      base: '1rem',
      lede: 'clamp(1.06rem, 1.35vw, 1.3rem)',
      small: '0.875rem',
      label: '0.8rem',
    },
    motion: {
      ...tokens.motion,
      base: direction.motion.base,
      slow: direction.motion.slow,
      stagger: direction.motion.stagger,
      emphasized: direction.motion.ease,
      entrance: direction.motion.ease,
      standard: direction.motion.ease,
    },
    displayWeight: direction.fonts.displayWeight,
    decoration: decoration ?? decorationFor(direction),
    diagnostics: {
      ...(tokens.diagnostics ?? {}),
      artDirection: direction.id,
      theme,
      contrastTextOnBg: Number(contrastRatio(s.text, s.bg).toFixed(2)),
      contrastMutedOnBg: Number(contrastRatio(muted, s.bg).toFixed(2)),
      contrastMutedOnSurface: Number(Math.min(...grounds.map((g) => contrastRatio(muted, g))).toFixed(2)),
      contrastFaintOnBg: Number(contrastRatio(faint, s.bg).toFixed(2)),
      contrastFaintOnSurface: Number(Math.min(...grounds.map((g) => contrastRatio(faint, g))).toFixed(2)),
      contrastAccentOnBg: Number(contrastRatio(accent, s.bg).toFixed(2)),
      passAA: [s.text, muted, faint].every((color) => grounds.every((ground) => contrastRatio(color, ground) >= 4.5)),
    },
  };
  return out;
}

export function fontsHrefFor(direction) {
  const families = (direction.fonts.google ?? []).map((f) => `family=${f}`).join('&');
  return families ? `https://fonts.googleapis.com/css2?${families}&display=swap` : '';
}

/** Prompt/spec-ready description of the identity. */
export function artDirectionBlock(direction, decoration = decorationFor(direction)) {
  return [
    `ART DIRECTION — ${direction.name} (${direction.id})`,
    direction.sentence,
    `substrate: ${direction.theme} — bg ${direction.substrate.bg}, surface ${direction.substrate.surface}, text ${direction.substrate.text}`,
    `accent: ${direction.accent} (signal only: primary action, one rule, state)`,
    `type: display ${direction.fonts.display.split(',')[0]} ${direction.fonts.displayWeight}${direction.fonts.italicAccent ? ' (italic available for accent words)' : ''} at clamp(${(direction.fonts.displayScale ?? [])[0]}rem, ${(direction.fonts.displayScale ?? [])[1]}vw, ${(direction.fonts.displayScale ?? [])[2]}rem); text ${direction.fonts.text.split(',')[0]}; mono ${direction.fonts.mono.split(',')[0]}`,
    `tracking: display ${direction.fonts.tracking.display}, caps ${direction.fonts.tracking.caps}`,
    `hero composition: ${direction.composition} (never a centered stack with two pill buttons)`,
    `rhythm: ${direction.rhythm}; corners: ${direction.radius}`,
    `decoration budget: ${decoration.layers.length}/${decoration.budget} — ${decoration.layers.join(' + ') || 'none'}${decoration.dropped.length ? ` (dropped: ${decoration.dropped.join(', ')})` : ''}`,
    `depth: ${decoration.canvasReason}`,
    `signature move: ${direction.signature}`,
    `justified risk: ${direction.risk}`,
    `copy voice: ${direction.voice}`,
    `motion: ${direction.motion.base} base / ${direction.motion.slow} slow, ease ${direction.motion.ease}, stagger ${direction.motion.stagger}, one easing family`,
  ].join('\n');
}

/* -------------------------------------------------------------- hero CSS ---- */

/** CSS for the chosen composition + decoration layers. Appended to the stylesheet. */
export function emitArtDirectionCss(direction, decoration = decorationFor(direction)) {
  const radius = { sharp: '0px', soft: '10px', round: '999px', clipped: '0px' }[direction.radius] ?? '8px';
  const clip = direction.radius === 'clipped' ? 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))' : 'none';
  const gap = direction.rhythm === 'airy' ? 'clamp(3rem, 7vw, 7rem)' : direction.rhythm === 'compact' ? 'clamp(1.75rem, 3vw, 3rem)' : 'clamp(2.25rem, 4.5vw, 4.5rem)';
  const pad = direction.rhythm === 'airy' ? 'clamp(3.5rem, 8vh, 7rem)' : 'clamp(2.75rem, 6vh, 5rem)';

  const base = `
/* ============================================================
   ${direction.name} — art direction layer
   ${direction.sentence}
   signature: ${direction.signature}
   ============================================================ */
:root {
  --ad-gap: ${gap};
  --ad-pad: ${pad};
  --ad-radius: ${radius};
  --ad-rule: 1px solid var(--color-border);
  --ad-display-weight: ${direction.fonts.displayWeight};
}
body { font-feature-settings: "kern" 1, "liga" 1; }
.ad-shell { width: min(100% - 2.5rem, var(--max-width)); margin-inline: auto; }
@media (max-width: 40rem) { .ad-shell { width: min(100% - 2rem, var(--max-width)); } }

/* --- reveal system: fail-safe. Content is only hidden when JS is alive. --- */
html[data-js] [data-reveal] { opacity: 0; transform: translateY(var(--motion-distance, 14px)); }
html[data-js] [data-reveal].is-in { opacity: 1; transform: none; transition: opacity var(--duration-slow) var(--ease-entrance), transform var(--duration-slow) var(--ease-entrance); transition-delay: var(--reveal-delay, 0ms); }
@media (prefers-reduced-motion: reduce) {
  html[data-js] [data-reveal] { opacity: 1 !important; transform: none !important; transition: none !important; }
}

/* --- hero shell --- */
.hero-ad { position: relative; isolation: isolate; padding-block: var(--ad-pad) calc(var(--ad-pad) * 0.7); overflow: clip; }
.hero-ad__inner { position: relative; z-index: 2; }
.hero-ad__eyebrow { font-family: var(--font-mono); font-size: var(--text-label, 0.76rem); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--color-text-muted); margin: 0 0 clamp(1.25rem, 2.5vw, 2rem); }
.hero-ad__title { font-family: var(--font-display); font-weight: var(--ad-display-weight); font-size: var(--text-display); line-height: ${direction.fonts.displayWeight >= 800 ? '0.92' : '1.0'}; letter-spacing: var(--tracking-display); margin: 0; text-wrap: balance; }
.hero-ad__title em { font-style: italic; ${direction.fonts.italicAccent ? '' : 'font-style: normal; color: var(--color-accent);'} }
.hero-ad__lede { font-size: var(--text-lede, 1.15rem); line-height: 1.55; color: var(--color-text-muted); max-width: 46ch; margin: clamp(1.5rem, 3vw, 2.25rem) 0 0; text-wrap: pretty; }
.hero-ad__actions { display: flex; flex-wrap: wrap; align-items: center; gap: clamp(1rem, 2vw, 1.75rem); margin-top: clamp(2rem, 4vw, 3rem); }
.hero-ad__cta { display: inline-flex; align-items: center; min-height: 48px; padding-inline: 1.65rem; background: var(--color-accent); color: var(--color-on-accent); font-weight: 600; text-decoration: none; border-radius: var(--ad-radius); ${clip !== 'none' ? `clip-path: ${clip};` : ''} transition: transform var(--duration-base) var(--ease-standard), background var(--duration-base) var(--ease-standard); }
.hero-ad__cta:hover { transform: translateY(-2px); background: var(--color-accent-hover); }
.hero-ad__cta:active { transform: translateY(0); }
.hero-ad__link { color: var(--color-text); text-decoration: none; border-bottom: 1px solid var(--color-border-strong); padding-bottom: 2px; min-height: 44px; display: inline-flex; align-items: center; }
.hero-ad__link:hover { border-bottom-color: var(--color-accent); }
.hero-ad__proof { font-family: var(--font-mono); font-size: var(--text-small, 0.875rem); color: var(--color-text-faint); margin: clamp(2rem, 4vw, 3rem) 0 0; }
.hero-ad__figure { position: relative; border: var(--ad-rule); border-radius: var(--ad-radius); background: linear-gradient(160deg, var(--color-surface), var(--color-surface-alt)); min-height: 18rem; display: grid; place-items: center; overflow: hidden; }
.hero-ad__figure::after { content: ""; position: absolute; inset: 0; background: radial-gradient(120% 80% at 20% 0%, ${withAlpha(direction.accent, 0.14)}, transparent 60%); }
.hero-ad__figure-label { position: relative; font-family: var(--font-mono); font-size: var(--text-label, 0.76rem); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--color-text-faint); }
`;

  const compositions = {
    'editorial-split': `
.hero-ad__inner { display: grid; grid-template-columns: 7fr 4fr; gap: var(--ad-gap); align-items: start; }
.hero-ad__aside { border-top: var(--ad-rule); padding-top: 0.85rem; align-self: start; margin-top: clamp(4rem, 9vw, 8rem); }
.hero-ad__aside .hero-ad__rail { display: grid; gap: 0.55rem; font-family: var(--font-mono); font-size: var(--text-label, 0.8rem); letter-spacing: 0.04em; color: var(--color-text-muted); }
.hero-ad__title { max-width: 15ch; }
@media (max-width: 60rem) { .hero-ad__inner { grid-template-columns: 1fr; align-items: start; } .hero-ad__aside { border-left: 0; border-top: var(--ad-rule); padding: 1.5rem 0 0; } }`,
    'oversized-type': `
.hero-ad { padding-inline: 0; }
.hero-ad__inner { display: grid; gap: var(--ad-gap); }
.hero-ad__title { font-size: clamp(3.1rem, 10.5vw, 8.5rem); line-height: 0.88; max-width: none; margin-inline-start: max(1.5rem, calc(50vw - var(--max-width) / 2)); margin-inline-end: -6vw; }
.hero-ad__head { display: grid; }
.hero-ad__tail { width: min(100% - 3rem, var(--max-width)); margin-inline: auto; display: grid; grid-template-columns: 1fr 1fr; gap: var(--ad-gap); align-items: start; }
.hero-ad__eyebrow, .hero-ad__proof { width: min(100% - 3rem, var(--max-width)); margin-inline: auto; }
@media (max-width: 60rem) { .hero-ad__title { font-size: clamp(2.6rem, 13vw, 5rem); margin-inline: 1.25rem; } .hero-ad__tail { grid-template-columns: 1fr; } }`,
    'fullbleed-type': `
.hero-ad__inner { display: grid; gap: clamp(1.5rem, 3vw, 2.5rem); }
.hero-ad__title { font-size: clamp(3rem, 9vw, 7.5rem); line-height: 0.92; max-width: none; }
.hero-ad__rule { height: 3px; background: var(--color-text); border: 0; margin: 0; }
.hero-ad__tail { display: grid; grid-template-columns: 5fr 4fr; gap: var(--ad-gap); align-items: start; }
.hero-ad__lede { max-width: none; }
@media (max-width: 60rem) { .hero-ad__tail { grid-template-columns: 1fr; } .hero-ad__title { font-size: clamp(2.5rem, 12vw, 4.5rem); } }`,
    'offset-figure': `
.hero-ad__inner { display: grid; grid-template-columns: 6fr 6fr; gap: var(--ad-gap); align-items: center; }
.hero-ad__figure { margin-inline-start: clamp(-4rem, -4vw, -1rem); min-height: 24rem; }
.hero-ad__title { max-width: 16ch; }
@media (max-width: 60rem) { .hero-ad__inner { grid-template-columns: 1fr; } .hero-ad__figure { margin-inline-start: 0; min-height: 15rem; } }`,
    'left-ruled': `
.hero-ad__inner { display: grid; grid-template-columns: minmax(7rem, 1fr) minmax(0, 4fr); gap: clamp(1.5rem, 4vw, 3.5rem); }
.hero-ad__rail { border-top: 2px solid var(--color-text); padding-top: 0.75rem; display: grid; gap: 0.5rem; align-content: start; font-family: var(--font-mono); font-size: var(--text-label, 0.76rem); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--color-text-muted); }
.hero-ad__body { border-top: var(--ad-rule); padding-top: 0.75rem; }
.hero-ad__title { max-width: 22ch; }
@media (max-width: 52rem) { .hero-ad__inner { grid-template-columns: 1fr; } .hero-ad__rail { border-top: 2px solid var(--color-text); } }`,
    'layered-scrim': `
.hero-ad { min-height: min(92vh, 48rem); display: grid; align-items: end; }
.hero-ad__inner { display: grid; grid-template-columns: 8fr 4fr; gap: var(--ad-gap); align-items: end; }
.hero-ad__title { max-width: 20ch; }
.hero-ad__scrim { position: absolute; inset: 0; z-index: 1; background: linear-gradient(to top, var(--color-bg) 8%, ${withAlpha(direction.substrate.bg, 0.55)} 45%, transparent 85%); }
@media (max-width: 60rem) { .hero-ad__inner { grid-template-columns: 1fr; } .hero-ad { min-height: auto; } }`,
  };

  const decorationCss = `
/* --- decoration: ${decoration.layers.join(' + ') || 'none'} (budget ${decoration.budget}) --- */
.ad-layer { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
${decoration.layers.includes('grain') ? `.ad-grain { opacity: ${direction.theme === 'dark' ? '0.05' : '0.035'}; mix-blend-mode: ${direction.theme === 'dark' ? 'screen' : 'multiply'}; }
.ad-grain svg { width: 100%; height: 100%; }` : ''}
${decoration.layers.includes('scrim') ? `.ad-scrim { background: linear-gradient(100deg, var(--color-bg) 30%, rgba(0,0,0,0) 62%), radial-gradient(80% 65% at 82% 4%, ${withAlpha(direction.accent, 0.14)}, transparent 62%), linear-gradient(180deg, ${withAlpha(direction.substrate.surfaceAlt, 0.8)}, transparent 55%); }` : ''}
${decoration.layers.includes('vignette') && direction.theme === 'dark' ? `.ad-vignette { background: radial-gradient(120% 100% at 50% 40%, transparent 45%, ${withAlpha('#000000', 0.28)} 100%); }` : ''}
${decoration.layers.includes('vignette') && direction.theme !== 'dark' ? '/* vignette omitted: darkening a paper substrate muddies it */' : ''}
${decoration.layers.includes('rule') ? `.ad-rules { background-image: linear-gradient(to right, var(--color-border) 1px, transparent 1px); background-size: calc(100% / 4) 100%; opacity: 0.55; }
@media (max-width: 60rem) { .ad-rules { background-size: calc(100% / 2) 100%; } }` : ''}
${decoration.canvas ? `.ad-canvas { z-index: 0; }${decoration.cinematic ? `
/* Cinematic: the canvas carries a subject, so it is not dimmed to a wash and it
   is not dropped on small screens — adaptive quality thins it instead. */
.ad-canvas canvas { opacity: 1 !important; }
@media (max-width: 60rem) { .ad-canvas { display: block !important; } }
@media (pointer: coarse) { .ad-canvas canvas { opacity: 0.85 !important; } }` : ''}
.ad-canvas canvas { width: 100% !important; height: 100% !important; display: block; opacity: ${direction.theme === 'dark' ? '0.62' : '0.5'}; }
@media (max-width: 60rem), (pointer: coarse) { .ad-canvas { display: none; } }
@media (prefers-reduced-motion: reduce) { .ad-canvas { display: none; } }` : ''}

/* --- section rhythm --- */
.ad-section { padding-block: var(--ad-pad); position: relative; }
.ad-section + .ad-section { border-top: var(--ad-rule); }
.ad-section__head { display: grid; gap: 0.75rem; margin-bottom: clamp(2rem, 4vw, 3.5rem); max-width: 54ch; }
.ad-section__label { font-family: var(--font-mono); font-size: var(--text-label, 0.8rem); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--color-accent-readable); margin: 0; }
.ad-section__title { font-family: var(--font-display); font-weight: var(--ad-display-weight); font-size: var(--text-h2); line-height: 1.04; letter-spacing: var(--tracking-heading); margin: 0; text-wrap: balance; }

/* ============================================================
   Identity applied to the standard sections.
   The body of the page must belong to the same design as the hero:
   hairline structure instead of card chrome, one rhythm, mono labels.
   ============================================================ */
.section { padding-block: clamp(2.75rem, 6vh, 5rem); }
.section--tight { padding-block: clamp(2rem, 4vh, 3.25rem); }
.container { width: min(100% - 2.5rem, var(--max-width)); margin-inline: auto; }
@media (max-width: 40rem) { .container { width: min(100% - 2rem, var(--max-width)); } }
.section__head { display: grid; gap: 0.6rem; margin-bottom: clamp(1.75rem, 3.5vw, 3rem); max-width: 52ch; }
.section__title { font-family: var(--font-display); font-weight: var(--ad-display-weight); font-size: var(--text-h2); line-height: 1.04; letter-spacing: var(--tracking-heading); text-wrap: balance; }
.section__eyebrow, .proof__label, .footer__col-title { font-family: var(--font-mono); font-size: var(--text-label, 0.8rem); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--color-text-muted); }
.lede { color: var(--color-text-muted); max-width: 62ch; text-wrap: pretty; }

/* features / process: an editorial row of columns divided by hairlines — not cards */
.features--columns, .features--bento, .features--list, .process__steps, .tiers, .quotes {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 0; border-top: var(--ad-rule); list-style: none; padding: 0; margin: 0;
}
.feature, .process__step, .tier, .quote {
  grid-column: auto !important; grid-row: auto !important;
  background: none !important; border: 0; border-radius: 0 !important; box-shadow: none !important;
  border-left: var(--ad-rule); padding: clamp(1.25rem, 2vw, 1.75rem) clamp(1.25rem, 2.5vw, 2.25rem) 0;
  display: grid; gap: 0.5rem; align-content: start;
}
.feature:first-child, .process__step:first-child, .tier:first-child, .quote:first-child { border-left: 0; padding-left: 0; }
.feature h3, .process__step h3, .tier__name { font-family: var(--font-display); font-weight: var(--ad-display-weight); font-size: var(--text-h3, 1.2rem); letter-spacing: var(--tracking-heading); margin: 0; }
.feature__body, .process__step p, .tier__features { color: var(--color-text-muted); margin: 0; }
.tag {
  background: none !important; border: 0 !important; padding: 0 !important; border-radius: 0 !important;
  font-family: var(--font-mono); font-size: var(--text-label, 0.8rem); letter-spacing: 0.06em; color: var(--color-accent-readable);
}
.tier--featured { border-top: 2px solid var(--color-accent); margin-top: -1px; }
.tier__price { font-family: var(--font-display); font-size: clamp(1.9rem, 3vw, 2.6rem); margin: 0; }
.tier__cadence { font-family: var(--font-mono); font-size: var(--text-label, 0.8rem); color: var(--color-text-muted); }
.tier__features { display: grid; gap: 0.35rem; list-style: none; padding: 0; }
.quote__text { font-family: var(--font-display); font-size: clamp(1.15rem, 1.8vw, 1.5rem); line-height: 1.35; margin: 0; }
.quote__by { font-family: var(--font-mono); font-size: var(--text-label, 0.8rem); color: var(--color-text-muted); }
@media (max-width: 52rem) {
  .features--columns, .features--bento, .features--list, .process__steps, .tiers, .quotes { grid-template-columns: 1fr; }
  .feature, .process__step, .tier, .quote { border-left: 0; border-top: var(--ad-rule); padding: 1.25rem 0 0; }
  .feature:first-child, .process__step:first-child, .tier:first-child, .quote:first-child { border-top: 0; padding-top: 0; }
}

/* proof: figures on a rule, no invented customer logos */
.proof { border-top: var(--ad-rule); }
.proof__items { display: flex; flex-wrap: wrap; gap: clamp(1rem, 3vw, 2.5rem); }
.metrics { display: grid !important; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: clamp(1.5rem, 3vw, 3rem); margin-top: clamp(1.5rem, 3vw, 2.5rem) !important; }
.metric__value { font-family: var(--font-display); font-weight: var(--ad-display-weight); font-size: clamp(1.9rem, 3.2vw, 2.9rem); line-height: 1; letter-spacing: var(--tracking-display); }
.metric__label { font-family: var(--font-mono); font-size: var(--text-label, 0.8rem); color: var(--color-text-muted); margin-top: 0.4rem; }

/* closing band: a rule and one action, not a floating card */
.cta__panel {
  background: none !important; border: 0 !important; border-top: 2px solid var(--color-text) !important; border-radius: 0 !important;
  box-shadow: none !important; padding: clamp(1.75rem, 3.5vw, 3rem) 0 0 !important;
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--ad-gap); align-items: end;
}
.cta__title { font-family: var(--font-display); font-weight: var(--ad-display-weight); font-size: var(--text-h2); line-height: 1.04; letter-spacing: var(--tracking-heading); }
@media (max-width: 52rem) { .cta__panel { grid-template-columns: 1fr; align-items: start; } }

/* footer */
.footer { border-top: var(--ad-rule); padding-block: clamp(2.5rem, 5vw, 4rem); }
.footer__inner { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--ad-gap); align-items: start; }
.footer__brand { font-family: var(--font-display); font-weight: var(--ad-display-weight); font-size: 1.35rem; }
.footer__cols { display: flex; gap: clamp(2rem, 4vw, 4rem); }
.footer__links { list-style: none; padding: 0; margin: 0.6rem 0 0; display: grid; gap: 0.4rem; }
.footer__links a { color: var(--color-text-muted); text-decoration: none; }
.footer__links a:hover { color: var(--color-text); }
.footer__note { color: var(--color-text-faint); font-size: var(--text-small, 0.875rem); margin-top: clamp(2rem, 4vw, 3rem); }
@media (max-width: 52rem) { .footer__inner { grid-template-columns: 1fr; } }

/* the legacy hero ornaments have no place in this identity */
.hero__object, .hero__orb, .hero-webgl { display: none !important; }
/* the step list numbers itself in the mono face; the legacy counter double-numbered it */
.process__step::before, .process__step::after { content: none !important; }
.process__steps { counter-reset: none !important; }
`;

  return `${base}${compositions[direction.composition] ?? compositions['editorial-split']}\n${decorationCss}`;
}

/* ------------------------------------------------------------- hero markup ---- */

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Emphasise one word of the headline with the display italic (the signature move). */
function markHeadline(headline, direction) {
  const text = String(headline ?? '').trim();
  if (!text) return '';
  const words = text.split(/\s+/);
  if (words.length < 3) return esc(text);
  // The last word of the first clause carries the emphasis.
  const clauseEnd = text.search(/[,.—]/);
  let index = clauseEnd > 0 ? text.slice(0, clauseEnd).trim().split(/\s+/).length - 1 : words.length - 1;
  index = Math.max(1, Math.min(index, words.length - 1));
  return words.map((word, i) => (i === index ? `<em>${esc(word)}</em>` : esc(word))).join(' ');
}

function decorationMarkup(decoration) {
  const layers = [];
  for (const layer of decoration.layers) {
    if (layer === 'grain') {
      layers.push('<div class="ad-layer ad-grain" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg"><filter id="ad-noise"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#ad-noise)"/></svg></div>');
    } else if (layer === 'scrim') layers.push('<div class="ad-layer ad-scrim" aria-hidden="true"></div>');
    else if (layer === 'vignette') layers.push('<div class="ad-layer ad-vignette" aria-hidden="true"></div>');
    else if (layer === 'rule') layers.push('<div class="ad-layer ad-rules" aria-hidden="true"></div>');
  }
  if (decoration.canvas) layers.push('<div class="ad-layer ad-canvas" aria-hidden="true"><canvas data-ad-canvas></canvas></div>');
  return layers.join('\n      ');
}

/**
 * Hero markup for the chosen composition.
 * @param {object} content  { eyebrow, headline, subhead, primaryCta, secondaryCta, proofPoint, figureLabel, rail }
 */
export function renderArtHero(content = {}, direction, decoration = decorationFor(direction)) {
  const eyebrow = content.eyebrow ? `<p class="hero-ad__eyebrow" data-reveal>${esc(content.eyebrow)}</p>` : '';
  const title = `<h1 class="hero-ad__title" data-reveal style="--reveal-delay:60ms">${markHeadline(content.headline, direction)}</h1>`;
  const lede = content.subhead ? `<p class="hero-ad__lede" data-reveal style="--reveal-delay:140ms">${esc(content.subhead)}</p>` : '';
  const actions = `<div class="hero-ad__actions" data-reveal style="--reveal-delay:200ms">
        <a class="hero-ad__cta" href="${esc(content.primaryCta?.href ?? '#start')}">${esc(content.primaryCta?.label ?? 'Start')}</a>
        ${content.secondaryCta ? `<a class="hero-ad__link" href="${esc(content.secondaryCta.href ?? '#how')}">${esc(content.secondaryCta.label)}</a>` : ''}
      </div>`;
  const proof = content.proofPoint ? `<p class="hero-ad__proof" data-reveal style="--reveal-delay:260ms">${esc(content.proofPoint)}</p>` : '';
  const figure = `<figure class="hero-ad__figure" data-reveal style="--reveal-delay:180ms"><figcaption class="hero-ad__figure-label">${esc(content.figureLabel ?? 'In place')}</figcaption></figure>`;
  const rail = (content.rail ?? []).map((item) => `<span>${esc(item)}</span>`).join('\n          ');
  const decor = decorationMarkup(decoration);
  const scrim = direction.composition === 'layered-scrim' ? '<div class="hero-ad__scrim" aria-hidden="true"></div>' : '';

  let inner;
  switch (direction.composition) {
    case 'editorial-split':
      // The aside carries the figures only; the proof line belongs under the
      // actions in the main column, or it reads as duplicated data.
      inner = `<div class="hero-ad__inner ad-shell">
        <div class="hero-ad__main">${eyebrow}${title}${lede}${actions}${rail ? '' : proof}</div>
        <div class="hero-ad__aside">${rail ? `<div class="hero-ad__rail">${rail}</div>` : proof}</div>
      </div>`;
      break;
    case 'oversized-type':
      inner = `<div class="hero-ad__inner">
        ${eyebrow}
        <div class="hero-ad__head">${title}</div>
        <div class="hero-ad__tail">
          <div>${lede}${actions}</div>
          <div>${rail ? `<div class="hero-ad__rail">${rail}</div>` : ''}${proof}</div>
        </div>
      </div>`;
      break;
    case 'fullbleed-type':
      inner = `<div class="hero-ad__inner ad-shell">
        ${eyebrow}${title}
        <hr class="hero-ad__rule" data-reveal style="--reveal-delay:120ms" />
        <div class="hero-ad__tail">
          <div>${lede}${actions}</div>
          <div>${proof}</div>
        </div>
      </div>`;
      break;
    case 'offset-figure':
      inner = `<div class="hero-ad__inner ad-shell">
        <div class="hero-ad__main">${eyebrow}${title}${lede}${actions}${proof}</div>
        ${figure}
      </div>`;
      break;
    case 'left-ruled':
      // The rail already carries the labels; repeating the eyebrow above the
      // headline reads as a data-entry mistake.
      inner = `<div class="hero-ad__inner ad-shell">
        <div class="hero-ad__rail">${rail || `<span>${esc(content.eyebrow ?? '')}</span>`}</div>
        <div class="hero-ad__body">${rail ? '' : eyebrow}${title}${lede}${actions}${proof}</div>
      </div>`;
      break;
    case 'layered-scrim':
    default:
      inner = `<div class="hero-ad__inner ad-shell">
        <div class="hero-ad__main">${eyebrow}${title}${lede}${actions}</div>
        <div class="hero-ad__aside">${proof}</div>
      </div>`;
  }
  return `<section class="hero-ad hero-ad--${direction.composition}" id="top" data-ad="${direction.id}">
      ${decor}${scrim}
      ${inner}
    </section>`;
}

/* ------------------------------------------------------------- hero canvas ---- */

/**
 * The earned 3D layer: ONE low-contrast lattice behind the type.
 * Monochrome, slow, DPR-capped, paused when hidden, never on coarse pointers.
 */
export function emitCanvasJs(direction) {
  return `
  // ---- depth layer: single low-contrast lattice (see art-direction decoration budget) ----
  (() => {
    const canvas = document.querySelector("[data-ad-canvas]");
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const small = window.matchMedia("(max-width: 60rem)").matches;
    if (reduce || coarse || small) { canvas.closest(".ad-canvas")?.remove(); return; }
    import("three").then((THREE) => {
      const parent = canvas.parentElement;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, parent.clientWidth / parent.clientHeight, 0.1, 100);
      camera.position.set(0, 0, 7);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setSize(parent.clientWidth, parent.clientHeight, false);
      const geometry = new THREE.IcosahedronGeometry(3.4, 4);
      const lattice = new THREE.LineSegments(
        new THREE.WireframeGeometry(geometry),
        new THREE.LineBasicMaterial({ color: ${JSON.stringify(direction.accent)}, transparent: true, opacity: ${direction.theme === 'dark' ? 0.18 : 0.14} })
      );
      lattice.rotation.set(0.4, 0.2, 0);
      scene.add(lattice);
      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(2.1, 1),
        new THREE.MeshBasicMaterial({ color: ${JSON.stringify(direction.substrate.surfaceAlt)}, transparent: true, opacity: 0.55 })
      );
      scene.add(core);
      let mx = 0, my = 0, tx = 0, ty = 0, raf = 0, running = true;
      const onMove = (e) => { tx = (e.clientX / window.innerWidth - 0.5) * 0.5; ty = (e.clientY / window.innerHeight - 0.5) * 0.3; };
      window.addEventListener("mousemove", onMove, { passive: true });
      const onResize = () => { const w = parent.clientWidth, h = parent.clientHeight; if (!w || !h) return; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); };
      window.addEventListener("resize", onResize, { passive: true });
      const tick = () => {
        if (!running) return;
        raf = requestAnimationFrame(tick);
        mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
        lattice.rotation.y += 0.0012; lattice.rotation.x = 0.4 + my * 0.5;
        core.rotation.y -= 0.0008;
        camera.position.x = mx * 1.4; camera.position.y = -my * 0.8;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      };
      tick();
      const stop = () => { running = false; cancelAnimationFrame(raf); };
      const start = () => { if (running) return; running = true; tick(); };
      document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
      if ("IntersectionObserver" in window) {
        new IntersectionObserver((entries) => entries.forEach((en) => (en.isIntersecting ? start() : stop())), { threshold: 0.01 }).observe(parent);
      }
    }).catch(() => { canvas.closest(".ad-canvas")?.remove(); });
  })();`;
}

/** Reveal orchestration: one staggered page-load ladder, fail-safe, reduced-motion aware. */
export function emitRevealJs() {
  return `
  // ---- reveal: staggered page load, fail-safe (content is visible if this never runs) ----
  (() => {
    const nodes = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!nodes.length) return;
    const show = (el) => el.classList.add("is-in");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) { nodes.forEach(show); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { show(en.target); io.unobserve(en.target); }
    }), { rootMargin: "0px 0px -8% 0px", threshold: 0.01 });
    nodes.forEach((el) => io.observe(el));
    // Safety net: anything still hidden 1.2s after load is revealed anyway.
    window.addEventListener("load", () => setTimeout(() => nodes.forEach((el) => { if (!el.classList.contains("is-in")) show(el); }), 1200));
  })();`;
}
