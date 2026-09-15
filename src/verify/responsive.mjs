/** Visual + responsive + a11y verification over emitted HTML/CSS. */
export function verifyResponsive({ css }) {
  const issues = [];
  if (!/@media[^{]*max-width:\s*40rem/.test(css ?? '')) issues.push('missing mobile breakpoint (40rem)');
  if (!/@media[^{]*max-width:\s*60rem/.test(css ?? '')) issues.push('missing tablet breakpoint (60rem)');
  if (!/\.container/.test(css ?? '')) issues.push('missing container rule');
  return { ok: issues.length === 0, issues, score: Math.max(0, 100 - issues.length * 20) };
}
export function verifyA11y({ html, css }) {
  const issues = [];
  if (!/aria-expanded/.test(html ?? '')) issues.push('no disclosure widgets found (expected for nav/faq)');
  if (!/aria-invalid/.test(html ?? '')) issues.push('form validation does not set aria-invalid');
  if (!/prefers-reduced-motion/.test(css ?? '')) issues.push('no reduced-motion path');
  if (!/:focus-visible/.test(css ?? '')) issues.push('no focus-visible ring');
  return { ok: issues.filter((i) => /focus|reduced/.test(i)).length === 0, issues, score: Math.max(0, 100 - issues.length * 12) };
}
/** Heuristic visual critique at 3 viewports without a browser. */
export function verifyVisual({ html, css, plan }) {
  const notes = [];
  const sections = plan?.sections ?? [];
  if (sections.length < 2) notes.push('page has fewer than 2 sections — likely thin');
  if ((html ?? '').length < 4000) notes.push('markup is small; check for real copy in every section');
  if (!/\.hero__object/.test(css ?? '')) notes.push('hero lacks a focal object/depth layer');
  if (!/\[data-reveal\]/.test(css ?? '')) notes.push('no reveal system — page may feel static');
  const score = Math.max(0, 92 - notes.length * 8);
  return {
    ok: score >= 70, score, notes,
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
