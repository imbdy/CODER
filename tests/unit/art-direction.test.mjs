import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ART_DIRECTIONS, chooseArtDirection, decorationFor, applyArtDirection, artDirectionBlock, renderArtHero, emitArtDirectionCss, COMPOSITIONS } from '../../src/design/art-direction.mjs';
import { copyFor, coinBrand, brandFromRequest, isPlaceholderBrand, lexiconFor } from '../../src/design/copy.mjs';
import { buildTokens } from '../../src/design/tokens.mjs';
import { contrastRatio } from '../../src/design/color.mjs';
import { isBuildBrief, decideExecution } from '../../src/runtime/triggers.mjs';

const BASE = buildTokens({ direction: { id: 'x', theme: 'dark', neutral: 'cool', accent: '#888888', fonts: {}, motion: {} } });
const COMMODITY = /\b(Inter|Roboto|Open Sans|Lato|Arial|Helvetica)\b/;

describe('art directions', () => {
  it('every identity is complete, distinct and never uses a commodity face', () => {
    assert.ok(ART_DIRECTIONS.length >= 8);
    const ids = new Set();
    const accents = new Set();
    for (const d of ART_DIRECTIONS) {
      assert.ok(!ids.has(d.id), `duplicate id ${d.id}`);
      ids.add(d.id);
      accents.add(d.accent);
      assert.ok(COMPOSITIONS.includes(d.composition), `${d.id}: unknown composition ${d.composition}`);
      assert.ok(d.sentence.length > 40, `${d.id}: needs a one-sentence identity`);
      assert.ok(d.signature && d.risk, `${d.id}: needs a signature move and a justified risk`);
      assert.ok(['editorial', 'severe', 'technical', 'warm', 'direct'].includes(d.voice), `${d.id}: voice`);
      assert.ok(!COMMODITY.test(d.fonts.display), `${d.id}: commodity display face`);
      assert.ok(d.fonts.google.length >= 2, `${d.id}: needs real font families`);
      assert.match(d.accent, /^#[0-9a-f]{6}$/i);
      assert.ok(d.decoration.length <= 2, `${d.id}: decoration budget is 2`);
      // The substrate is a considered colour, never pure black or pure white.
      assert.notEqual(d.substrate.bg.toLowerCase(), '#000000');
      assert.notEqual(d.substrate.bg.toLowerCase(), '#ffffff');
    }
    assert.ok(accents.size >= 7, 'accents must differ across identities');
    assert.ok(!ART_DIRECTIONS.some((d) => d.composition === 'centered-stage'), 'no centred-stack hero exists');
  });

  it('picks a cinematic dark identity for the premium brief and penalises the rejected look', () => {
    const request = 'landing page for an AI developer tool, premium, cinematic, immersive, strong visual storytelling, beautiful typography, subtle motion, 3D where it makes sense';
    const agreed = { visual: ['premium', 'cinematic', 'immersive'], avoid: ['generic AI SaaS landing page'], emphasis: ['beautiful typography'] };
    const chosen = chooseArtDirection({ request, agreed });
    assert.ok(['midnight-editorial', 'cinema-noir'].includes(chosen.direction.id), `got ${chosen.direction.id}`);
    assert.equal(chosen.direction.theme, 'dark');
    assert.ok(chosen.reasons.length, 'the choice is explained');
    const saas = chosen.alternatives.find((a) => a.id === 'instrument-precision');
    assert.ok(!saas || saas.score < chosen.score, 'the rejected AI/SaaS look ranks lower');
  });

  it('respects an explicitly rejected substrate and honours a light brief', () => {
    const light = chooseArtDirection({ request: 'warm paper, quiet, luxury brand site', agreed: { avoid: ['dark'] } });
    assert.equal(light.direction.theme, 'light');
    const dark = chooseArtDirection({ request: 'moody dark cinematic product page' });
    assert.equal(dark.direction.theme, 'dark');
  });
});

describe('decoration budget', () => {
  it('drops layers the user rejected and only earns a canvas when 3D is wanted', () => {
    const direction = ART_DIRECTIONS.find((d) => d.id === 'midnight-editorial');
    const plain = decorationFor(direction, { request: 'clean landing page', agreed: {} });
    assert.equal(plain.canvas, false);
    assert.ok(plain.layers.length <= plain.budget);
    const withDepth = decorationFor(direction, { request: 'landing page with subtle 3D depth', agreed: {} });
    assert.equal(withDepth.canvas, true);
    assert.match(withDepth.canvasReason, /DPR|paused|fallback/i);
    const rejected = decorationFor(direction, { request: 'landing page with 3D', agreed: { avoid: ['3D', 'grain'] } });
    assert.equal(rejected.canvas, false);
    assert.ok(!rejected.layers.includes('grain'));
    assert.ok(rejected.dropped.some((d) => /grain/.test(d)));
  });
});

describe('tokens from an art direction', () => {
  it('guarantees WCAG-readable muted text on every surface, not just the background', () => {
    for (const direction of ART_DIRECTIONS) {
      const tokens = applyArtDirection(BASE, direction);
      const grounds = [direction.substrate.bg, direction.substrate.surface, direction.substrate.surfaceAlt];
      for (const [name, colour] of [['text', tokens.text.primary], ['muted', tokens.text.secondary], ['faint', tokens.text.tertiary]]) {
        for (const ground of grounds) {
          const ratio = contrastRatio(colour, ground);
          assert.ok(ratio >= 4.5, `${direction.id}: ${name} ${colour} on ${ground} is ${ratio.toFixed(2)}:1`);
        }
      }
      assert.equal(tokens.diagnostics.passAA, true, `${direction.id} passAA`);
      // nothing readable below 12.8px
      for (const [key, value] of Object.entries(tokens.fontSizes)) {
        const rem = /^([\d.]+)rem$/.exec(String(value));
        if (rem) assert.ok(Number(rem[1]) >= 0.8, `${direction.id}: --text-${key} is ${value}`);
      }
      assert.ok(!COMMODITY.test(tokens.fonts.display), `${direction.id}: display face`);
    }
  });
});

describe('hero markup and css', () => {
  it('renders every composition without a centred stack or two pill buttons', () => {
    const content = { eyebrow: 'Eyebrow', headline: 'Read the whole codebase. Ship the right change.', subhead: 'A real supporting line.', primaryCta: { label: 'Start', href: '#start' }, secondaryCta: { label: 'How it works', href: '#how' }, proofPoint: '41% fewer review cycles', rail: ['41% fewer cycles', '1.2s index'] };
    for (const direction of ART_DIRECTIONS) {
      const decoration = decorationFor(direction, { request: 'with 3D depth', agreed: {} });
      const html = renderArtHero(content, direction, decoration);
      assert.match(html, /<h1 class="hero-ad__title"/, `${direction.id}: one h1`);
      assert.equal((html.match(/<h1/g) ?? []).length, 1);
      assert.ok(!/hero--centered/.test(html));
      // exactly one primary action; the secondary is a link, not a second pill
      assert.equal((html.match(/hero-ad__cta/g) ?? []).length, 1, `${direction.id}: one primary CTA`);
      assert.match(html, /hero-ad__link/);
      // the signature italic emphasis is applied to one word only
      assert.equal((html.match(/<em>/g) ?? []).length, 1, `${direction.id}: one emphasised word`);
      if (decoration.canvas) assert.match(html, /data-ad-canvas/);
      const css = emitArtDirectionCss(direction, decoration);
      assert.match(css, /html\[data-js\] \[data-reveal\]/, 'reveals only hide when JS is alive');
      assert.match(css, /prefers-reduced-motion/);
      assert.match(css, /hero-ad__title/);
      // the accent reaches the stylesheet as a token, never as a hardcoded hex
      assert.match(css, /var\(--color-accent/, `${direction.id}: accent used via token`);
      assert.ok(!new RegExp(`color:\\s*${direction.accent}`, 'i').test(css), `${direction.id}: no hardcoded accent`);
    }
  });

  it('describes the identity for prompts and run records', () => {
    const direction = ART_DIRECTIONS[0];
    const block = artDirectionBlock(direction, decorationFor(direction, { request: '3d depth', agreed: {} }));
    for (const key of ['ART DIRECTION', 'substrate', 'accent', 'type:', 'hero composition', 'decoration budget', 'signature move', 'justified risk', 'copy voice']) {
      assert.ok(block.includes(key), `block missing ${key}`);
    }
    assert.match(block, /never a centered stack/i);
  });
});

describe('copy', () => {
  const FILLER = [/everything (you|your team) needs?/i, /powerful yet simple/i, /coming soon/i, /lorem ipsum/i, /get started today/i, /next level/i, /seamless/i, /supercharge/i, /unlock your/i];

  it('takes a stated brand and coins one otherwise', () => {
    assert.equal(brandFromRequest('Build a landing page for a coffee brand called "Ember & Oak"'), 'Ember & Oak');
    assert.equal(brandFromRequest('landing page for my AI developer tool'), '');
    assert.ok(isPlaceholderBrand('Codebase'));
    assert.ok(isPlaceholderBrand('Platform'));
    assert.ok(!isPlaceholderBrand('Ember & Oak'));
    const a = coinBrand('ai developer tool brief', 'ai');
    assert.equal(a, coinBrand('ai developer tool brief', 'ai'), 'coining is deterministic');
    assert.ok(!isPlaceholderBrand(a));
  });

  it('writes domain-specific copy in every voice with no filler', () => {
    for (const domain of ['ai', 'developer tool', 'software', 'speciality coffee', 'hospitality', 'creative portfolio', 'education']) {
      for (const voice of ['editorial', 'severe', 'technical', 'warm', 'direct']) {
        const copy = copyFor({ domain, voice, request: `a ${domain} landing page` });
        const all = [copy.headline, copy.lede, copy.eyebrow, copy.proofPoint, ...copy.features.map((f) => `${f.title} ${f.body}`)].join(' ');
        for (const filler of FILLER) assert.ok(!filler.test(all), `${domain}/${voice}: filler "${filler}" in "${all.slice(0, 120)}"`);
        assert.ok(copy.headline.length > 10 && copy.headline.length < 90, `${domain}/${voice}: headline length`);
        assert.equal(copy.features.length, 3);
        assert.ok(copy.navCta.label.length <= 14, `${domain}/${voice}: nav CTA is short`);
        // the lede names something concrete from the domain
        const lex = lexiconFor(domain);
        const concrete = [lex.unit, lex.artifact, lex.actor, lex.place, lex.ritual, lex.pain].filter(Boolean);
        assert.ok(concrete.some((word) => copy.lede.toLowerCase().includes(String(word).toLowerCase())), `${domain}/${voice}: lede is not concrete: ${copy.lede}`);
      }
    }
  });

  it('gives a craft domain craft copy, not codebase copy', () => {
    const coffee = copyFor({ domain: 'speciality coffee', voice: 'editorial', request: 'coffee roaster site' });
    assert.equal(coffee.family, 'craft');
    assert.ok(!/codebase|repository|diff/i.test(`${coffee.headline} ${coffee.lede}`));
    const ai = copyFor({ domain: 'ai', voice: 'editorial', request: 'ai dev tool' });
    assert.equal(ai.family, 'tech');
  });
});

describe('a brief is an instruction', () => {
  it('executes a directed brief immediately, and still refuses vague or exploratory turns', () => {
    const brief = 'I want to build a landing page for my AI developer tool. I want it premium, cinematic and immersive, not a generic AI SaaS page, with beautiful typography and subtle motion.';
    assert.equal(isBuildBrief(brief).brief, true);
    assert.equal(decideExecution({ text: brief }).execute, true);
    // a bare wish is not a brief
    assert.equal(decideExecution({ text: 'I want a landing page for an AI developer tool.' }).execute, false);
    // exploration is never execution
    for (const t of ['What if the hero had 3D depth?', 'Maybe we could try a liquid effect.', 'How would you build this?']) {
      assert.equal(decideExecution({ text: t }).execute, false, t);
    }
    // once something exists, a new brief is discussed rather than overwriting it
    assert.equal(decideExecution({ text: brief, hasBuild: true }).execute, false);
  });
});
