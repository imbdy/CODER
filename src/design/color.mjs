import { positiveText } from './negation.mjs';
/**
 * Design tokens — deterministic, principled design decisions.
 *
 * A senior designer does not invent a colour, a type scale and a spacing rhythm per
 * component: they fix a small system and compose with it. This module generates that
 * system from the design direction, any design language already present in the
 * workspace, and the request itself. Everything downstream consumes these tokens,
 * which is what keeps output coherent instead of "AI slop".
 */

import { clamp } from '../core/util.mjs';

/* ------------------------------------------------------------------ colour ---- */

export function hexToRgb(hex) {
  const text = String(hex ?? '').trim();
  const short = text.startsWith('#') ? text.slice(1) : text;
  if (!/^[0-9a-f]{3,8}$/i.test(short)) return undefined;
  const expanded = short.length === 3 || short.length === 4
    ? short.split('').map((char) => char + char).join('')
    : short;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
    a: expanded.length >= 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
}

export function rgbToHex({ r, g, b }) {
  const part = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb({ h, s, l }) {
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
      : hp < 3 ? [0, c, x]
        : hp < 4 ? [0, x, c]
          : hp < 5 ? [x, 0, c]
            : [c, 0, x];
  const m = ln - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

export function hslToHex(hsl) {
  return rgbToHex(hslToRgb(hsl));
}

export function adjust(hex, { h = 0, s = 0, l = 0 } = {}) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  return hslToHex({ h: (hsl.h + h + 360) % 360, s: clamp(hsl.s + s, 0, 100), l: clamp(hsl.l + l, 0, 100) });
}

export function mix(hexA, hexB, ratio = 0.5) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  return rgbToHex({
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio,
  });
}

export function withAlpha(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgb(${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)} / ${Number(alpha.toFixed(3))})`;
}

/** WCAG relative luminance. */
export function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(hexA, hexB) {
  const la = luminance(hexA);
  const lb = luminance(hexB);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Darken/lighten until contrast against `against` reaches `target`. */
export function ensureContrast(hex, against, target = 4.5) {
  const towards = luminance(against) > 0.4 ? '#000000' : '#ffffff';
  let candidate = hex;
  for (let step = 1; step <= 24; step += 1) {
    if (contrastRatio(candidate, against) >= target) return candidate;
    candidate = mix(hex, towards, step / 24);
  }
  return candidate;
}

export function isDark(hex) {
  return luminance(hex) < 0.35;
}

export function normalizeColor(value) {
  const text = String(value ?? '').trim();
  if (text.startsWith('#')) {
    if (text.length === 4) return `#${text.slice(1).split('').map((char) => char + char).join('')}`;
    if (text.length >= 7) return text.slice(0, 7);
    return undefined;
  }
  const rgb = text.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) return rgbToHex({ r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) });
  return undefined;
}

/** Canonical hues for explicit colour words in a request ("a red button"). */
const NAMED_HUES = {
  red: '#d43a2f', crimson: '#c62b3e', blue: '#2563eb', navy: '#1e3a8a', green: '#188a4e',
  emerald: '#0f9d58', teal: '#0e8f8f', cyan: '#0891b2', purple: '#7c3aed', violet: '#6d28d9',
  pink: '#db2777', magenta: '#c026d3', orange: '#ea6a12', amber: '#d97706', yellow: '#ca8a04',
  lime: '#65a30d', indigo: '#4f46e5', rose: '#e11d48', gold: '#c9a227', slate: '#475569',
};

/** Extract an explicit colour intent from a request, or undefined. */
/**
 * A colour the brief ASKS for, never one it rules out.
 *
 * The inline no/not/without guard below only catches a rejection phrased in
 * prose. It misses the one that actually reaches this function: the rendered
 * agreed context ends with "REJECTED: AI-SaaS look, purple, glass", where
 * "purple" sits in a bare comma list with no negation word in front of it. That
 * is how a brief whose first demand was "no purple" got accent request:purple.
 */
export function extractColorIntent(request = '') {
  const text = positiveText(String(request)).toLowerCase();
  for (const [name, hex] of Object.entries(NAMED_HUES)) {
    if (new RegExp(`\\b${name}\\b`).test(text) && !new RegExp(`\\b(?:no|not|without)\\s+(?:\\w+\\s+){0,2}${name}\\b`).test(text)) {
      return { color: name, accent: hex };
    }
  }
  return undefined;
}