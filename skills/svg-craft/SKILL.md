---
name: svg-craft
category: implementation
priority: high
frameworks: []
libraries: []
triggers: [svg, icon, vector, illustration, diagram, noise, texture, wordmark, logo, monogram, line art]
description: Custom inline SVG - currentColor icons, noise filters, connector diagrams, draw-on paths, monograms.
---

# SVG Craft

Draw it. Never reach for emoji or stock.

## Rules

- Inline the SVG so CSS reaches it. `stroke="currentColor"` + `fill="none"` means one icon works in both themes.
- `vector-effect: non-scaling-stroke` keeps a 1.5px hairline at 1.5px at any scale.
- Ship `viewBox` only, size with CSS (`width:1em;height:1em` for text-aligned icons).
- One stroke width per set (1.5 at 24px), round caps and joins, geometry on a 24-unit grid with a 2-unit margin.
- Meaningful → `role="img"` + `<title>` + `aria-labelledby`. Decorative → `aria-hidden="true" focusable="false"`.
- Strip editor metadata, round path data to 2 decimals, one `<path>` per stroke group. A hand-built icon is 300-900 bytes.
- Reuse: a `<symbol id="i-check" viewBox="0 0 24 24">` in a hidden `<svg>`, then `<use href="#i-check"/>` — `currentColor` still inherits.

## Noise Texture

```html
<svg class="grain" aria-hidden="true" preserveAspectRatio="none">
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
  <rect width="100%" height="100%" filter="url(#grain)"/>
</svg>
```
```css
.grain{position:fixed;inset:0;width:100%;height:100%;opacity:.055;pointer-events:none;mix-blend-mode:overlay;z-index:1}
```
`baseFrequency` .65-.9 for film grain, .02-.06 for a cloudy mesh. Render once, fixed — never re-filter on scroll.

## Hairline Connector Diagram

```html
<svg viewBox="0 0 320 120" role="img" aria-labelledby="flow" fill="none"
     stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke">
  <title id="flow">Repo to scanner to report</title>
  <rect x="1" y="34" width="86" height="52" rx="6" opacity=".45"/>
  <rect x="117" y="34" width="86" height="52" rx="6"/>
  <rect x="233" y="34" width="86" height="52" rx="6" opacity=".45"/>
  <path d="M87 60h30M203 60h30" stroke-dasharray="3 4"/>
  <path d="M112 56l5 4-5 4M228 56l5 4-5 4" stroke-linecap="round"/>
</svg>
```

## Draw-On Path

```js
const p = document.querySelector('.draw');
p.style.setProperty('--len', p.getTotalLength());
```
```css
.draw{stroke-dasharray:var(--len,600);stroke-dashoffset:var(--len,600);animation:draw 1.1s cubic-bezier(.22,1,.36,1) forwards}
@keyframes draw{to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){.draw{animation:none;stroke-dashoffset:0}}
```
CSS-only alternative when JS must not be required: set `pathLength="1"` on the path, then `stroke-dasharray:1;stroke-dashoffset:1` — no measurement needed.

## Monogram From Type

```html
<svg viewBox="0 0 32 32" role="img"><title>Kestrel</title>
  <rect width="32" height="32" rx="7" fill="currentColor" opacity=".1"/>
  <path d="M10 8v16M10 16l9-8M10 16l9 8" fill="none" stroke="currentColor"
        stroke-width="2.25" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
</svg>
```
For a wordmark: set the name in the display face, outline it, tighten tracking to -0.04em, then cut one counter or extend one terminal. That deviation is the logo.

## DECIDE

- Meaning (title + role) or decoration (aria-hidden)?
- One stroke width across the set — anything off by 0.5?
- Correct in dark mode without a second file?
- Animated path still visible with reduced motion and JS off?

## NEVER

Emoji as icons. Raster PNG icons. Icon fonts. A 40KB Illustrator export full of clip paths. Hardcoded `fill="#111827"` that ignores theme. Animating `filter` on scroll.
