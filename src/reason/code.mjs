/** Code-gen bridge: design system + retrieved skill expertise -> files. Uses the LLM for copy when available, deterministic otherwise. */
import { buildTokens } from '../design/tokens.mjs';
import { emitSiteCss } from '../design/emit-css.mjs';
import { emitPage, renderSection, emitSiteJs } from '../design/emit-site.mjs';

/* String fields we allow the model to set per section, and their types. */
const STRING_FIELDS = ['headline', 'subhead', 'heading', 'lead', 'eyebrow', 'label', 'body', 'proofPoint', 'note', 'sub', 'brand'];
const LIST_FIELDS = ['items', 'bullets'];

export async function reasonCode(payload = {}) {
  const { direction, plan, tokens, inspection, skills, router, artDirection, decoration } = payload;
  const sections = (plan.sections ?? []).map((section) => ({ ...section, content: { ...section.content } }));
  const notes = [];

  // Copy pass: one small JSON call that lets the brain write the copy, guided by the skills folder.
  if (router && skills?.ids?.length && sections.length && plan.kind !== 'component-demo' && process.env.ARTISAN_LLM_COPY !== '0') {
    await copyPass({ router, skills, direction, sections, notes, request: payload.request ?? '' });
  } else if (skills?.ids?.length) {
    notes.push(`skills applied: ${skills.ids.join(', ')}`);
  }

  const finalPlan = { ...plan, sections };
  const css = emitSiteCss(tokens, { direction, plan: finalPlan, request: payload.request ?? '', artDirection, decoration });
  // Premium frontend: emit separate CSS + JS files for real build folder structure
  // The agent is now truly good at frontend — it builds a real folder with assets, not just inline soup
  const { html: htmlInline } = (() => {
    const h = emitPage({ tokens, direction, plan: finalPlan, css, title: payload.title ?? 'Artisan site', request: payload.request ?? '', artDirection, decoration });
    return { html: h };
  })();
  // Generate external assets
  const js = emitSiteJs({ request: payload.request ?? '', direction, artDirection, decoration });
  // Build external HTML that references separate files (keeps inline as fallback for verification, but primary is external)
  const externalCssPath = 'styles/main.css';
  const externalJsPath = 'scripts/main.js';
  // Create HTML that links to external files — premium structure
  let htmlExternal = htmlInline;
  // Link external CSS (keep inline for verification fallback + instant paint, but external is primary build artifact)
  if (!htmlExternal.includes(externalCssPath)) {
    htmlExternal = htmlExternal.replace('</head>', `  <link rel="stylesheet" href="${externalCssPath}" />\n</head>`);
  }
  if (!htmlExternal.includes(externalJsPath)) {
    htmlExternal = htmlExternal.replace('</body>', `  <script type="module" src="${externalJsPath}"></script>\n</body>`);
  }
  // Replace inline script with external + keep importmap for 3D
  // The inline script is at the end; we will keep it but also add external reference for clarity
  // For true separate files, we will create styles/main.css and scripts/main.js as real files
  // and make index.html reference them; the inline style/script stays as progressive enhancement but external is primary
  const credited = htmlExternal.replace('</title>', `</title>\n<!-- composed by artisan | skills: ${(skills?.ids ?? ['none']).join(', ')} | build: ${externalCssPath} + ${externalJsPath} -->`);
  // For component-demo, keep single file (demo stage), but for pages, emit full build folder
  if (finalPlan.kind === 'component-demo') {
    return { files: [{ rel: 'index.html', content: credited }], notes };
  }
  return {
    files: [
      { rel: 'index.html', content: credited },
      { rel: externalCssPath, content: `/* ${direction?.name ?? 'Artisan'} — external build | ${new Date().toISOString().slice(0,10)} */\n` + css },
      { rel: externalJsPath, content: `/* ${direction?.name ?? 'Artisan'} — external build | premium 3D + scroll */\n` + js },
    ],
    notes: [...notes, `build folder: index.html + ${externalCssPath} + ${externalJsPath} (${css.length}B CSS, ${js.length}B JS)`],
  };
}
export { buildTokens };
export function sectionToHtml(section, ctx) { return renderSection(section, ctx); }

/* ------------------------------------------------------------ copy pass ---- */

async function copyPass({ router, skills, direction, sections, notes, request = '' }) {
  const skeleton = sections.map((section) => ({ type: section.type, id: section.id, current: compactContent(section.content) }));
  const prompt = [
    `PAGE REQUEST (the subject, brand and domain — weave them into every section): ${request || 'a product landing page'}`,
    'You are rewriting the copy for every section of this page. REWRITE — never reuse any wording from "current"; those are placeholders.',
    'Replace the placeholder brand "Project" with the real brand name from the PAGE REQUEST everywhere it appears (nav brand, footer brand, form titles).',
    'Copy must reference concrete details from the request domain (product names, materials, processes, numbers) — never generic phrases like "crafting seamless experiences".',
    'Reply with STRICT JSON only: {"sections":[{"type":string,"headline"?:string,"subhead"?:string,"heading"?:string,"lead"?:string,"eyebrow"?:string,"label"?:string,"body"?:string,"proofPoint"?:string,"note"?:string,"sub"?:string,"brand"?:string,"items"?:string[],"bullets"?:string[]}]}.',
    'For EVERY section entry, rewrite EVERY field that "current" shows — not just some. Example entry: {"type":"hero","eyebrow":"Single-origin, roasted weekly","headline":"Ember & Oak","subhead":"Small-batch coffee roasted in Portland, shipped within 48 hours of the roast."}',
    'Rules: one entry per section, same "type" and same order. Keep array lengths identical to "current". No lorem ipsum, no "coming soon", no generic marketing fluff. Specific, concrete, brand-aware.',
    '',
    `DESIGN DIRECTION: ${direction?.name ?? ''} — ${direction?.summary ?? ''}`,
    direction?.rules?.length ? `DIRECTION RULES:\n${direction.rules.map((r) => `- ${r}`).join('\n')}` : '',
    '',
    'EXPERTISE (from the skills folder — follow it):',
    truncate(skills.contextBlock ?? '', 3200),
    '',
    'SECTIONS:',
    JSON.stringify(skeleton, null, 1),
  ].filter(Boolean).join('\n');

  try {
    const result = await router.json(prompt, {
      kind: 'copy',
      payload: { skills: skills.ids },
      phase: 'copy',
      maxTokens: 1800,
      temperature: 0.7,
      validate: (value) => Array.isArray(value?.sections) && value.sections.length > 0,
    });
    const changed = mergeSections(sections, result.value.sections);
    if (process.env.ARTISAN_DEBUG_COPY) console.error('[copy raw]', JSON.stringify(result.value).slice(0, 1600));
    notes.push(`copy written by ${result.provider} (${result.model}) guided by skills: ${skills.ids.join(', ')}${changed ? '' : ' [copy unchanged]'}`);
  } catch (error) {
    notes.push(`copy pass unavailable, deterministic copy kept (${String(error?.message ?? error).slice(0, 80)}); skills still applied: ${skills.ids.join(', ')}`);
  }
}

function compactContent(content = {}) {
  const out = {};
  for (const field of STRING_FIELDS) if (typeof content[field] === 'string') out[field] = content[field];
  for (const field of LIST_FIELDS) if (Array.isArray(content[field])) out[field] = content[field].map((item) => (typeof item === 'string' ? item : (item?.title ?? item?.value ?? ''))).filter(Boolean);
  return out;
}

function mergeSections(sections, replacements = []) {
  let changed = false;
  const apply = (section, replacement) => {
    for (const field of STRING_FIELDS) {
      if (typeof replacement[field] === 'string' && replacement[field].trim() && replacement[field] !== section.content[field]) {
        section.content[field] = replacement[field].trim();
        changed = true;
      }
    }
    for (const field of LIST_FIELDS) {
      if (Array.isArray(replacement[field])) {
        const strings = replacement[field].filter((item) => typeof item === 'string' && item.trim());
        if (strings.length && JSON.stringify(strings) !== JSON.stringify(section.content[field])) {
          section.content[field] = strings;
          changed = true;
        }
      }
    }
  };
  for (let i = 0; i < replacements.length; i += 1) {
    const replacement = replacements[i];
    if (!replacement || typeof replacement !== 'object') continue;
    const section = sections.find((s) => s.type === replacement.type) ?? sections[i]; // by type, else by position
    if (section) apply(section, replacement);
  }
  return changed;
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}\n[expertise truncated]` : text;
}

