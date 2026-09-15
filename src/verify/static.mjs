/** Static verification: structure, a11y, anti-slop, responsive, tokens. */
const SLOP = [/lorem ipsum/i, /dolor sit amet/i, /todo:? /i, /coming soon/i, /\[your .* here\]/i, /placeholder image/i, /click here/i];
export function verifyStatic({ html, css, plan }) {
  const issues = [];
  const add = (severity, check, message) => issues.push({ severity, check, message });
  if (!html || html.length < 800) add('error', 'not-empty', 'HTML output is suspiciously small');
  if (!/<!doctype html>/i.test(html ?? '')) add('error', 'doctype', 'Missing doctype');
  if (!/<html lang=/.test(html ?? '')) add('error', 'lang', 'Missing <html lang>');
  if (!/<title>[^<]{3,}<\/title>/.test(html ?? '')) add('error', 'title', 'Missing/empty <title>');
  if (!/name="viewport"/.test(html ?? '')) add('error', 'viewport', 'Missing viewport meta');
  if (!/skip to content/i.test(html ?? '')) add('warn', 'skip-link', 'Missing skip link');
  const h1 = (html.match(/<h1/g) ?? []).length;
  if (h1 !== 1) add(h1 === 0 ? 'error' : 'warn', 'h1', `Expected exactly 1 <h1>, found ${h1}`);
  if (!/:focus-visible/.test(css ?? '')) add('error', 'focus', 'Missing :focus-visible styles');
  if (!/prefers-reduced-motion/.test(css ?? '')) add('error', 'reduced-motion', 'Missing reduced-motion guard');
  if (!/<label/.test(html ?? '') && !/aria-label=/.test(html ?? '') && /<input/.test(html ?? '')) add('error', 'labels', 'Inputs without labels');
  for (const re of SLOP) if (re.test(html ?? '')) add('error', 'anti-slop', `Placeholder copy matched: ${re}`);
  const types = new Set((plan?.sections ?? []).map((s) => s.type));
  if (types.has('form') && !/data-auth-form/.test(html ?? '')) add('error', 'form-js', 'Auth form missing validation hook');
  if (!/var\(--color-/.test(css ?? '')) add('warn', 'tokens', 'CSS does not reference design tokens');
  if (!/@media/.test(css ?? '')) add('warn', 'responsive', 'No media queries emitted');
  const errors = issues.filter((i) => i.severity === 'error');
  const score = Math.max(0, 100 - errors.length * 12 - (issues.length - errors.length) * 3);
  return { ok: errors.length === 0, score, issues, summary: `${issues.length} issue(s), ${errors.length} error(s)` };
}
export function scoreToGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 78) return 'B';
  if (score >= 60) return 'C';
  return 'F';
}
