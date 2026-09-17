/** Visual + responsive + a11y verification over emitted HTML/CSS.
 * Upgraded: real CODE → SEE → CRITIQUE → FIX signals instead of 4-line heuristics.
 * Every check names the file/selector when possible so the repair pass is targeted.
 */
export function verifyResponsive({ css }) {
  const issues = [];
  if (!/@media[^{]*max-width:\s*40rem/.test(css ?? '')) issues.push('missing mobile breakpoint (40rem)');
  if (!/@media[^{]*max-width:\s*60rem/.test(css ?? '')) issues.push('missing tablet breakpoint (60rem)');
  if (!/\.container/.test(css ?? '')) issues.push('missing container rule');
  if (!/grid-template-columns|flex/.test(css ?? '')) issues.push('no grid/flex layout system detected');
  if (/overflow-x\s*:\s*hidden\s*!important/.test(css ?? '')) issues.push('overflow-x hidden !important masks real overflow — fix the layout instead');
  return { ok: issues.length === 0, issues, score: Math.max(0, 100 - issues.length * 20) };
}
export function verifyA11y({ html, css }) {
  const issues = [];
  if (!/aria-expanded/.test(html ?? '')) issues.push('no disclosure widgets found (expected for nav/faq)');
  if (!/aria-invalid/.test(html ?? '')) issues.push('form validation does not set aria-invalid');
  if (!/prefers-reduced-motion/.test(css ?? '')) issues.push('no reduced-motion path');
  if (!/:focus-visible/.test(css ?? '')) issues.push('no focus-visible ring');
  if (!/<html lang=/.test(html ?? '')) issues.push('missing <html lang>');
  if (!/skip to content/i.test(html ?? '')) issues.push('missing skip link');
  if (/<img(?![^>]*alt=)/i.test(html ?? '')) issues.push('img without alt text');
  return { ok: issues.filter((i) => /focus|reduced|lang|skip/.test(i)).length === 0, issues, score: Math.max(0, 100 - issues.length * 12) };
}
/** Heuristic visual critique at 3 viewports without a browser. */
export function verifyVisual({ html, css, plan }) {
  const notes = [];
  const fixes = [];
  const sections = plan?.sections ?? [];
  if (sections.length < 2) { notes.push('page has fewer than 2 sections — likely thin'); fixes.push({ area: 'composition', fix: 'Add the missing recipe sections (proof/features/cta/footer), not more hero copy' }); }
  if ((html ?? '').length < 4000) { notes.push('markup is small; check for real copy in every section'); fixes.push({ area: 'content', fix: 'Write specific copy per section — no lorem, no TODO' }); }
  if (!/\.hero__object|\.hero-webgl|\.hero__orb|\[data-pin\]/.test(css ?? '')) { notes.push('hero lacks a focal object/depth layer'); fixes.push({ area: 'hero', fix: 'Give the hero one focal object (CSS depth or bounded WebGL), not a flat centered block' }); }
  if (!/\[data-reveal\]|\.scroll-reveal|ScrollTrigger/.test(`${css ?? ''}${html ?? ''}`)) { notes.push('no reveal system — page may feel static'); fixes.push({ area: 'motion', fix: 'Add one reveal system (IO or single ScrollTrigger timeline), one easing family' }); }
  const h1 = (String(html).match(/<h1/gi) ?? []).length;
  if (h1 !== 1) { notes.push(`h1 count = ${h1}, want exactly 1`); fixes.push({ area: 'hierarchy', fix: 'Exactly one h1; section titles become h2 in order' }); }
  if (!/--color-accent/.test(css ?? '')) { notes.push('no accent token — palette has no signal color'); fixes.push({ area: 'tokens', fix: 'Define --color-accent in :root and use it sparingly' }); }
  if (!/hero[\s\S]{0,600}?(asymmetr|grid-template-columns:\s*7fr|overlap|full-bleed|editorial)/i.test(`${html ?? ''}${css ?? ''}`)) notes.push('hero composition looks symmetric/template-like — consider asymmetry, overlap, or full-bleed figure');
  const score = Math.max(0, 92 - notes.length * 8);
  return {
    ok: score >= 70, score, notes, fixes,
    viewports: [390, 834, 1440].map((w) => ({ width: w, overflowRisk: /grid-template-columns:\s*7fr 5fr/.test(css ?? '') && w < 700 ? 'hero split must collapse (covered by media query)' : 'ok' })),
  };
}
export function verifyAll({ html, css, plan }) {
  const responsive = verifyResponsive({ css });
  const a11y = verifyA11y({ html, css });
  const visual = verifyVisual({ html, css, plan });
  const score = Math.round((responsive.score + a11y.score + visual.score) / 3);
  return { responsive, a11y, visual, score, ok: responsive.ok && a11y.ok };
}
/**
 * Visual QA pass: CODE → SEE → CRITIQUE → FIX.
 * Static SEE (no browser): re-read emitted files, run all verifiers + the
 * anti-generic gate, and return targeted fixes (max 5, weakest first).
 */
export function visualQa({ html = '', css = '', plan, staticV, spec } = {}) {
  const all = verifyAll({ html, css, plan });
  const seen = new Map();
  const push = (area, fix, source) => {
    const key = `${area}:${fix}`;
    if (!seen.has(key)) seen.set(key, { area, fix, source });
  };
  for (const issue of [...all.responsive.issues, ...all.a11y.issues]) push('correctness', String(issue), 'verify');
  for (const fix of all.visual.fixes ?? []) push(fix.area, fix.fix, 'visual');
  for (const note of all.visual.notes ?? []) {
    if ([...seen.values()].some((f) => note.includes(f.area))) continue;
    push('polish', String(note), 'visual');
  }
  const ordered = [...seen.values()].sort((a, b) => rankArea(a.area) - rankArea(b.area)).slice(0, 5);
  return { score: all.score, ok: all.ok && all.visual.score >= 70, issues: [...all.responsive.issues, ...all.a11y.issues], notes: all.visual.notes, fixes: ordered, viewports: all.visual.viewports, spec: spec ? { depth: spec.tech?.depth, motion: (spec.motion?.layers ?? []).map((l) => l.layer) } : undefined, staticScore: staticV?.score };
}
function rankArea(area) {
  const order = ['correctness', 'hierarchy', 'composition', 'hero', 'tokens', 'content', 'motion', 'polish'];
  const i = order.indexOf(String(area));
  return i === -1 ? 50 : i;
}

