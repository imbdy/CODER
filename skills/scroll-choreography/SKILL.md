---
name: scroll-choreography
category: animation
priority: high
frameworks: []
libraries: []
triggers: [scroll, scroll driven, scrolltrigger, sticky, pin, scrub, reveal, parallax, smooth scroll, lenis, stagger]
description: Scroll as directed motion - native scroll-driven CSS, load orchestration, scrub budgets, reduced-motion.
---

# Scroll Choreography

Native first. Most scroll work now needs zero JS.

## Native Scroll-Driven Reveal

```css
@keyframes rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}

@supports (animation-timeline: view()) {
  .reveal{animation:rise .7s linear both;animation-timeline:view();animation-range:entry 8% cover 34%}
}
```
- `view()` = the element's progress through the viewport; `scroll(root block)` = the scroller's, for progress bars.
- `animation-range` is the control surface: `entry 0% entry 100%` fires on entry, `cover 0% cover 50%` scrubs the first half. Keep reveals inside `entry 5%` → `cover 40%`.
- `animation-duration` is ignored on a scroll timeline but still required to parse.

## Fallback

```css
@supports not (animation-timeline: view()) {
  html[data-js] .reveal{opacity:0;transform:translateY(24px);transition:opacity .6s,transform .6s cubic-bezier(.22,1,.36,1)}
  html[data-js] .reveal.is-in{opacity:1;transform:none}
}
```
```js
document.documentElement.dataset.js = '1';
if (!CSS.supports('animation-timeline','view()')) {
  const io = new IntersectionObserver((es)=>es.forEach(e=>{
    if(e.isIntersecting){e.target.classList.add('is-in');io.unobserve(e.target)}
  }),{rootMargin:'0px 0px -12% 0px',threshold:.15});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
}
```
**Fail-safe rule**: the hidden state sits behind `html[data-js]`, set by JS itself. JS fails, nothing is hidden — content must never need JS to be visible.

## Page-Load Orchestration

One timeline beats scattered micro-interactions: eyebrow, headline, lede, CTA each one rung up a 60-90ms ladder, one keyframe, one easing.

```css
.hero > *{animation:rise .6s cubic-bezier(.22,1,.36,1) both}
.hero > :nth-child(1){animation-delay:.04s}
.hero > :nth-child(2){animation-delay:.12s}
.hero > :nth-child(3){animation-delay:.20s}
.hero > :nth-child(4){animation-delay:.28s}
```
Entrance under 700ms. Over ~5 rungs feels like a loading screen.

## Sticky vs Pin

`position:sticky; top:0` in a tall parent is free, GPU-cheap and keyboard-safe — sticky copy beside scrolling media, section headers, progress rails. True pinning (ScrollTrigger `pin:true`) rewrites layout and can trap focus: one sequence per page, 3-5 beats, explicit `end:"+=200%"`.

## Smooth Scroll

`scroll-behavior:smooth` on `html` handles anchors — ship that. Lenis (~15KB) earns its weight only when a scrub needs interpolated velocity (pinned horizontal gallery, video scrub); it hijacks native scroll. Never for "feel".

## Budgets

- **Max 2 scrubbed effects per page.** Reveals are not scrubbed and do not count.
- **Transform and opacity only** on scroll — no `top`, `width`, `height`, `filter`, `box-shadow`.
- Parallax offsets ±16-40px; more reads as broken, not deep.
- One scroll-linked canvas or video, paused off-screen.

## Reduced Motion

```css
@media (prefers-reduced-motion:reduce){
  .reveal,.hero > *{animation:none!important;opacity:1!important;transform:none!important}
  html{scroll-behavior:auto}
}
```
Everything visible, nothing moving. No fade-only compromise that still hides content.

## DECIDE

- Can this be `view()` with no JS? Then no library.
- Scrubbed effects on the page — over 2? Cut one.
- Does the page render fully with JS disabled?

## NEVER

Elements permanently `opacity:0` in CSS waiting for an observer. Scroll handlers with no rAF coalescing. Animating layout properties on scroll. Lenis plus a pin plus parallax plus a scrub bar on one page.
