/**
 * Detection tables and design-language extraction.
 *
 * Artisan must *read* an existing codebase before touching it: which framework,
 * which styling system, which libraries, which colour/typography/radius/breakpoint
 * tokens are already in use. Every later decision (whether to add a dependency,
 * which accent to use, how tight the tracking should be) is grounded in this output.
 */

import path from 'node:path';
import { readJson, readText, findFirst, allDependencies } from './files.mjs';

export const KNOWN_LIBRARIES = {
  motion: ['framer-motion', 'motion'],
  gsap: ['gsap', '@gsap/react'],
  three: ['three'],
  r3f: ['@react-three/fiber'],
  drei: ['@react-three/drei'],
  tailwind: ['tailwindcss', '@tailwindcss/vite'],
  shadcn: ['class-variance-authority', '@radix-ui/react-slot', 'tailwind-merge'],
  radix: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
  lenis: ['lenis', '@studio-freight/lenis'],
  zustand: ['zustand'],
  reactQuery: ['@tanstack/react-query'],
  next: ['next'],
  react: ['react'],
  vue: ['vue'],
  svelte: ['svelte'],
  astro: ['astro'],
  postprocessing: ['@react-three/postprocessing', 'postprocessing'],
};

const FRAMEWORK_BY_DEP = {
  next: 'next',
  nuxt: 'nuxt',
  react: 'react',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro',
  '@angular/core': 'angular',
  'solid-js': 'solid',
};

const BUILD_BY_DEP = {
  vite: 'vite',
  next: 'next',
  'react-scripts': 'cra',
  parcel: 'parcel',
  '@sveltejs/kit': 'sveltekit',
  astro: 'astro',
  webpack: 'webpack',
  esbuild: 'esbuild',
  rollup: 'rollup',
};

/** @returns {{framework: string, buildTool: string, styling: string, typescript: boolean, libraries: string[], deps: object, packageJson: object|undefined}} */
export function detectStack(dir, files) {
  const pkgFile = findFirst(files, ['package.json']);
  const pkg = pkgFile ? readJson(pkgFile.path) : undefined;
  const deps = allDependencies(pkg);

  let framework = 'unknown';
  for (const [dep, name] of Object.entries(FRAMEWORK_BY_DEP)) {
    if (deps[dep]) { framework = name; break; }
  }

  let buildTool = 'none';
  for (const [dep, name] of Object.entries(BUILD_BY_DEP)) {
    if (deps[dep]) { buildTool = name; break; }
  }

  const libraries = [];
  for (const [label, aliases] of Object.entries(KNOWN_LIBRARIES)) {
    if (aliases.some((alias) => deps[alias])) libraries.push(label);
  }

  let styling = 'unknown';
  if (deps.tailwindcss || deps['@tailwindcss/vite']) styling = 'tailwind';
  else if (deps['styled-components']) styling = 'styled-components';
  else if (deps['@emotion/react'] || deps['@emotion/styled']) styling = 'emotion';
  else if (deps.sass || deps['node-sass']) styling = 'sass';
  else if (files.some((file) => /\.module\.(css|scss)$/.test(file.rel))) styling = 'css-modules';
  else if (files.some((file) => file.ext === '.css')) styling = 'plain-css';

  const typescript = Boolean(deps.typescript) || files.some((file) => file.ext === '.ts' || file.ext === '.tsx');
  if (framework === 'unknown' && files.some((file) => file.ext === '.html')) framework = 'static-html';

  return { framework, buildTool, styling, typescript, libraries, deps, packageJson: pkg, packageFile: pkgFile?.rel };
}

export const SECTION_HINTS = {
  header: /<header|class="[^"]*header|navbar/i,
  hero: /hero|jumbotron|masthead/i,
  features: /features?|benefits?/i,
  pricing: /pricing|plans?/i,
  testimonials: /testimonial|reviews?|social-proof/i,
  cta: /cta|call-to-action|get-started/i,
  faq: /faq|accordion/i,
  footer: /<footer|class="[^"]*footer/i,
  form: /<form|login|sign-?in|sign-?up/i,
  gallery: /gallery|showcase/i,
  stats: /stats?|metrics?/i,
};

export function detectSections(htmlText) {
  const found = [];
  for (const [section, pattern] of Object.entries(SECTION_HINTS)) {
    if (pattern.test(String(htmlText ?? ''))) found.push(section);
  }
  return found;
}

export function summarizeEntryPoints(files) {
  const candidates = [
    'index.html', 'src/main.tsx', 'src/main.jsx', 'src/main.ts', 'src/main.js',
    'src/App.tsx', 'src/App.jsx', 'src/App.vue', 'src/app/page.tsx', 'app/page.tsx',
    'pages/index.tsx', 'src/routes/+page.svelte', 'src/index.css', 'src/App.css',
    'src/styles/globals.css', 'src/app/globals.css', 'public/index.html',
  ];
  const found = {};
  for (const candidate of candidates) {
    const hit = files.find((file) => file.rel.toLowerCase() === candidate.toLowerCase());
    if (hit) found[candidate] = hit.rel;
  }
  const htmlEntryPoints = files.filter((file) => /(^|\/)index\.html?$/.test(file.rel)).slice(0, 4).map((file) => file.rel);
  return { known: found, htmlEntryPoints };
}

const HEX_RE = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi;
const RGB_RE = /rgba?\(\s*\d{1,3}[^)]*\)/gi;
const CSS_VAR_RE = /--([a-z0-9-_]+)\s*:\s*([^;{}]+);/gi;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;{}]+);/gi;
const RADIUS_RE = /border-radius\s*:\s*([^;{}]+);/gi;
const BREAKPOINT_RE = /@media[^{]*?(?:min|max)-width\s*:\s*([0-9.]+)(px|rem|em)/gi;
const FONT_SIZE_RE = /font-size\s*:\s*([^;{}]+);/gi;
const SHADOW_RE = /box-shadow\s*:\s*([^;{}]+);/gi;

/** Extract the existing design language (tokens, palette, type, radii, breakpoints). */
export function extractDesignTokens(dir, files, { maxStyleFiles = 40 } = {}) {
  const styleFiles = files.filter((file) => ['.css', '.scss', '.sass', '.less'].includes(file.ext)).slice(0, maxStyleFiles);
  const htmlFiles = files.filter((file) => file.ext === '.html').slice(0, 5);
  const jsxFiles = files.filter((file) => ['.tsx', '.jsx', '.vue', '.svelte'].includes(file.ext)).slice(0, 60);

  const cssVars = {};
  const colors = new Map();
  const fonts = new Map();
  const radii = new Map();
  const fontSizes = new Map();
  const shadows = new Set();
  const breakpoints = new Set();
  let styleText = '';

  const harvest = (text) => {
    if (!text) return;
    styleText += `${text}\n`;
    for (const match of text.matchAll(CSS_VAR_RE)) {
      const key = `--${match[1]}`;
      if (!(key in cssVars)) cssVars[key] = match[2].trim();
    }
    for (const match of text.matchAll(HEX_RE)) colors.set(match[0].toLowerCase(), (colors.get(match[0].toLowerCase()) ?? 0) + 1);
    for (const match of text.matchAll(RGB_RE)) {
      const value = match[0].replace(/\s+/g, '').toLowerCase();
      colors.set(value, (colors.get(value) ?? 0) + 1);
    }
    for (const match of text.matchAll(FONT_FAMILY_RE)) {
      const value = match[1].trim().replace(/["']/g, '');
      fonts.set(value, (fonts.get(value) ?? 0) + 1);
    }
    for (const match of text.matchAll(RADIUS_RE)) {
      const value = match[1].trim();
      radii.set(value, (radii.get(value) ?? 0) + 1);
    }
    for (const match of text.matchAll(FONT_SIZE_RE)) {
      const value = match[1].trim();
      fontSizes.set(value, (fontSizes.get(value) ?? 0) + 1);
    }
    for (const match of text.matchAll(SHADOW_RE)) shadows.add(match[1].trim());
    for (const match of text.matchAll(BREAKPOINT_RE)) {
      const raw = Number(match[1]);
      breakpoints.add(match[2] === 'px' ? raw : Math.round(raw * 16));
    }
  };

  for (const file of [...styleFiles, ...htmlFiles, ...jsxFiles]) harvest(readText(file.path, 60000));

  const tailwindConfig = files.find((file) => /tailwind\.config\.(js|ts|cjs|mjs)$/.test(file.rel));
  if (tailwindConfig) harvest(readText(tailwindConfig.path, 60000));

  for (const file of files.filter((entry) => /(theme|tokens|colors|design-system)\.(t|j)sx?$/.test(entry.rel)).slice(0, 5)) {
    harvest(readText(file.path, 60000));
  }

  const palette = rankMap(colors, 12);
  return {
    cssVars,
    cssVarCount: Object.keys(cssVars).length,
    palette,
    fontStack: rankMap(fonts, 5),
    radiusScale: rankMap(radii, 6),
    typeScale: rankMap(fontSizes, 10),
    shadows: [...shadows].slice(0, 8),
    breakpoints: [...breakpoints].sort((a, b) => a - b),
    accent: pickAccent(palette, cssVars),
    darkMode: detectDarkMode(styleText, cssVars),
    styleBytes: styleText.length,
    hasAnimations: /@keyframes|transition\s*:|animation\s*:/i.test(styleText),
    hasReducedMotion: /prefers-reduced-motion/i.test(styleText),
    hasFocusStyles: /:focus(-visible)?\s*{/i.test(styleText),
  };
}

function rankMap(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

const NEUTRALS = new Set(['#000', '#fff', '#ffffff', '#000000', '#111', '#111111', '#222', '#333', '#f5f5f5', '#fafafa']);

function pickAccent(palette = [], cssVars = {}) {
  const fromVars = Object.entries(cssVars).find(([key, value]) => /accent|primary|brand/i.test(key) && /#|rgb/i.test(value));
  if (fromVars) return String(fromVars[1]).trim();
  const chromatic = palette.find((entry) => !NEUTRALS.has(entry.value) && isChromatic(entry.value));
  return chromatic?.value ?? palette[0]?.value;
}

function isChromatic(value) {
  const hex = String(value).startsWith('#') ? String(value).slice(1) : undefined;
  if (!hex || (hex.length !== 6 && hex.length !== 3)) return true;
  const expanded = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return Math.max(r, g, b) - Math.min(r, g, b) > 24;
}

function detectDarkMode(styleText, cssVars) {
  if (/prefers-color-scheme\s*:\s*dark/i.test(styleText)) return 'system';
  if (/\.dark\b|\[data-theme=["']dark["']\]/i.test(styleText)) return 'class';
  const bgVar = Object.entries(cssVars).find(([key]) => /(^--bg|background)/i.test(key))?.[1];
  if (bgVar && isDarkColor(bgVar)) return 'dark';
  const bodyBg = styleText.match(/body\s*{[^}]*background(?:-color)?\s*:\s*([^;]+);/i)?.[1];
  if (bodyBg && isDarkColor(bodyBg)) return 'dark';
  return 'light';
}

export function isDarkColor(value) {
  const text = String(value ?? '').trim();
  if (text.startsWith('rgb')) {
    const match = text.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!match) return false;
    return (Number(match[1]) + Number(match[2]) + Number(match[3])) / 3 < 90;
  }
  if (!text.startsWith('#')) return false;
  const hex = text.slice(1);
  const expanded = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex.slice(0, 6);
  const r = parseInt(expanded.slice(0, 2), 16) || 0;
  const g = parseInt(expanded.slice(2, 4), 16) || 0;
  const b = parseInt(expanded.slice(4, 6), 16) || 0;
  return (r + g + b) / 3 < 90;
}

/** Component inventory used for "what already exists?" decisions. */
export function inventoryComponents(files) {
  return files
    .filter((file) => ['.tsx', '.jsx', '.vue', '.svelte', '.astro'].includes(file.ext))
    .filter((file) => !/\.(test|spec|stories)\./.test(file.rel))
    .map((file) => ({
      rel: file.rel,
      name: path.basename(file.rel, file.ext).replace(/^index$/, path.basename(path.dirname(file.rel))),
      size: file.size,
    }))
    .slice(0, 200);
}