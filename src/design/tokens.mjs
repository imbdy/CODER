/**
 * Token system: turns a design direction + the workspace's existing design language
 * into the concrete scale (palette, type, spacing, radii, shadows, motion) that every
 * emitter composes with.
 */

import { adjust, contrastRatio, ensureContrast, extractColorIntent, luminance, mix, normalizeColor, withAlpha } from './color.mjs';

export { tokensToCssVariables, describeTokens } from './css-vars.mjs';

/**
 * @param {object} params
 * @param {object} params.direction  entry from the direction library
 * @param {object} [params.existing] detected design language (workspace.design)
 * @param {string} [params.intent]   create | enhance | redesign | responsive | motion | 3d
 * @param {string} [params.request]  raw request; an explicit colour word overrides the accent
 */
export function buildTokens({ direction, existing = {}, intent = 'create', request = '' } = {}) {
  const theme = direction.theme === 'dark'
    ? 'dark'
    : direction.theme === 'inherit'
      ? (existing?.darkMode === 'dark' ? 'dark' : 'light')
      : 'light';

  const preserve = intent !== 'redesign' || /preserv|keep (the|its)|maintain/i.test(String(request ?? ''));
  const detectedAccent = preserve && existing?.accent ? normalizeColor(existing.accent) : undefined;
  const colorIntent = extractColorIntent(request);
  const accentBase = colorIntent?.accent ?? detectedAccent ?? direction.accent ?? '#c9963f';
  const accent = theme === 'dark' && luminance(accentBase) < 0.1 ? adjust(accentBase, { l: 20 }) : accentBase;

  const surfaces = surfaceFamily(direction.neutral ?? 'warm', theme);
  const textContrast = contrastRatio(surfaces.text, surfaces.bg);

  return {
    theme,
    intent,
    direction: direction.id,
    accent,
    accentHover: theme === 'dark' ? adjust(accent, { l: 8, s: 2 }) : adjust(accent, { l: -8 }),
    accentQuiet: theme === 'dark' ? adjust(accent, { l: -20, s: -14 }) : adjust(accent, { l: 26, s: -16 }),
    accentSoft: withAlpha(accent, theme === 'dark' ? 0.16 : 0.12),
    accentReadableOnBg: ensureContrast(accent, surfaces.bg, 3),
    surfaces,
    text: {
      primary: surfaces.text,
      secondary: surfaces.textMuted,
      tertiary: surfaces.textFaint,
      onAccent: contrastRatio('#ffffff', accent) >= 4.5 ? '#ffffff' : ensureContrast('#0b0b0c', accent, 4.5),
    },
    border: surfaces.border,
    borderStrong: surfaces.borderStrong,
    fonts: {
      sans: direction.fonts?.sans ?? 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
      display: direction.fonts?.display ?? direction.fonts?.sans ?? 'Inter, system-ui, sans-serif',
      mono: direction.fonts?.mono ?? 'ui-monospace, SFMono-Regular, Menlo, monospace',
    },
    fontSizes: buildTypeScale(direction.typeScale ?? 1.25),
    fontWeights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    tracking: {
      display: direction.tracking?.display ?? '-0.02em',
      heading: direction.tracking?.heading ?? '-0.01em',
      body: direction.tracking?.body ?? '0',
      caps: '0.08em',
    },
    spacing: buildSpacing(direction.spacingBase ?? 4, direction.density ?? 'comfortable'),
    radii: buildRadius(direction.radius ?? 'soft'),
    shadows: buildShadows(theme, accent),
    motion: buildMotion(direction.motion ?? {}),
    maxWidth: direction.maxWidth ?? '72rem',
    proseWidth: '62ch',
    grid: direction.grid ?? '12-col',
    diagnostics: {
      theme,
      contrastTextOnBg: Number(textContrast.toFixed(2)),
      contrastAccentOnBg: Number(contrastRatio(accent, surfaces.bg).toFixed(2)),
      passAA: textContrast >= 4.5,
      preservedAccent: Boolean(detectedAccent),
      accentSource: colorIntent?.accent ? `request:${colorIntent.color}` : detectedAccent ? 'workspace' : 'direction',
    },
  };
}

function surfaceFamily(family, theme) {
  const families = {
    warm: { darkBg: '#12100e', darkSurface: '#1a1714', lightBg: '#faf7f2', lightSurface: '#ffffff', textDark: '#f5f1ea', textLight: '#171512' },
    cool: { darkBg: '#0d1014', darkSurface: '#141821', lightBg: '#f7f9fb', lightSurface: '#ffffff', textDark: '#eef2f7', textLight: '#101418' },
    neutral: { darkBg: '#0e0e0f', darkSurface: '#171718', lightBg: '#fafafa', lightSurface: '#ffffff', textDark: '#f4f4f5', textLight: '#141415' },
    ink: { darkBg: '#0a0a0b', darkSurface: '#141416', lightBg: '#ffffff', lightSurface: '#f6f6f7', textDark: '#f2f2f4', textLight: '#0b0b0c' },
  };
  const chosen = families[family] ?? families.warm;
  if (theme === 'dark') {
    return {
      bg: chosen.darkBg,
      surface: chosen.darkSurface,
      surfaceAlt: adjust(chosen.darkSurface, { l: 3 }),
      text: chosen.textDark,
      textMuted: mix(chosen.textDark, chosen.darkBg, 0.42),
      textFaint: mix(chosen.textDark, chosen.darkBg, 0.62),
      border: withAlpha('#ffffff', 0.1),
      borderStrong: withAlpha('#ffffff', 0.2),
    };
  }
  return {
    bg: chosen.lightBg,
    surface: chosen.lightSurface,
    surfaceAlt: adjust(chosen.lightBg, { l: -3 }),
    text: chosen.textLight,
    textMuted: mix(chosen.textLight, chosen.lightBg, 0.42),
    textFaint: mix(chosen.textLight, chosen.lightBg, 0.58),
    border: withAlpha('#000000', 0.1),
    borderStrong: withAlpha('#000000', 0.2),
  };
}

/** Modular type scale with fluid display sizes on larger viewports. */
function buildTypeScale(ratio = 1.25) {
  const steps = [
    ['xs', -2], ['sm', -1], ['base', 0], ['lg', 1], ['xl', 2], ['2xl', 3], ['3xl', 4], ['4xl', 5], ['5xl', 6],
  ];
  const out = {};
  for (const [name, step] of steps) {
    const rem = Number((ratio ** step).toFixed(3));
    const minRem = Number((rem * 0.84).toFixed(3));
    out[name] = step >= 3
      ? `clamp(${minRem}rem, ${(minRem + (rem - minRem) * 0.4).toFixed(2)}rem + ${((rem - minRem) / 0.8).toFixed(2)}vw, ${rem}rem)`
      : `${rem}rem`;
  }
  return out;
}

function buildSpacing(base = 4, density = 'comfortable') {
  const multiplier = density === 'compact' ? 0.85 : density === 'airy' ? 1.25 : 1;
  const out = { 0: '0' };
  for (const step of [1, 2, 3, 4, 6, 8, 12, 16, 24, 32]) {
    out[step] = `${Math.round(base * step * multiplier)}px`;
  }
  out.section = `${Math.round(base * 24 * (density === 'airy' ? 1.3 : 1))}px`;
  out.sectionLg = `${Math.round(base * 40 * (density === 'airy' ? 1.2 : 1))}px`;
  out.gutter = `${Math.round(base * 5 * multiplier)}px`;
  return out;
}

function buildRadius(style) {
  const scales = {
    sharp: { sm: '2px', md: '3px', lg: '4px', xl: '6px', pill: '999px' },
    soft: { sm: '6px', md: '10px', lg: '16px', xl: '24px', pill: '999px' },
    round: { sm: '10px', md: '16px', lg: '24px', xl: '32px', pill: '999px' },
  };
  return scales[style] ?? scales.soft;
}

function buildShadows(theme, accent) {
  if (theme === 'dark') {
    return {
      xs: '0 1px 2px rgb(0 0 0 / 0.4)',
      sm: '0 2px 8px rgb(0 0 0 / 0.45)',
      md: '0 10px 30px rgb(0 0 0 / 0.5)',
      lg: '0 24px 60px rgb(0 0 0 / 0.55)',
      accentGlow: `0 12px 40px ${withAlpha(accent, 0.28)}`,
      inset: 'inset 0 1px 0 rgb(255 255 255 / 0.06)',
    };
  }
  return {
    xs: '0 1px 2px rgb(16 16 20 / 0.06)',
    sm: '0 2px 6px rgb(16 16 20 / 0.08)',
    md: '0 12px 28px rgb(16 16 20 / 0.10)',
    lg: '0 28px 60px rgb(16 16 20 / 0.14)',
    accentGlow: `0 14px 40px ${withAlpha(accent, 0.22)}`,
    inset: 'inset 0 1px 0 rgb(255 255 255 / 0.6)',
  };
}

function buildMotion(preset = {}) {
  return {
    instant: '90ms',
    fast: preset.fast ?? '160ms',
    base: preset.base ?? '240ms',
    slow: preset.slow ?? '420ms',
    cinematic: preset.cinematic ?? '720ms',
    standard: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
    emphasized: 'cubic-bezier(0.16, 1, 0.3, 1)',
    entrance: 'cubic-bezier(0.22, 1, 0.36, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
    spring: preset.spring ?? 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    stagger: preset.stagger ?? '60ms',
    distance: preset.distance ?? '12px',
    lift: preset.lift ?? '2px',
  };
}

export function tokensSummary(tokens) {
  return {
    theme: tokens.theme,
    direction: tokens.direction,
    accent: tokens.accent,
    accentSource: tokens.diagnostics.accentSource,
    fontSans: tokens.fonts.sans.split(',')[0].trim(),
    fontDisplay: tokens.fonts.display.split(',')[0].trim(),
    radius: tokens.radii.md,
    section: tokens.spacing.section,
    contrast: tokens.diagnostics.contrastTextOnBg,
    motionBase: tokens.motion.base,
  };
}