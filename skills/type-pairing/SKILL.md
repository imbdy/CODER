---
name: type-pairing
category: design
priority: high
frameworks: []
libraries: []
triggers: [typeface, font, font pairing, type, serif, sans, display font, google fonts, typography, webfont, font stack]
description: Real typeface pairings with weight extremes, tracking per role and size-adjust fallbacks.
---

# Type Pairing

The identity face is the first thing a viewer reads. Commodity defaults announce that nobody chose.

## Never The Identity Face

Inter, Roboto, Open Sans, Lato, Arial, Helvetica, Poppins, Montserrat, `system-ui`. Any of them can carry body or UI text; none can be the display face. Inter Tight 300 as the quiet partner to a strong serif is fine.

## Rules

- One display + one text face. Mono only for labels, code or data. Three families is the cap.
- Weight extremes: 200 vs 800, or 100 vs 900. 400 vs 600 in one face is a nudge, not a hierarchy.
- Contrast the skeletons: high-contrast serif + low-contrast grotesque. Two geometric sans = mush.
- The display face sets h1/h2 and pull quotes only. Never body copy.

## Twelve Pairings

| mood | display | text / mono |
|---|---|---|
| Editorial calm | Instrument Serif 400 | Geist 300/500 |
| Warm expressive | Fraunces 300 italic (opsz 144) | Archivo 400 |
| Contemporary quirk | Bricolage Grotesque 800 | Newsreader 300 |
| Techno-luxe | Syne 800 | IBM Plex Sans 400 + IBM Plex Mono |
| Poster drama | DM Serif Display 400 | Space Grotesk 500 |
| Academic trust | Libre Baskerville 700 | Familjen Grotesk 400 |
| Developer product | Sora 200/800 | Sora 400 + JetBrains Mono |
| Classic fashion | Playfair Display 500 | Inter Tight 300 |
| Newsstand brutal | Archivo Black | Chivo 400 |
| Couture minimal | Bodoni Moda 500 (opsz) | Jost 300 |
| Literary long-form | Spectral 300 | Epilogue 600 caps labels |
| Future utility | Unbounded 200 | Public Sans 400 + Space Mono |

## Loading

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;500&display=swap">
```
`display=swap` always. Four weights total, maximum: each static cut is 20-40KB, so `wght@100..900` variable beats four cuts.

## Metric-Matched Fallback

```css
@font-face{font-family:"Geist Fallback";src:local("Arial");
  size-adjust:104%;ascent-override:90%;descent-override:22%;line-gap-override:0%}
:root{--display:"Instrument Serif",Georgia,serif;
  --text:"Geist","Geist Fallback",system-ui,sans-serif}
```
Without `size-adjust` the swap reflows text and costs CLS.

## Tracking And Optical Sizing

```css
html{font-optical-sizing:auto}
h1{font-family:var(--display);font-size:clamp(2.75rem,7vw,5.5rem);
   line-height:0.98;letter-spacing:-0.032em;font-variation-settings:"opsz" 144}
h2{font-size:clamp(1.75rem,3.4vw,2.75rem);line-height:1.1;letter-spacing:-0.022em}
body{font-family:var(--text);font-size:1.0625rem;line-height:1.6;letter-spacing:0}
.label{font:500 0.6875rem/1 var(--mono);text-transform:uppercase;letter-spacing:0.12em}
```
Display 40px+: -0.035em to -0.02em, more negative as size grows. Body 0. Uppercase +0.08em to +0.14em. Weights 100-300 above 60px: add +0.01em back.

## DECIDE

- Would a competitor have picked this display face? If yes, change it.
- Are the two weights at least 400 units apart?
- Do the faces differ in stroke contrast and terminal shape?
- Five font files or fewer?
- `size-adjust` fallback defined for the text face?

## NEVER

- Inter, Roboto or Poppins as the headline face
- Two sans faces from the same genre (Poppins + Montserrat)
- Faux bold or synthesized oblique
- Positive tracking on a serif display face
- A display face below 24px, or set as body copy
- `@import` in a render-blocking stylesheet instead of preconnect + `<link>`
