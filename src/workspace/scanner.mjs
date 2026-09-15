/**
 * Workspace inspector — the agent's "eyes".
 *
 * Produces a single inspection object that every later phase (understanding,
 * planning, skill retrieval, verification, critique) reads. Nothing in Artisan
 * edits a file before this has run.
 */

import fs from 'node:fs';
import path from 'node:path';
import { walk, readText, countLines, findFirst, makeIgnoreMatcher, CODE_EXTENSIONS } from './files.mjs';
import {
  detectStack, extractDesignTokens, summarizeEntryPoints, inventoryComponents, detectSections,
} from './detect.mjs';
import { readMemory } from './memory.mjs';
import { WorkspaceError } from '../core/errors.mjs';

export function inspectWorkspace(workspaceDir, config = {}) {
  const root = path.resolve(workspaceDir);
  if (!fs.existsSync(root)) throw new WorkspaceError(`workspace does not exist: ${root}`);
  if (!fs.statSync(root).isDirectory()) throw new WorkspaceError(`workspace is not a directory: ${root}`);

  const { files, truncated } = walk(root, {
    ignore: config?.workspace?.ignore ?? [],
    maxFiles: config?.workspace?.maxScanFiles ?? 4000,
  });

  const stack = detectStack(root, files);
  const tokens = extractDesignTokens(root, files);
  const entryPoints = summarizeEntryPoints(files);
  const components = inventoryComponents(files);
  const memory = readMemory(root, config);

  const primaryHtmlRel = entryPoints.known['index.html'] ?? entryPoints.htmlEntryPoints[0];
  const primaryHtmlFile = primaryHtmlRel ? files.find((file) => file.rel === primaryHtmlRel) : undefined;
  const primaryHtml = primaryHtmlFile ? readText(primaryHtmlFile.path) : undefined;

  const sourceFiles = files.filter((file) => CODE_EXTENSIONS.has(file.ext));
  const codeBytes = sourceFiles.reduce((acc, file) => acc + file.size, 0);
  const visibleFiles = files.filter((file) => !file.rel.startsWith('.'));

  const inspection = {
    root,
    inspectedAt: new Date().toISOString(),
    exists: true,
    isEmpty: visibleFiles.length === 0,
    truncated,
    fileCount: files.length,
    codeBytes,
    codeKilobytes: Math.round(codeBytes / 1024),
    hasNodeModules: fs.existsSync(path.join(root, 'node_modules')),
    hasPackageJson: Boolean(stack.packageJson),
    hasGitRepo: fs.existsSync(path.join(root, '.git')),
    framework: stack.framework,
    buildTool: stack.buildTool,
    styling: stack.styling,
    typescript: stack.typescript,
    libraries: stack.libraries,
    deps: stack.deps,
    scripts: stack.packageJson?.scripts ?? {},
    packageName: stack.packageJson?.name,
    entryPoints,
    primaryHtmlRel,
    primaryHtml,
    sections: detectSections(primaryHtml),
    components,
    componentsDir: components.length ? path.posix.dirname(components[0].rel) : undefined,
    design: tokens,
    memory,
    files: files.map((file) => ({ rel: file.rel, size: file.size, ext: file.ext })),
    directories: [...new Set(files.map((file) => path.posix.dirname(file.rel)))].filter((dir) => dir !== '.').slice(0, 60),
  };

  inspection.projectKind = classifyProject(inspection);
  inspection.capabilities = inferCapabilities(inspection);
  inspection.summary = summarizeInspection(inspection);
  return inspection;
}

/** What kind of product is this? Drives composition, priors and design decisions. */
export function classifyProject(inspection) {
  const sections = inspection.sections ?? [];
  const files = inspection.files.map((file) => file.rel.toLowerCase());
  if (inspection.isEmpty) return 'empty';

  const hasDataSource = files.some((rel) => /(api|service|store|hook|firebase|supabase|\.config)/.test(rel));
  const hasRoutes = files.some((rel) => /(router|routes|pages\/|app\/)/.test(rel));

  if (sections.includes('pricing') || sections.includes('testimonials')) return 'marketing-site';
  if (sections.includes('hero') && (sections.includes('features') || sections.includes('cta'))) return 'landing-page';
  if (sections.includes('form') && inspection.components.length <= 6) return 'auth-flow';
  if (hasDataSource && hasRoutes) return 'product-app';
  if (inspection.framework === 'static-html' && inspection.fileCount <= 8) return 'static-page';
  if (inspection.components.length > 12) return 'component-library';
  return 'web-app';
}

export function inferCapabilities(inspection) {
  return {
    canBuild: Boolean(inspection.scripts.build),
    canDev: Boolean(inspection.scripts.dev || inspection.framework === 'static-html' || inspection.primaryHtmlRel),
    canTest: Boolean(inspection.scripts.test),
    hasTypeScript: inspection.typescript,
    styling: inspection.styling,
    hasAnimationLib: inspection.libraries.some((lib) => ['motion', 'gsap'].includes(lib)),
    has3d: inspection.libraries.some((lib) => ['three', 'r3f', 'drei'].includes(lib)),
    serverPortGuess: guessPort(inspection),
  };
}

function guessPort(inspection) {
  const dev = inspection.scripts?.dev ?? '';
  const match = dev.match(/--port[= ](\d+)/);
  if (match) return Number(match[1]);
  if (inspection.buildTool === 'next') return 3000;
  return 5173;
}

export function summarizeInspection(inspection) {
  const lines = [];
  lines.push(`Workspace: ${inspection.root}`);
  lines.push(`Kind: ${inspection.projectKind} | framework: ${inspection.framework} | build: ${inspection.buildTool} | styling: ${inspection.styling}${inspection.typescript ? ' | TypeScript' : ''}`);
  if (inspection.libraries.length) lines.push(`Libraries: ${inspection.libraries.join(', ')}`);
  lines.push(`Files: ${inspection.fileCount} (${inspection.codeKilobytes} KB source)${inspection.truncated ? ' [truncated]' : ''}${inspection.hasNodeModules ? '' : ' | node_modules missing'}`);
  if (inspection.scripts?.dev) lines.push(`Scripts: ${Object.entries(inspection.scripts).map(([key, value]) => `${key}="${value}"`).join(', ')}`);
  if (inspection.primaryHtmlRel) lines.push(`Primary HTML: ${inspection.primaryHtmlRel}`);
  if (inspection.sections.length) lines.push(`Sections present: ${inspection.sections.join(', ')}`);
  if (inspection.components.length) {
    lines.push(`Components (${inspection.components.length}): ${inspection.components.slice(0, 12).map((c) => c.name).join(', ')}${inspection.components.length > 12 ? ', ...' : ''}`);
  }
  const palette = inspection.design?.palette ?? [];
  if (palette.length) lines.push(`Palette: ${palette.slice(0, 6).map((entry) => entry.value).join(' ')}`);
  if (inspection.design?.fontStack?.length) lines.push(`Fonts: ${inspection.design.fontStack.map((entry) => entry.value).join(' | ')}`);
  if (inspection.design?.accent) lines.push(`Accent: ${inspection.design.accent} | theme: ${inspection.design.darkMode}`);
  if (inspection.design?.breakpoints?.length) lines.push(`Breakpoints: ${inspection.design.breakpoints.join(', ')}`);
  return lines.join('\n');
}
/** Read only the files relevant to a request, within a character budget. */
export function selectRelevantFiles(inspection, request, { limit = 8, budgetChars = 24000 } = {}) {
  const keywords = String(request).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const scored = inspection.files
    .filter((file) => CODE_EXTENSIONS.has(file.ext) && file.size < 60000)
    .map((file) => {
      const rel = file.rel.toLowerCase();
      let score = 0;
      if (/index\.html?$/.test(rel)) score += 6;
      if (/(^|\/)app\.(t|j)sx?$/.test(rel)) score += 5;
      if (/(^|\/)main\.(t|j)sx?$/.test(rel)) score += 3;
      if (/(globals|index|app)\.css$/.test(rel)) score += 4;
      if (/components\//.test(rel)) score += 2;
      if (/package\.json$/.test(rel)) score += 2;
      for (const keyword of keywords) if (rel.includes(keyword)) score += 3;
      if (/\.(test|spec)\./.test(rel)) score -= 5;
      if (/\.(json|lock)$/.test(rel) && !/package\.json$/.test(rel)) score -= 1;
      return { file, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.file.rel.localeCompare(b.file.rel));

  const chosen = [];
  let used = 0;
  for (const entry of scored) {
    if (chosen.length >= limit) break;
    const content = readText(path.join(inspection.root, entry.file.rel));
    if (content === undefined) continue;
    if (used + content.length > budgetChars && chosen.length >= 2) continue;
    used += content.length;
    chosen.push({ rel: entry.file.rel, content, lines: countLines(content) });
  }
  return chosen;
}

export function fileExistsInWorkspace(inspection, rel) {
  const needle = String(rel).replace(/\\/g, '/').toLowerCase();
  return inspection.files.some((file) => file.rel.replace(/\\/g, '/').toLowerCase() === needle);
}

export function isIgnoredPath(relPath, ignore) {
  return makeIgnoreMatcher(ignore)(relPath, path.basename(relPath), false);
}

export function pickPrimaryHtml(inspection) {
  if (inspection.primaryHtml) return { rel: inspection.primaryHtmlRel, content: inspection.primaryHtml };
  const files = inspection.files.map((entry) => ({ ...entry, path: path.join(inspection.root, entry.rel) }));
  const file = findFirst(files, ['index.html']);
  if (!file) return undefined;
  return { rel: file.rel, content: readText(file.path) };
}