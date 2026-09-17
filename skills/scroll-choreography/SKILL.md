---
name: scroll-choreography
category: animation
priority: high
frameworks: [vanilla, react]
libraries: [gsap, lenis]
triggers: [scroll, scroll driven, scrolltrigger, sticky, pin, scrub, reveal, parallax, smooth scroll, lenis, stagger, scroll animation, pinned section, horizontal scroll, image sequence, scroll timeline]
description: Scroll as directed motion — the three primitives (pin, scrub, parallax), native CSS scroll timelines, the correct Lenis+GSAP wiring, pinned sequences and image sequences, with reduced-motion paths.
---

# Scroll choreography

Three primitives are behind almost every scroll effect worth copying: **pin** (hold an element while
the page keeps scrolling), **scrub** (tie an animation's progress to the scrollbar), **parallax**
(move layers at different rates). Everything else is a combination of those.

**Pick the cheapest tier that delivers the effect.** In order:

| Tier | Use it for | Cost |
|---|---|---|
| CSS scroll-driven animations | reveals, progress bars, parallax, sticky headers | free, off the main thread |
| IntersectionObserver + CSS | one-shot reveals, lazy work | very cheap |
| GSAP ScrollTrigger | pinned sequences, scrubbed timelines, horizontal galleries | a real dependency |
| rAF + normalised progress | a WebGL camera journey (see webgl-scroll-journey) | you own the loop |

## Tier 1 — native CSS, no JavaScript

Supported in Chrome/Edge 115+ and Safari 26+; Firefox still ships it behind a flag in stable, so
treat it as progressive enhancement behind `@supports`. It runs on the compositor, which is why it
stays smooth where a scroll listener does not.

```css
/* reveal each section as it enters the viewport */
@supports (animation-timeline: view()) {
  .reveal {
    animation: rise linear both;
    animation-timeline: view();
    animation-range: entry 10% cover 35%;   /* start as it enters, finish before centre */
  }
}
@keyframes rise { from { opacity: 0; transform: translateY(2rem); } to { opacity: 1; transform: none; } }

/* a reading-progress bar driven by the document scroller */
.progress { transform-origin: 0 50%; animation: grow linear both; animation-timeline: scroll(root block); }
@keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }

/* named timeline: one element's scroll drives another element's animation */
.gallery { scroll-timeline: --shelf inline; overflow-x: auto; }
.gallery__meter { animation: grow linear both; animation-timeline: --shelf; }
```

`animation-range` is the control that matters: `entry`, `cover`, `exit`, `contain`, with percentages.
Tune the range, not the duration — there is no duration on a scroll timeline.

## Tier 2 — reveal without a library

```js
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
}, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
```

Hide only under `html[data-js]`, which the script sets itself, so a JS failure can never leave the
page blank.

## Tier 3 — GSAP ScrollTrigger

```js
gsap.registerPlugin(ScrollTrigger);

// scrub: progress follows the scrollbar. `true` locks to it; a number adds smoothing lag.
gsap.to('.panel__image', {
  yPercent: -18, ease: 'none',
  scrollTrigger: { trigger: '.panel', start: 'top bottom', end: 'bottom top', scrub: 1 },
});

// pin + timeline: the classic cinematic beat. The section holds while its contents play.
const tl = gsap.timeline({
  scrollTrigger: { trigger: '.scene', start: 'top top', end: '+=3000', pin: true, scrub: 1, anticipatePin: 1 },
});
tl.from('.scene__line', { yPercent: 110, stagger: 0.12, ease: 'none' })
  .to('.scene__caption', { opacity: 1 }, '<0.2')
  .to('.scene__caption', { opacity: 0 }, '>0.6');

// horizontal gallery: pin the wrapper, translate the track by its own overflow
const track = document.querySelector('.track');
gsap.to(track, {
  x: () => -(track.scrollWidth - innerWidth), ease: 'none',
  scrollTrigger: { trigger: '.track-wrap', pin: true, scrub: 1, end: () => '+=' + (track.scrollWidth - innerWidth), invalidateOnRefresh: true },
});
```

- `ease: 'none'` on anything scrubbed. An eased scrub feels like lag, not weight.
- `invalidateOnRefresh: true` whenever a value depends on layout, or resize breaks it.
- `ScrollTrigger.refresh()` after fonts and images settle, or every trigger is measured wrong.

## Smooth scroll — the wiring that is usually wrong

Lenis and ScrollTrigger must run on **one** loop. Two loops is where the jitter comes from.

```js
import Lenis from 'lenis';
const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
lenis.on('scroll', ScrollTrigger.update);                 // 1. tell ScrollTrigger when Lenis moves
gsap.ticker.add((time) => lenis.raf(time * 1000));        // 2. drive Lenis from GSAP's ticker (seconds → ms)
gsap.ticker.lagSmoothing(0);                              // 3. or GSAP will "helpfully" skip time
```

Do not also call `requestAnimationFrame(raf)` for Lenis — that is the second loop. Turn smooth
scroll off for `prefers-reduced-motion` and for coarse pointers, where the OS already owns momentum.

## Pinned image sequence (the "Apple" effect)

Frames drawn to a canvas, frame index mapped from scroll progress.

```js
const frames = 120, images = [];
for (let i = 0; i < frames; i++) { const im = new Image(); im.src = `/seq/${String(i).padStart(4, '0')}.webp`; images.push(im); }
const ctx = canvas.getContext('2d');
const state = { frame: 0 };
gsap.to(state, {
  frame: frames - 1, snap: 'frame', ease: 'none',
  scrollTrigger: { trigger: '.seq', start: 'top top', end: '+=4000', pin: true, scrub: 0.5 },
  onUpdate: () => { const im = images[state.frame]; if (im?.complete) ctx.drawImage(im, 0, 0, canvas.width, canvas.height); },
});
```

Budget it honestly: 120 frames of WebP at ~40 KB is ~5 MB. Preload the first ~20, lazy the rest, and
give reduced-motion a single hero frame.

## Choreography, not effects

A page with eight scroll tricks reads worse than one with a single well-timed sequence. The page load
is one composed ladder, not per-element animation:

```
0–200 ms     structure and substrate settle
200–600 ms   the hero line (per-line mask reveal, 60–90 ms stagger)
400–800 ms   the supporting line
600–900 ms   navigation
800–1200 ms  everything below the fold hands over to scroll
```

Use one custom easing family and never the defaults. `cubic-bezier(0.16, 1, 0.3, 1)` is the
exponential-out that most premium work uses; `ease`, `linear` and `ease-in-out` read as unfinished.

## Rules

- Transform and opacity only. Never animate `width`, `height`, `top`, `left` — they relayout.
- Anything scrubbed is `ease: 'none'`.
- `will-change` on the few elements that actually animate, removed when finished.
- Never parallax body text. Decorative layers only.
- Content is never hidden waiting for a trigger unless `html[data-js]` is set.
- Kill every ScrollTrigger on teardown (`ScrollTrigger.getAll().forEach(t => t.kill())`).

## Reduced motion

```js
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
if (reduced.matches) {
  document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-in'));
} else {
  // build the timelines here
}
```

Not "animations off" — the same page, composed, arriving at once. Every pinned section must still be
readable when nothing pins.

## Checklist

- Is this the cheapest tier that delivers the effect?
- Scrubbed things `ease: 'none'`; `invalidateOnRefresh` where layout matters?
- One rAF loop only (Lenis on `gsap.ticker`, `lagSmoothing(0)`)?
- One easing family, one custom curve, no defaults?
- Does the page read with JS off, and does reduced-motion get the composed page?
- `ScrollTrigger.refresh()` after fonts/images load?
