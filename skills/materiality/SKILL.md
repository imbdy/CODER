---
name: materiality
category: visual
priority: high
frameworks: []
libraries: []
triggers: [depth, surface, material, texture, grain, noise, glass, glassmorphism, shadow, elevation, vignette, scrim, layering]
description: Depth from value steps, hairlines, grain and scrims - under a strict decoration budget.
---

# Materiality

Depth comes from value steps, one light direction and edges. Never from stacking blurred blobs.

## One Light Source

Pick the direction once - top, slightly left - and hold it: highlight on the top edge, shadow below, never both on one side.

## Value-Step Ladder

Dark substrate, +4 to +6 L* per step, three steps max:

```css
--l0:#0b0c0e;       /* page */
--l1:#14161a;       /* card */
--l2:#1c1f24;       /* raised */
--hairline:#23262b; /* 1px structure, ~1.3:1 - not a contrast element */
```
Light substrate - raise by whitening plus a hairline, never by enlarging the shadow: `--l0:#f3efe6; --l1:#fbf9f4; --l2:#ffffff; --hairline:#ddd6c6`.

## Hairline + Inset Highlight

```css
.surface{
  background:var(--l1); border:1px solid var(--hairline); border-radius:10px;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.06),  /* top light catch */
    0 1px 2px rgb(0 0 0 / 0.30),            /* contact */
    0 12px 32px -14px rgb(0 0 0 / 0.45);    /* ambient, negative spread */
}
```
Two shadow layers maximum: one tight contact, one wide ambient with negative spread. `0 25px 50px -12px` on every card is a library default.

## Film Grain At 2-4%

```html
<svg class="grain" aria-hidden="true"><filter id="gr"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#gr)"/></svg>
```
```css
.grain{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;opacity:0.035;mix-blend-mode:overlay}
```
`baseFrequency` 0.65-0.9 is film grain; below 0.4 is clouds. Above 0.06 looks dirty, below 0.02 invisible - use 0.03, fixed to the viewport.

## Scrim And Vignette

```css
.scrim{background:linear-gradient(to top,rgb(8 9 11 / 0.88) 0%,rgb(8 9 11 / 0.72) 22%,
  rgb(8 9 11 / 0.28) 52%,transparent 78%)}
.vignette{background:radial-gradient(120% 90% at 50% 40%,transparent 45%,rgb(0 0 0 / 0.55))}
```
Check the text against the scrim's lightest point, not its darkest.

## Glass, When Earned

One glass surface per page, and only with real motion behind it: sticky header, overlay on media or canvas.

```css
.glass{background:rgb(20 22 26 / 0.62);
  backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);
  border:1px solid rgb(255 255 255 / 0.10);box-shadow:inset 0 1px 0 rgb(255 255 255 / 0.08)}
@supports not (backdrop-filter:blur(1px)){.glass{background:rgb(20 22 26 / 0.94)}}
```
Blur >= 12px or it reads as dirty transparency. Always ship the opaque fallback.

```css
.clip{clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%)}
.ruled{background-image:linear-gradient(90deg,var(--hairline) 1px,transparent 1px);
  background-size:calc(100% / 12) 100%}
```

## Decoration Budget

Two decorative layers per viewport, maximum, each with a written purpose. Allowed: grain (material) + top vignette (focus). Not: grain + vignette + glow + glass + gradient mesh. Purpose "looks cool" = delete.

## DECIDE

- Light direction written down?
- Two value steps or three, with hexes?
- Grain at 0.03, or none?
- Glass earned by real motion behind it, or deleted?
- Decorative layers <= 2, each with a stated purpose?

## NEVER

- Blurred color blobs as "depth"
- `backdrop-filter` over a static background
- Blur radius above 40px on a card
- Shadow + heavy border + gradient on one element
- Grain that scrolls with content, or above 6% opacity
