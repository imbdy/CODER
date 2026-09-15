/**
 * HTML + JS emitter.
 *
 * Markup is generated from the page plan: semantic landmarks, real heading order,
 * aria attributes where state changes, no div soup. The JS layer is intentionally
 * small: progressive enhancement for the mobile nav, truthful form validation,
 * disclosure widgets, and scroll reveal that respects reduced motion.
 */

import { googleFontsHref } from './css-vars.mjs';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function attr(name, value) {
  if (value === undefined || value === null || value === false) return '';
  if (value === true) return ` ${name}`;
  return ` ${name}="${escapeHtml(value)}"`;
}

function button({ label, href, variant = 'ghost', block = false, attrs = {} }) {
  const classes = ['btn'];
  if (variant === 'primary') classes.push('btn--primary');
  else if (variant === 'quiet') classes.push('btn--quiet');
  else if (variant === 'ghost') classes.push('btn--ghost');
  if (block) classes.push('btn--block');
  const extra = Object.entries(attrs).map(([key, value]) => attr(key, value)).join('');
  const inner = `<span class="btn__label">${escapeHtml(label)}</span>`;
  if (href) return `<a class="${classes.join(' ')}" href="${escapeHtml(href)}"${extra}>${inner}</a>`;
  return `<button class="${classes.join(' ')}" type="button"${extra}>${inner}</button>`;
}

function sectionHead(content, { eyebrow, level = 2 } = {}) {
  const parts = ['<div class="section__head">'];
  if (eyebrow) parts.push(`<span class="section__eyebrow">${escapeHtml(eyebrow)}</span>`);
  if (content.heading) parts.push(`<h${level} class="section__title">${escapeHtml(content.heading)}</h${level}>`);
  if (content.lead) parts.push(`<p class="lede">${escapeHtml(content.lead)}</p>`);
  parts.push('</div>');
  return parts.join('\n        ');
}

/* -------------------------------------------------------------- sections ---- */

export function renderNav(content, { homeHref = '#top', layout = 'minimal-links' } = {}) {
  const links = (content.links ?? []).map((link) => {
    const slug = String(link).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `<li><a class="nav__link" href="#${slug}">${escapeHtml(link)}</a></li>`;
  }).join('\n            ');

  return `<header class="nav" data-nav>
      <div class="container nav__inner">
        <a class="nav__brand" href="${homeHref}">${escapeHtml(content.brand ?? 'Brand')}</a>
        <button class="nav__toggle" type="button" aria-expanded="false" aria-controls="site-nav" data-nav-toggle>
          <span class="visually-hidden">Toggle navigation</span>
          <span class="nav__toggle-bar" aria-hidden="true"></span>
        </button>
        <nav id="site-nav" aria-label="Primary">
          <ul class="nav__links">
            ${links}
            <li>${button({ label: content.cta?.label ?? 'Get started', href: content.cta?.href ?? '#start', variant: 'primary' })}</li>
          </ul>
        </nav>
        ${layout === 'with-status' ? '<span class="nav__status" aria-hidden="true">all systems nominal</span>' : ''}
      </div>
    </header>`;
}

export function renderHero(content) {
  const layout = content.layout ?? 'asymmetric-split';
  const modifier = layout === 'centered-stage' ? 'centered'
    : layout === 'editorial-type' ? 'editorial'
      : layout === 'product-led' ? 'product'
        : 'split';

  const object = modifier === 'split' || modifier === 'product'
    ? '<div class="hero__object float" aria-hidden="true"></div>'
    : '';

  return `<section class="hero hero--${modifier}" id="top">
      <div class="container hero__inner">
        <div class="stack stack--xs">
          <span class="hero__eyebrow">${escapeHtml(content.eyebrow ?? '')}</span>
          <h1 class="hero__title">${escapeHtml(content.headline ?? '')}</h1>
          <p class="hero__sub">${escapeHtml(content.subhead ?? '')}</p>
          <div class="hero__actions">
            ${button({ label: content.primaryCta?.label ?? 'Get started', href: content.primaryCta?.href ?? '#start', variant: 'primary' })}
            ${button({ label: content.secondaryCta?.label ?? 'Learn more', href: content.secondaryCta?.href ?? '#how' })}
          </div>
          ${content.proofPoint ? `<p class="hero__proof">${content.proofPoint}</p>` : ''}
        </div>
        ${object}
      </div>
    </section>`;
}
export function renderProof(content) {
  const items = (content.items ?? []).map((i) => `<span class="proof__item">${escapeHtml(i)}</span>`).join('\n');
  const metrics = (content.metrics ?? []).map((m) => `<div class="metric"><div class="metric__value">${escapeHtml(m.value)}</div><div class="metric__label">${escapeHtml(m.label)}</div></div>`).join('\n');
  return `<section class="section section--tight proof"><div class="container"><p class="proof__label">${escapeHtml(content.label ?? 'Loved by teams')}</p><div class="proof__items">${items}</div>${metrics ? `<div class="metrics" style="margin-top:var(--space-10)">${metrics}</div>` : ''}</div></section>`;
}

export function renderFeatures(content, layout = 'three-column') {
  const cls = layout === 'bento' ? 'features--bento' : layout === 'list-with-icons' ? 'features--list' : 'features--columns';
  const items = (content.items ?? []).map((f, i) => `<article class="feature" data-reveal style="--reveal-delay:${i * 60}ms"><span class="tag">${String(i + 1).padStart(2, '0')}</span><h3>${escapeHtml(f.title)}</h3><p class="feature__body">${escapeHtml(f.body)}</p></article>`).join('\n');
  return `<section class="section" id="features"><div class="container">${sectionHead(content)}<div class="${cls}">${items}</div></div></section>`;
}

export function renderShowcase(content) {
  const bullets = (content.bullets ?? []).map((b) => `<li>${escapeHtml(b)}</li>`).join('\n');
  return `<section class="section showcase" id="how"><div class="container showcase__inner"><div class="stack stack--sm"><h2 class="section__title">${escapeHtml(content.heading ?? 'See it in place')}</h2><p class="lede">${escapeHtml(content.lead ?? '')}</p><ul class="showcase__list">${bullets}</ul></div><div class="hero__object float" aria-hidden="true"></div></div></section>`;
}

export function renderProcess(content) {
  const steps = (content.steps ?? []).map((s, i) => `<li class="process__step" data-reveal><span class="tag">0${i + 1}</span><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.body)}</p></li>`).join('\n');
  return `<section class="section"><div class="container">${sectionHead(content)}<ol class="process">${steps}</ol></div></section>`;
}
export function renderPricing(content) {
  const tiers = (content.tiers ?? []).map((t) => `<article class="tier${t.featured ? ' tier--featured' : ''}"><p class="tier__name">${escapeHtml(t.name)}</p><p class="tier__price">${escapeHtml(t.currency ?? '')} ${escapeHtml(t.price)}</p><p class="tier__cadence">${escapeHtml(t.cadence ?? '')}</p><ul class="tier__features">${(t.features ?? []).map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>${button({ label: 'Choose ' + t.name, href: '#start', variant: t.featured ? 'primary' : 'ghost' })}</article>`).join('\n');
  return `<section class="section" id="pricing"><div class="container">${sectionHead(content)}<div class="tiers">${tiers}</div></div></section>`;
}
export function renderTestimonials(content) {
  const quotes = (content.quotes ?? []).map((q) => `<figure class="quote" data-reveal><blockquote class="quote__text">${escapeHtml(q.quote)}</blockquote><figcaption class="quote__by">${escapeHtml(q.name)} &mdash; ${escapeHtml(q.role)}</figcaption></figure>`).join('\n');
  return `<section class="section"><div class="container">${sectionHead(content)}<div class="quotes">${quotes}</div></div></section>`;
}
export function renderFaq(content) {
  const items = (content.items ?? []).map((f, i) => `<div class="faq__item"><button class="faq__q" type="button" aria-expanded="false" aria-controls="faq-a-${i}" data-faq-q>${escapeHtml(f.q)}</button><div class="faq__a" id="faq-a-${i}" hidden data-faq-a><p>${escapeHtml(f.a)}</p></div></div>`).join('\n');
  return `<section class="section"><div class="container">${sectionHead(content)}<div class="faq__list">${items}</div></div></section>`;
}
export function renderCta(content) {
  return `<section class="section"><div class="container"><div class="cta__panel" data-reveal><div class="stack stack--xs"><h2 class="cta__title">${escapeHtml(content.heading ?? 'Get started')}</h2><p class="lede">${escapeHtml(content.body ?? '')}</p></div>${button({ label: content.cta?.label ?? 'Get started', href: content.cta?.href ?? '#start', variant: 'primary' })}</div></div></section>`;
}
export function renderFooter(content) {
  const cols = (content.columns ?? []).map((c) => `<div><p class="footer__col-title">${escapeHtml(c.title)}</p><ul class="footer__links">${(c.links ?? []).map((l) => `<li><a href="#">${escapeHtml(l)}</a></li>`).join('')}</ul></div>`).join('\n');
  return `<footer class="footer"><div class="container"><div class="footer__inner"><span class="footer__brand">${escapeHtml(content.brand ?? 'Brand')}</span><div class="footer__cols">${cols}</div></div><p class="footer__note">${escapeHtml(content.note ?? '')}</p></div></footer>`;
}
export function renderForm(content, { brand = 'Artisan' } = {}) {
  const fields = (content.fields ?? []).map((f) => `<div class="field" data-field="${escapeHtml(f.name)}"><label class="field__label" for="f-${escapeHtml(f.name)}">${escapeHtml(f.label)}</label><input class="field__control" id="f-${escapeHtml(f.name)}" name="${escapeHtml(f.name)}" type="${escapeHtml(f.type ?? 'text')}"${f.autocomplete ? ` autocomplete="${escapeHtml(f.autocomplete)}"` : ''}${f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : ''}${f.required ? ' required' : ''} /><div class="field__meta">${f.hint ? `<span class="field__hint">${escapeHtml(f.hint)}</span>` : ''}<span class="field__error" data-error>Please enter a valid ${escapeHtml(String(f.label ?? '').toLowerCase())}.</span></div></div>`).join('\n');
  const bullets = (content.sidePanel?.bullets ?? []).map((b) => `<li>${escapeHtml(b)}</li>`).join('\n');
  return `<main class="auth auth--split"><div class="auth__inner"><a class="auth__brand" href="#top">${escapeHtml(brand)}</a><div class="auth__card"><h1 class="auth__title">${escapeHtml(content.title ?? 'Sign in')}</h1><p class="auth__sub">${escapeHtml(content.subtitle ?? '')}</p><form class="auth__form" action="${escapeHtml(content.action ?? '#')}" method="post" data-auth-form novalidate>${fields}${content.remember ? `<label class="checkbox"><input type="checkbox" name="${escapeHtml(content.remember.name ?? 'remember')}" /> ${escapeHtml(content.remember.label)}</label>` : ''}<button class="btn btn--primary btn--block" type="submit">${escapeHtml(content.submit?.label ?? 'Continue')}</button><div class="auth__divider">or</div><button class="btn btn--block" type="button" data-passkey>${escapeHtml(content.secondary?.label ?? 'Continue with passkey')}</button><p class="auth__foot">${escapeHtml(content.footnote ?? '')}</p></form></div></div><aside class="auth__aside" aria-label="Why"><h2>${escapeHtml(content.sidePanel?.heading ?? 'Welcome back')}</h2><ul class="showcase__list">${bullets}</ul></aside></main>`;
}
export function renderDemo(content) {
  const component = content.component ?? 'button';
  const cell = (label, inner) => `<div class="demo__cell">${inner}<span class="demo__label">${escapeHtml(label)}</span></div>`;
  let cells;
  if (component === 'card') {
    const card = (mod = '') => `<article class="card ${mod}"><h3>Considered by default</h3><p class="feature__body">One job per card, real copy, states designed from tokens.</p></article>`;
    cells = [cell('rest', card()), cell('hover', card('card--hover')), cell('featured', card('card--featured'))];
  } else if (component === 'input') {
    const field = (state) => `<div class="field" ${state === 'invalid' ? 'data-invalid="true"' : ''}><label class="field__label" for="demo-email-${state}">Email</label><input class="field__control" id="demo-email-${state}" type="email" placeholder="you@company.com" ${state === 'invalid' ? 'aria-invalid="true"' : ''}/><div class="field__meta">${state === 'invalid' ? '<span class="field__error" data-error>Please enter a valid email.</span>' : '<span class="field__hint">We never share it.</span>'}</div></div>`;
    cells = [cell('rest', field('rest')), cell('invalid', field('invalid'))];
  } else if (component === 'toggle' || component === 'checkbox') {
    cells = [
      cell('off', '<label class="checkbox"><input type="checkbox" /> Notifications</label>'),
      cell('on', '<label class="checkbox"><input type="checkbox" checked /> Notifications</label>'),
      cell('disabled', '<label class="checkbox"><input type="checkbox" disabled /> Notifications</label>'),
    ];
  } else if (component === 'badge' || component === 'tag') {
    cells = [cell('neutral', '<span class="tag">Draft</span>'), cell('accent', '<span class="tag tag--accent">Live</span>'), cell('muted', '<span class="tag">Archived</span>')];
  } else {
    const b = (label, attrs = '') => `<button class="btn btn--primary" type="button" ${attrs}><span class="btn__label">${escapeHtml(label)}</span></button>`;
    cells = [
      cell('rest', b('Get started')),
      cell('hover', b('Get started')),
      cell('focus-visible', b('Get started')),
      cell('disabled', b('Get started', 'disabled')),
      cell('loading', b('Saving…', 'aria-busy="true"')),
    ];
  }
  return `<main class="demo demo--${escapeHtml(component)}"><div class="demo__inner"><h1 class="demo__title">${escapeHtml(content.heading ?? 'In every state')}</h1><p class="demo__sub">${escapeHtml(content.sub ?? '')}</p><div class="demo__stage">${cells.join('\n')}</div><p class="demo__note">${escapeHtml(content.note ?? '')}</p></div></main>`;
}

export function renderStats(content) {

  const figs = (content.figures ?? []).map((f) => `<div class="metric"><div class="metric__value">${escapeHtml(f.value)}</div><div class="metric__label">${escapeHtml(f.label)}</div></div>`).join('\n');
  return `<section class="section section--tight"><div class="container"><div class="metrics">${figs}</div></div></section>`;
}
export function renderSection(section, ctx = {}) {
  switch (section.type) {
    case 'nav': return renderNav(section.content, ctx);
    case 'hero': return renderHero(section.content);
    case 'proof': return renderProof(section.content);
    case 'features': return renderFeatures(section.content, section.layout);
    case 'showcase': return renderShowcase(section.content);
    case 'process': return renderProcess(section.content);
    case 'pricing': return renderPricing(section.content);
    case 'testimonials': return renderTestimonials(section.content);
    case 'faq': return renderFaq(section.content);
    case 'cta': return renderCta(section.content);
    case 'footer': return renderFooter(section.content);
    case 'form': return renderForm(section.content, ctx);
    case 'stats': return renderStats(section.content);
    case 'demo': return renderDemo(section.content);
    default: return `<section class="section"><div class="container">${sectionHead(section.content ?? {})}</div></section>`;
  }
}
export function emitSiteJs() {
  return '/* nav, FAQ, auth validation, reveal. */\n(() => {\n  const nav = document.querySelector("[data-nav]");\n  const toggle = document.querySelector("[data-nav-toggle]");\n  const links = document.querySelector(".nav__links");\n  if (toggle && links) toggle.addEventListener("click", () => {\n    const open = toggle.getAttribute("aria-expanded") === "true";\n    toggle.setAttribute("aria-expanded", String(!open));\n    links.style.display = open ? "" : "flex";\n  });\n  const onScroll = () => { if (nav) nav.setAttribute("data-scrolled", String(window.scrollY > 8)); };\n  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();\n  document.querySelectorAll("[data-faq-q]").forEach((q) => q.addEventListener("click", () => {\n    const open = q.getAttribute("aria-expanded") === "true";\n    q.setAttribute("aria-expanded", String(!open));\n    const panel = q.parentElement && q.parentElement.querySelector("[data-faq-a]");\n    if (panel) panel.hidden = open;\n  }));\n  const form = document.querySelector("[data-auth-form]");\n  if (form) form.addEventListener("submit", (e) => {\n    let firstBad;\n    form.querySelectorAll(".field").forEach((field) => {\n      const input = field.querySelector("input");\n      if (!input) return;\n      const bad = !input.checkValidity();\n      field.dataset.invalid = bad ? "true" : "false";\n      input.setAttribute("aria-invalid", String(bad));\n      if (bad && !firstBad) firstBad = input;\n    });\n    if (firstBad) { e.preventDefault(); firstBad.focus(); }\n  });\n  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;\n  if (!reduce && "IntersectionObserver" in window) {\n    const io = new IntersectionObserver((entries) => entries.forEach((en) => {\n      if (en.isIntersecting) { en.target.classList.add("enter"); io.unobserve(en.target); }\n    }), { threshold: 0.12 });\n    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));\n  } else { document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("enter")); }\n})();\n';
}
export function emitPage({ tokens, plan, css, title = 'Artisan site' }) {
  const fontsHref = googleFontsHref(tokens);
  const brand = plan.sections.find((x) => x.type === 'nav')?.content?.brand ?? 'Artisan';
  const body = (plan.sections ?? []).map((s) => renderSection(s, { brand })).join('\n');
  const desc = plan.sections.find((s) => s.type === 'hero')?.content?.subhead ?? 'A considered interface.';
  const links = fontsHref ? '<link rel="preconnect" href="https://fonts.googleapis.com" />\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n<link rel="stylesheet" href="' + fontsHref + '" />\n' : '';
  const close = '</' + 'script>';
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>' + escapeHtml(title) + '</title>\n<meta name="description" content="' + escapeHtml(desc) + '"/>\n' + links + '<style>\n' + css + '\n</style>\n</head>\n<body>\n<a class="visually-hidden" href="#main">Skip to content</a>\n<main id="main">\n' + body + '\n</main>\n<script>\n' + emitSiteJs() + '\n' + close + '\n</body>\n</html>\n';
}