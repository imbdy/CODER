---
name: color-systems
category: design
priority: high
frameworks: []
libraries: []
triggers: [color, colour, palette, accent, contrast, dark mode, light mode, theme, gradient, color scheme]
description: Palette math - dominant substrate plus one accent, oklch state steps, verified contrast ratios.
---

# Color Systems

Palettes fail by being evenly distributed. One dominant substrate plus one signal accent reads as designed; five balanced brand colors read as a theme picker.

## 60 / 30 / 10

60% substrate, 30% secondary surface and text mass, 10% accent. The accent appears 2-5 times per viewport: one CTA, one active state, one rule or numeral. If you cannot count its uses, there are too many.

## Dark Substrates: Not #000, Not Default Slate

`#000` leaves no value below it, so layering dies; `#0f172a` slate + indigo is the AI tell. Tint toward the direction's temperature at 4-8% saturation, +4 to +6 L* per layer, three layers max:

- warm graphite: `#0b0c0e` -> `#14161a` -> `#1c1f24`
- green-black: `#06110f` -> `#0d1c19` -> `#142824`

## oklch For Perceptual Steps

```css
:root{
  --a-l:68%; --a-c:0.16; --a-h:45;
  --accent:       oklch(var(--a-l) var(--a-c) var(--a-h));
  --accent-hover: oklch(calc(var(--a-l) + 6%) var(--a-c) var(--a-h));
  --accent-press: oklch(calc(var(--a-l) - 8%) var(--a-c) var(--a-h));
  --accent-quiet: oklch(var(--a-l) calc(var(--a-c) * 0.28) var(--a-h) / 0.14);
}
```
Hover = +6% L on dark, -8% L on light. Quiet fills: same hue, chroma x 0.25-0.3, alpha 0.10-0.16. Never derive a state with `opacity` on the element.

## Contrast Targets

Body text >= 4.5:1. Text >= 24px or >= 19px bold: 3:1. Control borders, focus rings, icon-only buttons: 3:1. Decorative hairlines are exempt and correctly land near 1.3:1. Compute, never eyeball.

## Eight Verified Palettes

substrate / surface / text / muted (ratio) / hairline / accent / accent-hover

- **Ink Nocturne** `#0b0c0e` / `#14161a` / `#f2f0ed` / `#a3a09a` (7.5) / `#23262b` / `#f0a46b` / `#ffb884`
- **Graphite Signal** `#17181a` / `#1f2124` / `#ededf0` / `#9c9ea4` (6.6) / `#2c2f34` / `#f2c200` / `#ffd42b`
- **Terminal Phosphor** `#07090b` / `#0e1114` / `#d9e0e4` / `#8b979d` (6.7) / `#1c2227` / `#46e08a` / `#6cf0a6`
- **Deep Lagoon** `#06110f` / `#0d1c19` / `#e4efeb` / `#8ba49e` (7.2) / `#17302c` / `#35c4b3` / `#58d8c8`
- **Bone Archive** `#f3efe6` / `#fbf9f4` / `#14120e` / `#6b6558` (5.0) / `#ddd6c6` / `#d8420f` / `#ae330b`
- **Swiss Paper** `#fafafa` / `#ffffff` / `#0a0a0a` / `#5f5f5f` (6.1) / `#e4e4e4` / `#e8341c` / `#c02510`
- **Clay Studio** `#ecdfc8` / `#f6eddc` / `#231a10` / `#6a5b45` (5.0) / `#d3c3a6` / `#b4542f` / `#8e3f21`
- **Oxblood Editorial** `#fffdfb` / `#f7f2ec` / `#17100e` / `#6d5f59` (6.0) / `#e3d8d0` / `#7d1128` / `#5c0a1d`

Light-substrate accents (`#d8420f` 3.9, `#e8341c` 4.1, `#b4542f` 3.8) clear 3:1 for UI and large text but fail body text - set accent *text* in the darker hover value (5.5-5.7:1). Borders needing 3:1: `#8f8f8f` on `#fafafa` (3.1), `#5a5f66` on `#0b0c0e` (3.0).

## Gradients

One atmospheric layer per page, behind content, in the accent hue:

```css
body{
  background:
    radial-gradient(120% 80% at 50% -10%, oklch(68% 0.08 45 / 0.18), transparent 60%),
    var(--l0);
}
```
Never on text, never two stacked, never purple-to-blue on white.

## DECIDE

- Substrate: dark or light, and which temperature hue?
- One accent hue - can you count its uses per viewport?
- Muted text ratio computed at >= 4.5:1, not guessed?
- Hover/press derived by an L shift, not opacity?
- Gradients: zero or exactly one?

## NEVER

- slate-900 + indigo-500 as the identity
- Two accents because "primary and secondary"
- `rgba(255,255,255,0.4)` for body copy (lands near 2.5:1)
- Semantic success/warning colors reused as brand accents
