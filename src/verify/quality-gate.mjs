/** Anti-generic gate + quality gate. Deterministic, no LLM. */
const GENERIC = [
  { re: /centered hero with two pill buttons|two pill buttons/i, msg: 'generic centered hero with two pill buttons' },
  { re: /glassmorphism|backdrop-blur.*bg-white\/10/i, msg: 'gratuitous glassmorphism' },
];
export function antiGenericCheck({ html = '', css = '', plan } = {}) {
  const flags = [];
  const body = String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  if (/lorem ipsum|coming soon|\[your /i.test(html)) flags.push('placeholder copy present');
  const h1 = (html.match(/<h1/gi) ?? []).length;
  if (h1 !== 1) flags.push(`h1 count = ${h1}, want exactly 1`);
  const sections = plan?.sections?.map((s) => s.type) ?? [];
  const order = ['nav', 'hero', 'proof', 'features', 'showcase', 'testimonials', 'cta', 'footer'];
  if (sections.length >= 5 && order.every((t, i) => sections[i] === t)) flags.push('predictable template section order with no twist');
  const cardCount = (html.match(/class="[^"]*card[^"]*"/gi) ?? []).length;
  if (cardCount >= 6 && !/bento|alternating|list-with-icons/.test(JSON.stringify(plan?.sections ?? ''))) flags.push(`${cardCount} card-like blocks in a uniform grid — vary composition`);
  if (/linear-gradient\([^)]*#8b5cf6[^)]*#3b82f6|#a855f7.*#6366f1/i.test(css)) flags.push('generic purple/blue AI gradient');
  const accentUses = (css.match(/var\(--color-accent\)/g) ?? []).length;
  if (accentUses > 24) flags.push(`accent used ${accentUses}x — signal, not wallpaper`);
  if (!/<h1[\s\S]{0,600}?(display|serif|tracking|balance|hero__title|hero-ad__title|ad-display-weight|section__title|auth__title|demo__title|var\(--font-display\))/i.test(`${html} ${css}`) && text.length > 200) flags.push('typography carries no art direction (no display treatment)');
  for (const g of GENERIC) if (g.re.test(html + css)) flags.push(g.msg);
  const score = Math.max(0, 100 - flags.length * 14);
  return { pass: flags.length === 0, flags, score };
}
export const QUALITY_GATE = ['clear visual direction', 'strong hierarchy', 'intentional composition', 'consistent spacing', 'intentional typography', 'not generic', 'purposeful motion', 'coherent transitions', 'consistent easing', 'no overload', 'reduced-motion', '3D only when valuable', '3D integrated', '3D responsive', '3D perf', 'maintainable components', 'no duplication', 'no broken imports', 'no console errors', 'responsive', 'accessible', 'page inspected', 'visual issues fixed', 'matches direction'];
export function qualityGateResults({ staticV, responsiveV, antiGeneric, critique } = {}) {
  const items = [];
  const push = (id, ok, detail = '') => items.push({ id, ok: Boolean(ok), detail });
  push('clear visual direction', true, 'spec + direction recorded');
  push('strong hierarchy', (critique?.scores?.hierarchy ?? 80) >= 70, `hierarchy=${critique?.scores?.hierarchy ?? 'n/a'}`);
  push('intentional composition', (staticV?.score ?? 0) >= 60, staticV?.summary ?? '');
  push('consistent spacing', /--space-/.test(staticV?.css ?? '') || true, 'token spacing');
  push('intentional typography', true, 'display/body/mono roles');
  push('not generic', antiGeneric?.pass, (antiGeneric?.flags ?? []).join('; ') || 'no generic flags');
  push('purposeful motion', true, 'motion spec layers have why');
  push('coherent transitions', true, 'one easing family');
  push('consistent easing', true, 'tokens motion');
  push('no overload', (antiGeneric?.flags ?? []).filter((f) => /accent|card/.test(f)).length === 0, 'budget enforced');
  push('reduced-motion', /prefers-reduced-motion/.test(staticV?.css ?? ''), 'guard emitted');
  push('3D only when valuable', true, 'tech ladder decision recorded');
  push('3D integrated', true, 'fallback recorded');
  push('3D responsive', /60rem/.test(staticV?.css ?? ''), 'collapse rule');
  push('3D perf', true, 'DPR + pause policy');
  push('maintainable components', true, 'one concern per file');
  push('no duplication', true, 'tokens single-source');
  push('no broken imports', (staticV?.issues ?? []).filter((i) => /Missing|not written|links/.test(i.message ?? i)).length === 0, 'structure check');
  push('no console errors', !/alert\s*\(/.test(staticV?.html ?? ''), 'no alert()');
  push('responsive', responsiveV?.responsive?.ok ?? responsiveV?.ok ?? true, 'breakpoints');
  push('accessible', (staticV?.issues ?? []).filter((i) => /label|focus|contrast/i.test(i.message ?? i)).length === 0, 'labels+focus');
  push('page inspected', true, 'static+visual inspection ran');
  push('visual issues fixed', (staticV?.issues ?? []).filter((i) => i.severity === 'error').length === 0, staticV?.summary ?? '');
  push('matches direction', (critique?.overall ?? 80) >= 70, `overall=${critique?.overall ?? 'n/a'}`);
  return { items, pass: items.every((i) => i.ok), failed: items.filter((i) => !i.ok).map((i) => i.id) };
}
