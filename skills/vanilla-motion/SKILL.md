---
name: vanilla-motion
category: animation
priority: high
frameworks: [static]
libraries: [gsap, three]
triggers: [cdn, importmap, static site animation, no build, vanilla js animation, gsap without build, three without build, esm cdn, script module animation]
description: GSAP and three.js on build-less static sites — importmap + CDN ESM, the only reliable way to use them without a bundler.
---

# Vanilla Motion — GSAP / three.js without a build step

Static sites cannot `import gsap from 'gsap'` — there is no bundler to resolve it. npm-installing the package and importing it in a plain `<script type="module">` fails with "Failed to resolve module specifier". Use an import map instead: it maps bare specifiers to CDN ESM builds and needs zero tooling.

## The pattern (put in index.html before the module script)

```html
<script type="importmap">
{
  "imports": {
    "gsap": "https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js",
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>
<script type="module" src="scripts/main.js"></script>
```

Then in `scripts/main.js` imports work normally:

```js
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';
```

gsap plugins resolve relative to the gsap entry on jsdelivr, so ScrollTrigger needs no extra map entry.

## When to reach for what (static site)

- Hover/focus/state transitions, simple reveals → **CSS** (always first choice; zero bytes of JS)
- Scroll-triggered reveals → `IntersectionObserver` (hand-rolled, ~15 lines, no library)
- Choreographed timelines, scrubbed/pinned scroll stories → **GSAP** via importmap
- Hero 3D / floating depth elements → **three.js** via importmap
- If the workspace is React/Next, do NOT use the CDN — install the npm package instead (`npm i gsap`) and import normally.

## GSAP on static sites

```js
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

gsap.from('.hero__title', {
  y: 40, opacity: 0, duration: 0.9, ease: 'power3.out',
  scrollTrigger: { trigger: '.hero', start: 'top 80%' },
});
```

## three.js on static sites

```js
import * as THREE from 'three';
const canvas = document.querySelector('[data-canvas]');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
// scene + camera + ONE hero mesh; render on requestAnimationFrame with a
// visibility guard, and stop the loop when the canvas leaves the viewport.
```

## Rules

- Wrap library init in feature detection and a reduced-motion check; the site must still work if the CDN is blocked.
- Always give elements a visible default state; animate FROM a hidden state only with `gsap.from` (never CSS `opacity: 0` without JS — that is how content vanishes when scripts fail).
- Prefer `IntersectionObserver` over GSAP for simple reveals; use GSAP when you actually need timeline choreography.
- Kill GSAP animations on teardown (`gsap.killTweensOf`) in long-lived SPAs; on static pages this is rarely needed.
- Respect `prefers-reduced-motion`: skip library init entirely when it matches.

## Anti-Patterns

- `npm install gsap` in a folder with no package.json/build step — the import will fail at runtime.
- Inline `<script>` libraries pasted into index.html (breaks the separation standard).
- Loading three.js for a hover effect — CSS already solved it.
- CDN pinned to `@latest` — pin an exact version; latest can break the import map.
