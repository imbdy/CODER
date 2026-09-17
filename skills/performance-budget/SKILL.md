---
name: performance-budget
category: engineering
priority: high
frameworks: []
libraries: []
triggers: [performance, fps, lighthouse, lcp, cls, inp, budget, optimize, slow, jank, will-change]
description: Hard budgets for cinematic pages - LCP/CLS/INP targets, animation cost ladder, canvas and font rules.
---

# Performance Budget

Cinematic is no excuse. These are pass/fail numbers.

## Budgets

- **LCP < 2.5s**, **CLS < 0.1**, **INP < 200ms**
- **JS < 150KB gzipped** on first load — a 40KB animation library must replace something
- **One** hero canvas/WebGL surface, one scroll-linked video
- **60fps on mid-range Android** (4x CPU throttle ≈ a Pixel 6a)
- Fonts: 2 families, 3 `woff2` files, < 120KB total, subset to latin
- Hero image < 200KB (AVIF/WebP)

## Animation Cost Ladder

1. **Free** — `transform`, `opacity`. Compositor-only. Animate these.
2. **Cheap** — `color`/`background-color`/`border-color` on small elements.
3. **Expensive** — `filter`, `backdrop-filter`, `clip-path`, `mask-image` on large areas: one instance, static, never during scroll.
4. **Forbidden** — `box-shadow` or `blur()` animated in a scroll handler; `top/left/width/height/margin` animated at all.

A `backdrop-filter: blur(12px)` nav is fine. The same on six cards that scale on hover is 20fps.

## will-change Discipline

```js
el.onpointerenter = () => el.style.willChange = 'transform';
el.ontransitionend = () => el.style.willChange = 'auto';
```
Add immediately before, remove after. Never in a stylesheet on a list — each hint is its own compositor layer; 40 layers cost more than the jank. Cap ~5.

## Canvas / WebGL

```js
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

let raf = null, visible = true, onScreen = true;
const tick = (t) => { draw(t); raf = requestAnimationFrame(tick); };
const sync = () => {
  const run = visible && onScreen;
  if (run && !raf) raf = requestAnimationFrame(tick);
  if (!run && raf) { cancelAnimationFrame(raf); raf = null; }
};
document.addEventListener('visibilitychange', () => { visible = !document.hidden; sync(); });
new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }, { threshold: 0 }).observe(canvas);
```
DPR above 2 quadruples fragment work for no gain. Skip 3D for a static poster when `matchMedia('(pointer:coarse)').matches || (navigator.deviceMemory ?? 8) <= 4`.

## Fonts (CLS)

```css
@font-face{font-family:Display;src:url(/fonts/display.woff2) format('woff2');font-display:swap;font-weight:400 700}
@font-face{font-family:DisplayFallback;src:local('Arial');size-adjust:96%;ascent-override:92%;descent-override:24%}
```
`preconnect` the font host; `preload as="font" crossorigin` the LCP element's font only. `size-adjust` on the fallback removes the swap reflow.

## Images

Always `width`+`height` or `aspect-ratio` — the biggest CLS source. Below the fold: `loading="lazy" decoding="async"`. Hero: `fetchpriority="high"`, never lazy.

## Measure Honestly

- Performance panel, 4x CPU throttle, Fast 4G, recorded **while scrolling the page** — not an idle trace.
- Rendering panel: Paint Flashing (green on scroll = removable repaint) + Frame Rendering Stats.
- INP only from real interaction — click and type during the trace; 50ms+ tasks are the failures.

## Checklist

- What is the LCP element, and is it preloaded and not lazy?
- Total gzipped JS under 150KB, and every scroll effect transform/opacity only?
- Does anything animate off-screen or in a hidden tab?

## NEVER

Animating `top/left/width/height`. `blur()` recomputed in a scroll handler. Unbounded rAF loops with no pause. Analytics or chat widgets in the critical path. 3D on a coarse phone with no fallback. `will-change` on every card.
