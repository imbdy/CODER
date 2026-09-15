import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../../src/skills/frontmatter.mjs';
import { reasonUnderstand, classifyTaskType } from '../../src/reason/understand.mjs';
import { planStepsFor } from '../../src/reason/plan.mjs';
import { rankDirections } from '../../src/design/directions.mjs';
import { buildTokens } from '../../src/design/tokens.mjs';
import { composePage } from '../../src/design/compose.mjs';
import { emitSiteCss } from '../../src/design/emit-css.mjs';
import { emitPage, renderNav, renderHero, renderForm, renderFaq, emitSiteJs } from '../../src/design/emit-site.mjs';
import { verifyStatic } from '../../src/verify/static.mjs';
describe('frontmatter', () => {
  it('parses skill headers', () => {
    const { data, body } = parseFrontmatter('---\nname: foo\ntriggers: [a, b]\n---\nHello');
    assert.equal(data.name, 'foo');
    assert.deepEqual(data.triggers, ['a', 'b']);
    assert.equal(body, 'Hello');
  });
});
describe('understanding', () => {
  it('classifies core intents', () => {
    assert.equal(classifyTaskType('Build me a simple red button'), 'create-component');
    assert.equal(classifyTaskType('Build me a premium login screen'), 'create-page');
    assert.equal(classifyTaskType('Make the login screen feel more premium'), 'enhance');
    assert.equal(classifyTaskType('Make the whole thing responsive'), 'responsive');
    assert.equal(reasonUnderstand({ request: 'Build me a simple red button' }).scope, 'component');
  });
});
describe('planning', () => {
  it('emits scoped steps', () => {
    const page = planStepsFor({ understanding: { taskType: 'create-page', scope: 'page' }, inspection: { framework: 'unknown' } });
    const comp = planStepsFor({ understanding: { taskType: 'create-component', scope: 'component' }, inspection: {} });
    assert.ok(page.length >= 4 && comp.length === 3);
  });
});
describe('design system', () => {
  it('ranks, tokens, composes, emits and verifies', () => {
    const ranked = rankDirections({ request: 'premium login screen', taskType: 'create-page', inspection: {} });
    assert.ok(ranked[0]?.direction?.id);
    const tokens = buildTokens({ direction: ranked[0].direction, existing: {}, intent: 'create' });
    assert.match(tokens.accent, /^#/);
    const page = composePage({ request: 'premium login screen', taskType: 'create-page', projectKind: 'auth-flow', direction: ranked[0].direction });
    assert.equal(page.sections[0].type, 'form');
    const css = emitSiteCss(tokens, { direction: ranked[0].direction, plan: page });
    assert.ok(css.includes('--color-accent') && css.includes('prefers-reduced-motion') && css.includes('@media'));
    const html = emitPage({ tokens, direction: ranked[0].direction, plan: page, css, title: 'Login' });
    assert.ok(html.includes('data-auth-form') && html.includes('<h1'));
    const v = verifyStatic({ html, css, plan: page });
    assert.equal(v.ok, true);
  });
  it('renders nav/hero/faq with a11y hooks', () => {
    assert.ok(renderNav({ brand: 'B', links: ['A'], cta: { label: 'Go', href: '#' } }).includes('aria-expanded'));
    assert.ok(renderHero({ headline: 'H', subhead: 'S' }).includes('<h1'));
    assert.ok(renderFaq({ items: [{ q: 'Q', a: 'A' }] }).includes('data-faq-q'));
    assert.ok(renderForm({ title: 'T', fields: [] }).includes('novalidate'));
    assert.ok(emitSiteJs().includes('prefers-reduced-motion'));
  });
});
