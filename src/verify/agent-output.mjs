/**
 * Verification of what the agent actually produced.
 *
 * Two levels, deliberately separated:
 *   - `issues`   → the build is wrong (missing linked file, no CSS, no JS)
 *   - `warnings` → the build works but is sloppy (undefined CSS variables,
 *                  alert(), no reduced-motion block, no responsive breakpoint)
 *
 * The agent runtime uses warnings to trigger ONE bounded repair turn, and the
 * test harness reports them in REPORT.md.
 */

import { readWorkspaceFile } from '../workspace/writer.mjs';

export function checkStructure(workspaceDir, writes, agent = {}) {
  const issues = [];
  const warnings = [];
  const rels = (writes ?? []).map((write) => write.rel);
  const htmlRel = rels.find((rel) => /(^|\/)index\.html$/i.test(rel)) ?? rels.find((rel) => rel.endsWith('.html'));
  const cssRels = rels.filter((rel) => rel.endsWith('.css'));
  const jsRels = rels.filter((rel) => /\.(m?js|jsx|tsx)$/.test(rel));

  if (!rels.length) return { ok: false, summary: 'agent wrote no files', issues: ['no files written'], warnings: [] };
  if (!htmlRel) {
    // A React/Next build legitimately has no html entry point.
    const isJsx = rels.some((rel) => /\.(jsx|tsx)$/.test(rel));
    if (!isJsx) issues.push('no html entry point written');
    return { ok: issues.length === 0, summary: issues.join('; ') || `${rels.length} component files`, issues, warnings };
  }

  const read = (rel) => readWorkspaceFile(workspaceDir, String(rel).replace(/^\.?\//, '')) ?? '';
  const html = read(htmlRel);
  const cssText = cssRels.map(read).join('\n');
  const jsText = jsRels.map(read).join('\n');
  const linkedCss = [...html.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/gi)].map((match) => match[1]);
  const linkedJs = [...html.matchAll(/<script[^>]+src=["']([^"']+\.m?js)["']/gi)].map((match) => match[1]);
  const inlineCss = /<style[\s>]/i.test(html) && (html.match(/<style[\s>][\s\S]*?<\/style>/i)?.[0].length ?? 0) > 1200;
  const inlineJs = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]{1200,}?<\/script>/i.test(html);

  for (const href of linkedCss) if (!read(href)) issues.push(`${htmlRel} links ${href} which was not written`);
  for (const src of linkedJs) if (!read(src)) issues.push(`${htmlRel} loads ${src} which was not written`);
  if (!linkedCss.length && !inlineCss) issues.push('html has no stylesheet (linked or inline)');
  if (!linkedJs.length && !inlineJs) issues.push('html has no javascript (linked or inline)');
  if (!cssRels.length && !inlineCss) issues.push('no css file was written');
  if (!jsRels.length && !inlineJs) issues.push('no js file was written');

  // Content checks — the failure mode where the model ships a skeleton shell
  // (correct <link>/<script>, empty <body>) and claims the page is done.
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '';
  const visibleText = body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (visibleText.length < 240) issues.push(`html body is nearly empty (${visibleText.length} visible characters of copy)`);
  if (!/<h1[\s>]/i.test(html)) issues.push('html has no <h1>');
  if (!/<(main|section|article|header|footer|nav)[\s>]/i.test(html)) issues.push('html has no semantic sections (main/section/header/footer)');

  // Quality warnings — non-fatal, and the trigger for the agent's repair turn.
  const styleText = `${cssText}\n${html}`;
  const defined = new Set([...styleText.matchAll(/--([a-z0-9-]+)\s*:/gi)].map((match) => match[1].toLowerCase()));
  const undefinedTokens = [...new Set(
    [...styleText.matchAll(/var\(\s*--([a-z0-9-]+)\s*(,)?/gi)]
      .filter((match) => !match[2] && !defined.has(match[1].toLowerCase()))
      .map((match) => match[1]),
  )];
  if (undefinedTokens.length) warnings.push(`undefined css custom properties: ${undefinedTokens.join(', ')}`);
  if (/\balert\s*\(/.test(jsText)) warnings.push('js uses alert() — replace with inline UI feedback');
  if (!/prefers-reduced-motion/.test(styleText)) warnings.push('no prefers-reduced-motion block');
  if (cssText.length && !/@media/.test(styleText)) warnings.push('no responsive @media block');

  return {
    ok: issues.length === 0,
    summary: issues.length ? issues.join('; ') : `${htmlRel} + ${cssRels.join(', ') || 'inline css'} + ${jsRels.join(', ') || 'inline js'}`,
    issues,
    warnings,
    files: { html: htmlRel, css: cssRels, js: jsRels },
    agentSteps: agent.stepCount,
  };
}