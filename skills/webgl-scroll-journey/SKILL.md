---
name: webgl-scroll-journey
category: 3d
priority: high
frameworks: [vanilla, react]
libraries: [three]
triggers: [cinematic, immersive, scroll journey, camera journey, webgl landing, 3d landing, scrollytelling, scroll scrub, camera path, fly through, journey, spatial narrative, product reveal, hero 3d, one continuous scroll, film-like, "3d"]
description: The full architecture for a scroll-driven 3D landing page — one fixed canvas, a camera flown along a curve by scroll progress, DOM copy anchored in world space, adaptive quality and a reduced-motion path. Use when the brief asks for cinematic, immersive or spatial.
---

# WebGL scroll journey

One fixed canvas. A tall empty scroll runway. Scroll position drives a single number, `p` (0 → 1),
and **everything** — camera, materials, copy, density, exposure — is a function of `p`. Nothing is
animated by time except ambient drift.

This is the architecture behind cinematic product pages. It is not "a hero with some shapes in it".

## The non-negotiables

- **One canvas, one renderer, one rAF loop.** Never a canvas per section.
- **Scroll sets state, never triggers animation.** Scrubbing backwards must look identical.
- **The page must read with JS off/failed.** Copy lives in real DOM, not in the scene.
- **A coarse pointer or `prefers-reduced-motion` gets a designed static composition**, not a blank box.
- **Never three floating orbs.** If the scene is spheres on a gradient, it is slop — cut it and ship
  CSS. Earn the canvas with a real subject: a mechanism, an instrument, a structure, a field.

## 1 · Skeleton

```html
<div id="scroll-space"></div>              <!-- empty runway, gives the page its length -->
<canvas id="stage"></canvas>               <!-- position: fixed; inset: 0 -->

<main>
  <section class="chapter" data-range="0.00 0.08">
    <h1>Real copy, real DOM, readable without WebGL</h1>
  </section>
  <section class="chapter" data-range="0.20 0.44">…</section>
</main>

<!-- a label pinned to a point in the 3D world -->
<div class="fragment" data-anchor="1.4 0.6 -3" data-depth="2">42 ms</div>
```

```css
#scroll-space { height: 1200vh; pointer-events: none; }   /* length = number of moments × ~150vh */
#stage { position: fixed; inset: 0; width: 100%; height: 100%; display: block; z-index: 0; }
main { position: relative; z-index: 1; pointer-events: none; }
.chapter { position: fixed; inset: 0; opacity: 0; visibility: hidden; will-change: opacity; }
.chapter > * { pointer-events: auto; }
html:not([data-js]) .chapter { position: static; opacity: 1; visibility: visible; }
@media (prefers-reduced-motion: reduce) { .chapter { position: static; opacity: 1; visibility: visible; } }
```

## 2 · Progress

```js
const state = { p: 0, target: 0, vh: innerHeight };
function readScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  state.target = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
}
addEventListener('scroll', readScroll, { passive: true });
addEventListener('resize', () => { state.vh = innerHeight; readScroll(); }, { passive: true });

// critical: smooth p, do not smooth scrollY — this is what makes it feel like film
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
```

## 3 · The camera path

Keyframes with position, look-at and fov. A Catmull-Rom curve through them gives continuous motion;
`centripetal` avoids the overshoot that makes cuts feel wobbly.

```js
const KEYS = [
  { s: 0.00, p: [0, 0.1, 9.0],   l: [0, 0, 0],    fov: 34 },
  { s: 0.18, p: [1.2, 0.5, 3.0], l: [0, 0, -4],   fov: 32 },
  { s: 0.42, p: [0.2, 0.3, -6],  l: [0, 0, -14],  fov: 32 },
  { s: 0.70, p: [-0.8, 0.2, -18],l: [0, 0, -26],  fov: 31 },
  { s: 1.00, p: [0, 0.3, -30],   l: [0, 0.2, -40],fov: 33 },
];
const posCurve  = new THREE.CatmullRomCurve3(KEYS.map(k => new THREE.Vector3(...k.p)), false, 'centripetal');
const lookCurve = new THREE.CatmullRomCurve3(KEYS.map(k => new THREE.Vector3(...k.l)), false, 'centripetal');

// map p → curve t through the keyframe s values, so timing stays editable
function curveT(p) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i].s, b = KEYS[i + 1].s;
    if (p <= b) return (i + (p - a) / Math.max(1e-6, b - a)) / (KEYS.length - 1);
  }
  return 1;
}
const _pos = new THREE.Vector3(), _look = new THREE.Vector3();
function placeCamera(p) {
  const t = curveT(p);
  posCurve.getPointAt(t, _pos);
  lookCurve.getPointAt(t, _look);
  camera.position.copy(_pos).add(parallax);   // cursor parallax, small: ±0.15
  camera.lookAt(_look);
  const fov = lerpKey(p, 'fov');
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}
```

**Mobile derives its own keys** — pull the camera back along the look vector so the subject still
fits a narrow aspect, rather than letting it crop:

```js
const mobileKeys = (aspect) => KEYS.map(k => {
  const f = Math.max(1.45, (16 / 9) / aspect);
  const d = (i) => k.l[i] + (k.p[i] - k.l[i]) * (i === 2 ? f : 0.5);
  return { ...k, p: [d(0), k.l[1] + (k.p[1] - k.l[1]), d(2)] };
});
```

## 4 · Ranges — the one helper everything uses

```js
// 0 before start, 1 after end, eased in between
const span = (p, a, b) => {
  const t = Math.min(1, Math.max(0, (p - a) / Math.max(1e-6, b - a)));
  return t * t * (3 - 2 * t);
};
```

Every moment is `span(p, start, end)`: chapter opacity, material blend, particle density, fog,
exposure, a mesh's rotation. Read a chapter's range straight off the DOM so copy and scene cannot
drift apart:

```js
const chapters = [...document.querySelectorAll('.chapter')].map(el => {
  const [a, b] = el.dataset.range.split(' ').map(Number);
  return { el, a, b };
});
function updateChapters(p) {
  for (const c of chapters) {
    const inRange = p >= c.a - 0.06 && p <= c.b + 0.06;
    const o = Math.min(span(p, c.a - 0.05, c.a + 0.02), 1 - span(p, c.b - 0.02, c.b + 0.05));
    c.el.style.opacity = inRange ? o.toFixed(3) : '0';
    c.el.style.visibility = o > 0.01 ? 'visible' : 'hidden';
  }
}
```

## 5 · DOM anchored in world space

The strongest move in this format: HTML labels that sit on 3D points. Real text — selectable,
accessible, sharp at any DPR — moving with the scene.

```js
const anchors = [...document.querySelectorAll('[data-anchor]')].map(el => ({
  el, v: new THREE.Vector3(...el.dataset.anchor.split(' ').map(Number)),
}));
const _p = new THREE.Vector3();
function projectAnchors() {
  const hw = innerWidth / 2, hh = innerHeight / 2;
  for (const a of anchors) {
    _p.copy(a.v).project(camera);
    const behind = _p.z > 1;
    a.el.style.opacity = behind ? '0' : '';
    if (behind) continue;
    a.el.style.transform = `translate3d(${(_p.x * hw + hw).toFixed(1)}px, ${(-_p.y * hh + hh).toFixed(1)}px, 0) translate(-50%, -50%)`;
  }
}
```

## 6 · The loop

```js
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  state.p = damp(state.p, state.target, 6, dt);
  placeCamera(state.p);
  updateScene(state.p, dt);      // density, materials, exposure — all span() of p
  updateChapters(state.p);
  projectAnchors();
  renderer.render(scene, camera);
  quality.sample(dt);
  raf = requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange', () => {   // never burn a GPU in a background tab
  if (document.hidden) cancelAnimationFrame(raf);
  else { last = performance.now(); raf = requestAnimationFrame(tick); }
});
```

## 7 · Adaptive quality

Degrade in ordered steps and never climb back — oscillating quality is worse than low quality.

```js
const quality = (() => {
  let acc = 0, n = 0, level = 0;
  return { sample(dt) {
    acc += dt; n++;
    if (acc < 1) return;
    const fps = n / acc; acc = 0; n = 0;
    if (fps > 45 || level >= 2) return;
    level++;
    if (level === 1) renderer.setPixelRatio(1);                 // first: stop paying for DPR
    if (level === 2) scene.traverse(o => {                      // then: drop refraction
      if (o.material?.transmission) { o.material.transmission = 0; o.material.opacity = 0.5; o.material.transparent = true; }
    });
  } };
})();
```

Set the ceiling up front: `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.

## 8 · The paths that are not the journey

```js
const coarse  = matchMedia('(pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) { /* place camera at a chosen p, render ONE frame, show every chapter */ }
if (coarse)  { /* fewer particles, no transmission, simplified path — still a scene */ }
if (!gl)     { /* CSS composition already in the DOM; just never add data-js */ }
```

Gate the hidden state on `html[data-js]` set by the script itself, so a JS failure leaves the page
readable rather than blank.

## 9 · Reviewing it

Give yourself a way to jump to any moment — you cannot iterate on a 1200vh page by scrolling:

```js
const jump = new URLSearchParams(location.search).get('s');
if (jump !== null) { state.p = state.target = parseFloat(jump); /* &still=1 → don't follow scroll */ }
```

## Checklist

- Is `p` the only source of truth, and does scrubbing backwards look identical?
- Does the page read with JS disabled?
- One canvas, one rAF, paused when hidden, disposed on teardown?
- Does the subject deserve WebGL, or is it spheres on a gradient?
- Mobile: its own camera keys, fewer particles, no transmission?
- Reduced motion: one static, composed frame with all copy visible?
- Can you jump to any moment with `?s=`?
