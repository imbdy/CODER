/** Render tokens as CSS custom properties (shared by every emitter). */

export function tokensToCssVariables(tokens, { selector = ':root', indent = '  ' } = {}) {
  const lines = [`${selector} {`];
  lines.push(`${indent}/* palette */`);
  lines.push(`${indent}--color-bg: ${tokens.surfaces.bg};`);
  lines.push(`${indent}--color-surface: ${tokens.surfaces.surface};`);
  lines.push(`${indent}--color-surface-alt: ${tokens.surfaces.surfaceAlt};`);
  lines.push(`${indent}--color-text: ${tokens.text.primary};`);
  lines.push(`${indent}--color-text-muted: ${tokens.text.secondary};`);
  lines.push(`${indent}--color-text-faint: ${tokens.text.tertiary};`);
  lines.push(`${indent}--color-accent: ${tokens.accent};`);
  lines.push(`${indent}--color-accent-hover: ${tokens.accentHover};`);
  lines.push(`${indent}--color-accent-quiet: ${tokens.accentQuiet};`);
  lines.push(`${indent}--color-accent-soft: ${tokens.accentSoft};`);
  lines.push(`${indent}--color-accent-readable: ${tokens.accentReadableOnBg};`);
  lines.push(`${indent}--color-on-accent: ${tokens.text.onAccent};`);
  lines.push(`${indent}--color-border: ${tokens.border};`);
  lines.push(`${indent}--color-border-strong: ${tokens.borderStrong};`);

  lines.push('');
  lines.push(`${indent}/* type */`);
  lines.push(`${indent}--font-sans: ${tokens.fonts.sans};`);
  lines.push(`${indent}--font-display: ${tokens.fonts.display};`);
  lines.push(`${indent}--font-mono: ${tokens.fonts.mono};`);
  for (const [name, size] of Object.entries(tokens.fontSizes)) lines.push(`${indent}--text-${name}: ${size};`);
  lines.push(`${indent}--weight-regular: ${tokens.fontWeights.regular};`);
  lines.push(`${indent}--weight-medium: ${tokens.fontWeights.medium};`);
  lines.push(`${indent}--weight-semibold: ${tokens.fontWeights.semibold};`);
  lines.push(`${indent}--weight-bold: ${tokens.fontWeights.bold};`);
  lines.push(`${indent}--tracking-display: ${tokens.tracking.display};`);
  lines.push(`${indent}--tracking-heading: ${tokens.tracking.heading};`);
  lines.push(`${indent}--tracking-body: ${tokens.tracking.body};`);
  lines.push(`${indent}--tracking-caps: ${tokens.tracking.caps};`);

  lines.push('');
  lines.push(`${indent}/* space + shape */`);
  for (const [name, size] of Object.entries(tokens.spacing)) lines.push(`${indent}--space-${name}: ${size};`);
  for (const [name, radius] of Object.entries(tokens.radii)) lines.push(`${indent}--radius-${name}: ${radius};`);
  for (const [name, shadow] of Object.entries(tokens.shadows)) lines.push(`${indent}--shadow-${name}: ${shadow};`);

  lines.push('');
  lines.push(`${indent}/* motion */`);
  for (const key of ['instant', 'fast', 'base', 'slow', 'cinematic']) lines.push(`${indent}--duration-${key}: ${tokens.motion[key]};`);
  for (const key of ['standard', 'emphasized', 'entrance', 'exit', 'spring']) lines.push(`${indent}--ease-${key}: ${tokens.motion[key]};`);
  lines.push(`${indent}--stagger: ${tokens.motion.stagger};`);
  lines.push(`${indent}--motion-distance: ${tokens.motion.distance};`);
  lines.push(`${indent}--motion-lift: ${tokens.motion.lift};`);

  lines.push('');
  lines.push(`${indent}/* layout */`);
  lines.push(`${indent}--max-width: ${tokens.maxWidth};`);
  lines.push(`${indent}--prose-width: ${tokens.proseWidth};`);
  lines.push('}');
  return lines.join('\n');
}

/** Tailwind v4 `@theme` block so Tailwind utilities resolve to our tokens. */
export function tokensToTailwindTheme(tokens, { indent = '  ' } = {}) {
  const lines = ['@theme {'];
  lines.push(`${indent}--color-bg: ${tokens.surfaces.bg};`);
  lines.push(`${indent}--color-surface: ${tokens.surfaces.surface};`);
  lines.push(`${indent}--color-ink: ${tokens.text.primary};`);
  lines.push(`${indent}--color-muted: ${tokens.text.secondary};`);
  lines.push(`${indent}--color-accent: ${tokens.accent};`);
  lines.push(`${indent}--color-accent-hover: ${tokens.accentHover};`);
  lines.push(`${indent}--color-border: ${tokens.border};`);
  lines.push(`${indent}--font-sans: ${tokens.fonts.sans};`);
  lines.push(`${indent}--font-display: ${tokens.fonts.display};`);
  for (const [name, size] of Object.entries(tokens.fontSizes)) {
    if (!String(size).startsWith('clamp')) lines.push(`${indent}--text-${name}: ${size};`);
  }
  lines.push(`${indent}--radius-md: ${tokens.radii.md};`);
  lines.push(`${indent}--radius-lg: ${tokens.radii.lg};`);
  lines.push(`${indent}--ease-standard: ${tokens.motion.standard};`);
  lines.push(`${indent}--ease-emphasized: ${tokens.motion.emphasized};`);
  lines.push('}');
  return lines.join('\n');
}

const KNOWN_GOOGLE_FONTS = [
  'Inter', 'Instrument Serif', 'Space Grotesk', 'Sora', 'Manrope', 'Fraunces', 'Playfair Display',
  'DM Serif Display', 'IBM Plex Sans', 'IBM Plex Mono', 'JetBrains Mono', 'Geist', 'Geist Mono',
  'Plus Jakarta Sans', 'Outfit', 'Libre Baskerville', 'Source Serif 4', 'Space Mono',
];

/** Google Fonts href covering the families the tokens actually use. */
export function googleFontsHref(tokens) {
  const primarySans = String(tokens.fonts.sans).split(',')[0].trim().replace(/["']/g, '');
  const primaryDisplay = String(tokens.fonts.display).split(',')[0].trim().replace(/["']/g, '');
  const primaryMono = String(tokens.fonts.mono).split(',')[0].trim().replace(/["']/g, '');
  const families = [...new Set([primarySans, primaryDisplay, primaryMono])].filter((family) => KNOWN_GOOGLE_FONTS.includes(family));
  if (!families.length) return undefined;
  const parts = families.map((family) => {
    const isDisplay = family === primaryDisplay && family !== primarySans;
    const axis = isDisplay ? 'ital,wght@0,400;0,600;1,400' : 'wght@300..700';
    return `family=${family.replace(/ /g, '+')}:${axis}`;
  });
  return `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap`;
}

export function describeTokens(tokens) {
  return [
    `direction=${tokens.direction}`,
    `theme=${tokens.theme}`,
    `accent=${tokens.accent}(${tokens.diagnostics.accentSource})`,
    `text-contrast=${tokens.diagnostics.contrastTextOnBg}:1`,
    `body=${tokens.fonts.sans.split(',')[0].trim()}`,
    `display=${tokens.fonts.display.split(',')[0].trim()}`,
    `radius=${tokens.radii.md}`,
    `section=${tokens.spacing.section}`,
  ].join(' ');
}