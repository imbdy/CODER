/**
 * CSS emitter — hand-written, tokenised stylesheet blocks.
 *
 * This is where design decisions become durable code: every rule references the token
 * variables, every interactive element carries its full state story (hover, focus,
 * active, disabled, loading), and responsive behaviour is authored per section rather
 * than left to a global shrink.
 */

import { tokensToCssVariables } from './css-vars.mjs';

export function emitBaseCss(tokens, { direction } = {}) {
  return `/* =============================================================
   ${direction?.name ?? 'Artisan'} — base layer
   Generated from design tokens. Change values in .forge/config.json
   or in the :root block below, never by editing rules ad hoc.
   ============================================================= */

${tokensToCssVariables(tokens)}

*,
*::before,
*::after { box-sizing: border-box; }

html {
  -webkit-text-size-adjust: 100%;
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.6;
  letter-spacing: var(--tracking-body);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

h1, h2, h3, h4 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: var(--weight-semibold);
  line-height: 1.08;
  letter-spacing: var(--tracking-display);
  text-wrap: balance;
}

p { margin: 0; text-wrap: pretty; }

a { color: inherit; text-underline-offset: 3px; }

img, svg, video { display: block; max-width: 100%; height: auto; }

button, input, select, textarea { font: inherit; color: inherit; }

:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
  border-radius: var(--radius-sm);
}

::selection { background: var(--color-accent); color: var(--color-on-accent); }

/* ---------------------------------------------------------------- layout ---- */

.container {
  width: 100%;
  max-width: var(--max-width);
  margin-inline: auto;
  padding-inline: var(--space-6);
}

.section { padding-block: var(--space-section); position: relative; }
.section--tight { padding-block: var(--space-12); }

.section__head {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: var(--prose-width);
  margin-bottom: var(--space-10);
}

.section__eyebrow {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.section__title { font-size: var(--text-3xl); letter-spacing: var(--tracking-heading); }

.lede { font-size: var(--text-lg); color: var(--color-text-muted); max-width: var(--prose-width); }

.hairline { border: 0; border-top: 1px solid var(--color-border); margin: 0; }

.stack { display: flex; flex-direction: column; }
.stack--xs { gap: var(--space-2); }
.stack--sm { gap: var(--space-4); }
.stack--md { gap: var(--space-6); }
.stack--lg { gap: var(--space-10); }

.cluster { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); }

.grid { display: grid; gap: var(--space-6); }
.grid--2 { grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); }
.grid--3 { grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); }
.grid--4 { grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); }

.visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.skip-link {
  position: absolute;
  top: var(--space-3);
  left: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: var(--color-accent);
  color: var(--color-on-accent);
  border-radius: var(--radius-sm);
  transform: translateY(-200%);
  transition: transform var(--duration-fast) var(--ease-standard);
  z-index: 100;
}
.skip-link:focus { transform: translateY(0); }
`;
}
/** Buttons, inputs, tags — the primitives every section reuses. */
export function emitControlsCss() {
  return `
/* ------------------------------------------------------------- controls ---- */

.btn {
  --btn-bg: var(--color-surface);
  --btn-fg: var(--color-text);
  --btn-border: var(--color-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 0.72em 1.25em;
  min-height: 2.75rem;
  border: 1px solid var(--btn-border);
  border-radius: var(--radius-md);
  background: var(--btn-bg);
  color: var(--btn-fg);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  text-decoration: none;
  cursor: pointer;
  position: relative;
  transition:
    transform var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}

.btn:hover {
  transform: translateY(calc(var(--motion-lift) * -1));
  box-shadow: var(--shadow-md);
  border-color: var(--color-border-strong);
}

.btn:active { transform: translateY(0) scale(0.98); transition-duration: var(--duration-instant); }

.btn[disabled],
.btn[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn[aria-busy='true'] { cursor: progress; }
.btn[aria-busy='true'] .btn__label { opacity: 0; }
.btn[aria-busy='true']::after {
  content: '';
  position: absolute;
  inset: 50% auto auto 50%;
  width: 1rem; height: 1rem;
  margin: -0.5rem 0 0 -0.5rem;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: artisan-spin 700ms linear infinite;
}

.btn--primary { --btn-bg: var(--color-accent); --btn-fg: var(--color-on-accent); --btn-border: transparent; }
.btn--primary:hover { --btn-bg: var(--color-accent-hover); box-shadow: var(--shadow-accentGlow); }

.btn--ghost { --btn-bg: transparent; }
.btn--ghost:hover { --btn-bg: var(--color-surface); }

.btn--quiet {
  --btn-bg: transparent;
  --btn-border: transparent;
  --btn-fg: var(--color-text-muted);
  padding-inline: var(--space-3);
}
.btn--quiet:hover { --btn-fg: var(--color-text); box-shadow: none; transform: none; }

.btn--block { width: 100%; }

.field { display: flex; flex-direction: column; gap: var(--space-2); }

.field__label { font-size: var(--text-sm); font-weight: var(--weight-medium); }

.field__control {
  width: 100%;
  padding: 0.75rem var(--space-4);
  min-height: 2.9rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard);
}

.field__control::placeholder { color: var(--color-text-faint); }
.field__control:hover { border-color: var(--color-border-strong); }
.field__control:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
}
.field__control[aria-invalid='true'] {
  border-color: #d64545;
  box-shadow: 0 0 0 3px rgb(214 69 69 / 0.18);
}

.field__meta { display: flex; justify-content: space-between; gap: var(--space-3); }
.field__hint, .field__error { font-size: var(--text-xs); color: var(--color-text-muted); }
.field__error { color: #e05a5a; display: none; }
.field[data-invalid='true'] .field__error { display: block; }
.field[data-invalid='true'] .field__hint { display: none; }

.checkbox { display: flex; align-items: center; gap: var(--space-3); font-size: var(--text-sm); color: var(--color-text-muted); }
.checkbox input { width: 1.05rem; height: 1.05rem; accent-color: var(--color-accent); }

.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0.25rem 0.6rem;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
}

@keyframes artisan-spin { to { transform: rotate(360deg); } }
`;
}
/** Navigation + hero (all layout variants). */
export function emitNavHeroCss() {
  return `
/* ------------------------------------------------------------------ nav ---- */

.nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background: color-mix(in oklab, var(--color-bg) 82%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid transparent;
  transition: border-color var(--duration-base) var(--ease-standard);
}
.nav[data-scrolled='true'] { border-bottom-color: var(--color-border); }

.nav__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  padding-block: var(--space-4);
}

.nav__brand {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-heading);
  text-decoration: none;
}

.nav__links { display: flex; align-items: center; gap: var(--space-6); }

.nav__link {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-decoration: none;
  position: relative;
  padding-block: var(--space-1);
  transition: color var(--duration-fast) var(--ease-standard);
}
.nav__link::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 1px;
  background: currentColor;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform var(--duration-base) var(--ease-emphasized);
}
.nav__link:hover { color: var(--color-text); }
.nav__link:hover::after { transform: scaleX(1); }

.nav__status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.nav__status::before {
  content: '';
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
}

.nav__toggle { display: none; }

/* ----------------------------------------------------------------- hero ---- */

.hero { padding-block: var(--space-sectionLg) var(--space-section); overflow: clip; }

.hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-bottom: var(--space-4);
}

.hero__title {
  font-size: var(--text-5xl);
  letter-spacing: var(--tracking-display);
  line-height: 0.98;
  max-width: 20ch;
}

.hero__sub {
  font-size: var(--text-lg);
  color: var(--color-text-muted);
  max-width: 48ch;
  margin-top: var(--space-6);
}

.hero__actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-8); }

.hero__proof {
  margin-top: var(--space-8);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-faint);
  letter-spacing: var(--tracking-caps);
}

.hero--split .hero__inner {
  display: grid;
  grid-template-columns: 7fr 5fr;
  align-items: center;
  gap: var(--space-12);
}

.hero--centered .hero__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-4);
}
.hero--centered .hero__title { max-width: 24ch; }
.hero--centered .hero__sub { margin-inline: auto; }
.hero--centered .hero__actions { justify-content: center; }

.hero--editorial .hero__inner { display: block; max-width: 62rem; }
.hero--editorial .hero__title { max-width: 16ch; }
.hero--editorial .hero__sub { margin-left: 5ch; }

.hero--product .hero__inner { display: grid; grid-template-columns: 1fr; gap: var(--space-10); }

.hero__object {
  position: relative;
  aspect-ratio: 4 / 3;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(120% 90% at 15% 10%, var(--color-accent-soft), transparent 60%),
    var(--color-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.hero__object::after {
  content: '';
  position: absolute;
  inset: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-image: linear-gradient(90deg, var(--color-border) 1px, transparent 1px),
    linear-gradient(180deg, var(--color-border) 1px, transparent 1px);
  background-size: 28px 28px;
  opacity: 0.45;
}
`;
}
/** Proof, metrics, features, showcase, process. */
export function emitContentCss() {
  return `
/* ---------------------------------------------------------------- proof ---- */

.proof { padding-block: var(--space-12); border-block: 1px solid var(--color-border); }
.proof__label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  color: var(--color-text-faint);
  margin-bottom: var(--space-6);
}
.proof__items {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-8) var(--space-12);
  align-items: baseline;
}
.proof__item {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  color: var(--color-text-muted);
  opacity: 0.8;
  transition: opacity var(--duration-base) var(--ease-standard), color var(--duration-base) var(--ease-standard);
}
.proof__item:hover { opacity: 1; color: var(--color-text); }

.metrics { display: grid; gap: var(--space-6); grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr)); }
.metric__value {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-variant-numeric: tabular-nums;
  letter-spacing: var(--tracking-heading);
}
.metric__label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  color: var(--color-text-faint);
  margin-top: var(--space-2);
}

/* ------------------------------------------------------------- features ---- */

.features--columns { display: grid; gap: var(--space-6); grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); }
.features--columns .feature {
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  transition: transform var(--duration-base) var(--ease-emphasized), box-shadow var(--duration-base) var(--ease-standard), border-color var(--duration-base) var(--ease-standard);
}
.features--columns .feature:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
  border-color: var(--color-border-strong);
}

.features--list { display: grid; border-top: 1px solid var(--color-border); }
.features--list .feature {
  display: grid;
  grid-template-columns: 3rem 1fr 2fr;
  gap: var(--space-6);
  align-items: baseline;
  padding-block: var(--space-8);
  border-bottom: 1px solid var(--color-border);
  transition: background-color var(--duration-base) var(--ease-standard);
}
.features--list .feature:hover { background: color-mix(in oklab, var(--color-surface) 65%, transparent); }

.features--bento { display: grid; gap: var(--space-6); grid-template-columns: repeat(6, 1fr); }
.features--bento .feature {
  grid-column: span 2;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}
.features--bento .feature:nth-child(1) { grid-column: span 4; }
.features--bento .feature:nth-child(2) { grid-column: span 2; }

.feature__index { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-faint); }
.feature__title { font-size: var(--text-xl); letter-spacing: var(--tracking-heading); }
.feature__body { color: var(--color-text-muted); margin-top: var(--space-3); max-width: 48ch; }

/* ------------------------------------------------------------ showcase ---- */

.showcase__inner { display: grid; grid-template-columns: 5fr 7fr; gap: var(--space-12); align-items: center; }
.showcase__figure {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  aspect-ratio: 16 / 11;
  overflow: hidden;
  box-shadow: var(--shadow-md);
}
.showcase__figure::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--color-accent-soft), transparent 55%);
}
.showcase__bullets { display: flex; flex-direction: column; gap: var(--space-4); margin-top: var(--space-6); }
.showcase__bullet { display: flex; gap: var(--space-3); align-items: flex-start; color: var(--color-text-muted); }
.showcase__bullet::before {
  content: '';
  flex: 0 0 auto;
  width: 6px; height: 6px;
  margin-top: 0.55em;
  border-radius: 50%;
  background: var(--color-accent);
}

/* ------------------------------------------------------------- process ---- */

.process__steps { display: grid; gap: var(--space-8); grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); counter-reset: step; }
.process__step { position: relative; padding-top: var(--space-6); border-top: 1px solid var(--color-border); }
.process__step::before {
  counter-increment: step;
  content: counter(step, decimal-leading-zero);
  position: absolute;
  top: var(--space-6);
  right: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-faint);
}
`;
}
/** Pricing, testimonials, FAQ, CTA band, footer. */
export function emitCommerceCss() {
  return `
/* ------------------------------------------------------------- pricing ---- */

.pricing__grid { display: grid; gap: var(--space-6); grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); align-items: start; }
.tier {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-8) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  transition: transform var(--duration-base) var(--ease-emphasized), box-shadow var(--duration-base) var(--ease-standard);
}
.tier:hover { transform: translateY(-4px); box-shadow: var(--shadow-md); }
.tier--featured { border-color: var(--color-accent); box-shadow: var(--shadow-lg); position: relative; }
.tier--featured::after {
  content: 'Recommended';
  position: absolute;
  top: calc(var(--space-4) * -1);
  left: var(--space-6);
  padding: 0.15rem 0.55rem;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  border-radius: var(--radius-pill);
}
.tier__name { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--color-text-muted); }
.tier__price { font-family: var(--font-display); font-size: var(--text-4xl); letter-spacing: var(--tracking-heading); font-variant-numeric: tabular-nums; }
.tier__cadence { font-size: var(--text-sm); color: var(--color-text-faint); }
.tier__features { display: flex; flex-direction: column; gap: var(--space-3); font-size: var(--text-sm); color: var(--color-text-muted); list-style: none; padding: 0; }

/* -------------------------------------------------------- testimonials ---- */

.quotes { display: grid; gap: var(--space-8); grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); }
.quote { padding-left: var(--space-6); border-left: 2px solid var(--color-accent); }
.quote__text { font-family: var(--font-display); font-size: var(--text-2xl); line-height: 1.25; letter-spacing: var(--tracking-heading); }
.quote__by { margin-top: var(--space-4); font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-faint); letter-spacing: var(--tracking-caps); text-transform: uppercase; }

/* ----------------------------------------------------------------- faq ---- */

.faq__list { border-top: 1px solid var(--color-border); }
.faq__item { border-bottom: 1px solid var(--color-border); }
.faq__q {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-6);
  width: 100%;
  padding-block: var(--space-6);
  background: none;
  border: 0;
  text-align: left;
  font-size: var(--text-lg);
  font-family: var(--font-display);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-standard);
}
.faq__q:hover { color: var(--color-accent); }
.faq__q::after {
  content: '';
  flex: 0 0 auto;
  width: 10px; height: 10px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
  transition: transform var(--duration-base) var(--ease-emphasized);
}
.faq__q[aria-expanded='true']::after { transform: rotate(-135deg); }
.faq__a { color: var(--color-text-muted); max-width: var(--prose-width); padding-bottom: var(--space-6); }
.faq__a[hidden] { display: none; }

/* ----------------------------------------------------------------- cta ---- */

.cta__panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8);
  padding: var(--space-12) var(--space-10);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background:
    radial-gradient(90% 140% at 100% 0%, var(--color-accent-soft), transparent 55%),
    var(--color-surface);
}
.cta__title { font-size: var(--text-3xl); letter-spacing: var(--tracking-heading); }

/* -------------------------------------------------------------- footer ---- */

.footer { border-top: 1px solid var(--color-border); padding-block: var(--space-12); margin-top: var(--space-section); }
.footer__inner { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-10); }
.footer__brand { font-family: var(--font-display); font-size: var(--text-lg); }
.footer__cols { display: flex; flex-wrap: wrap; gap: var(--space-12); }
.footer__col-title { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--color-text-faint); margin-bottom: var(--space-4); }
.footer__links { display: flex; flex-direction: column; gap: var(--space-3); font-size: var(--text-sm); list-style: none; padding: 0; }
.footer__links a { color: var(--color-text-muted); text-decoration: none; }
.footer__links a:hover { color: var(--color-text); text-decoration: underline; }
.footer__note { margin-top: var(--space-10); font-size: var(--text-xs); color: var(--color-text-faint); }
`;
}
/** Auth form section. */
export function emitAuthCss() {
  return `
/* ---------------------------------------------------------------- auth ---- */

.auth { min-height: 100svh; display: grid; place-items: center; padding: var(--space-8) var(--space-6); }

.auth__inner { width: 100%; max-width: 30rem; }

.auth__card {
  padding: var(--space-10);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
}

.auth__title { font-size: var(--text-3xl); letter-spacing: var(--tracking-display); }
.auth__sub { color: var(--color-text-muted); margin-top: var(--space-3); }
.auth__form { display: flex; flex-direction: column; gap: var(--space-5); margin-top: var(--space-8); }
.auth__divider {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  color: var(--color-text-faint);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
}
.auth__divider::before, .auth__divider::after { content: ''; flex: 1; height: 1px; background: var(--color-border); }
.auth__foot { margin-top: var(--space-6); font-size: var(--text-sm); color: var(--color-text-muted); }
.auth__brand { font-family: var(--font-display); font-size: var(--text-lg); margin-bottom: var(--space-8); display: block; text-decoration: none; }

.auth__aside {
  display: none;
  padding: var(--space-12);
  border-left: 1px solid var(--color-border);
  background: color-mix(in oklab, var(--color-surface) 70%, var(--color-bg));
  flex-direction: column;
  justify-content: center;
  gap: var(--space-4);
}

@media (min-width: 64rem) {
  .auth--split { grid-template-columns: 1fr 1fr; place-items: stretch; }
  .auth--split .auth__aside { display: flex; }
  .auth--split .auth__inner { max-width: 26rem; }
}
`;
}
/** Motion layer + responsive rules + reduced-motion escape hatch. */
export function emitMotionCss() {
  return `
/* ---------------------------------------------------------------- motion ---- */

[data-reveal] {
  opacity: 0;
  transform: translateY(var(--motion-distance));
  transition:
    opacity var(--duration-slow) var(--ease-entrance),
    transform var(--duration-slow) var(--ease-entrance);
  transition-delay: var(--reveal-delay, 0ms);
}
[data-reveal='in'] { opacity: 1; transform: none; }

[data-stagger] > * { transition-delay: calc(var(--stagger) * var(--i, 0)); }

.nav__toggle[aria-expanded='true'] + .nav__links { display: flex; }

/* Floating layers: one effect, two speeds. */
.float { animation: artisan-float 14s var(--ease-standard) infinite; }
.float--slow { animation-duration: 22s; animation-delay: -4s; }

@keyframes artisan-float {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(0, -10px, 0); }
}

@keyframes artisan-in {
  from { opacity: 0; transform: translateY(var(--motion-distance)); }
  to { opacity: 1; transform: none; }
}

.enter { animation: artisan-in var(--duration-slow) var(--ease-emphasized) both; }

/* ----------------------------------------------------------- responsive ---- */

@media (max-width: 60rem) {
  .hero__title { font-size: var(--text-4xl); }
  .hero--editorial .hero__sub { margin-left: 0; }
  .hero--split .hero__inner { grid-template-columns: 1fr; gap: var(--space-8); }
  .showcase__inner { grid-template-columns: 1fr; gap: var(--space-8); }
  .features--list .feature { grid-template-columns: 2.5rem 1fr; }
  .features--list .feature__body { grid-column: 2 / -1; margin-top: var(--space-2); }
  .features--bento { grid-template-columns: repeat(2, 1fr); }
  .features--bento .feature,
  .features--bento .feature:nth-child(1),
  .features--bento .feature:nth-child(2) { grid-column: span 2; }
  .section { padding-block: var(--space-16, var(--space-12)); }
}

@media (max-width: 40rem) {
  .container { padding-inline: var(--space-4); }
  .nav__links {
    display: none;
    position: absolute;
    top: 100%;
    left: 0; right: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-6);
    background: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
  }
  .nav__toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem; height: 2.5rem;
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .nav__toggle-bar,
  .nav__toggle-bar::before,
  .nav__toggle-bar::after {
    display: block;
    width: 16px; height: 1.5px;
    background: currentColor;
    position: relative;
  }
  .nav__toggle-bar::before, .nav__toggle-bar::after { content: ''; position: absolute; left: 0; }
  .nav__toggle-bar::before { top: -5px; }
  .nav__toggle-bar::after { top: 5px; }
  .hero__title { font-size: var(--text-3xl); line-height: 1.04; }
  .cta__panel { padding: var(--space-8) var(--space-6); }
  .auth__card { padding: var(--space-6); border-radius: var(--radius-lg); }
  .quote__text { font-size: var(--text-xl); }
  .metrics { grid-template-columns: repeat(2, 1fr); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  [data-reveal] { opacity: 1 !important; transform: none !important; }
  .float, .enter { animation: none !important; }
}
`;
}
/** Compose the complete stylesheet for a page plan. */
export function emitSiteCss(tokens, { direction, plan } = {}) {
  const types = new Set((plan?.sections ?? []).map((section) => section.type));
  const parts = [emitBaseCss(tokens, { direction }), emitControlsCss()];
  if (types.has('demo')) parts.push(emitDemoCss());
  if (types.has('nav') || types.has('hero')) parts.push(emitNavHeroCss());
  if (['proof', 'stats', 'features', 'showcase', 'process'].some((type) => types.has(type))) parts.push(emitContentCss());
  if (['pricing', 'testimonials', 'faq', 'cta', 'footer'].some((type) => types.has(type))) parts.push(emitCommerceCss());
  if (types.has('form')) parts.push(emitAuthCss());
  parts.push(emitMotionCss());
  return parts.join('\n');
}
/** Component-demo stage: the component shown in every state, on a real stage. */
export function emitDemoCss() {
  return `
/* ---------------------------------------------------------------- demo ---- */

.demo { min-height: 100svh; display: grid; place-items: center; padding: var(--space-10) var(--space-6); }
.demo__inner { width: 100%; max-width: 56rem; }
.demo__title { font-size: var(--text-3xl); letter-spacing: var(--tracking-display); }
.demo__sub { color: var(--color-text-muted); margin-top: var(--space-3); max-width: 52ch; }

.demo__stage {
  margin-top: var(--space-8);
  padding: var(--space-12) var(--space-8);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background:
    radial-gradient(80% 120% at 50% 0%, var(--color-accent-soft), transparent 60%),
    var(--color-surface);
  display: flex; flex-wrap: wrap; gap: var(--space-6); align-items: center; justify-content: center;
}
.demo__cell { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); }
.demo__label { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--color-text-faint); }
.demo__note { margin-top: var(--space-6); font-size: var(--text-sm); color: var(--color-text-faint); }
.demo--card .demo__stage { display: grid; gap: var(--space-8); grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); justify-items: stretch; }
.demo--card .demo__cell { align-items: stretch; }
.demo--input .demo__stage, .demo--toggle .demo__stage { display: grid; gap: var(--space-8); max-width: 26rem; margin-inline: auto; }
`;
}