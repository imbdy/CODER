---
name: visual-design
category: design
priority: high
frameworks: [react, vite]
libraries: []
triggers: [visual hierarchy, composition, spacing, typography, color, contrast, density, grid, editorial, minimalism, brutalist, futuristic, premium product, marketing site, landing page, visual language, redesign, beautiful, cinematic]
description: Teaches composition, hierarchy, spacing, color, density, grids — how to make interfaces feel intentional.
---

# Visual Design Intelligence

> Before components, there is composition. Before decoration, there is hierarchy.

## First Questions

For any screen, answer before code:

- Primary focus? (1 thing, not 3)
- Secondary? (where eye goes next)
- Supporting? (what can be de-emphasized)
- Rhythm? (alternating dense/air, repetition with variation)
- Density? (Linear dense vs Apple airy — choose intentionally)
- Focal contrast? (size, weight, color, isolation)

## Composition

- **Contrast** creates focus: scale, weight, color, whitespace isolation
- **Asymmetry** often beats centered stacks for premium/marketing — off-center product, overlapping layers
- **Depth** = base (color) + atmosphere (gradient/aurora/noise subtle) + depth (shadows, layers) + content
  - Do not throw 5 effects on top of each other; layer one base, one atmosphere max
- **Grid**: 12-col, 24px gutter, max 1280-1440; use full-bleed for heroes/backgrounds to break containment and feel editorial
- **Intentional whitespace**: more breathing around focal, tighter in dense product areas

## Hierarchy Checklist

- Can a first-time viewer name the focal in 3 seconds?
- Are headings actually hierarchical (display 48, h2 30, h3 20) not all "text-3xl"?
- Is secondary content visually secondary (smaller, muted, inset)?
- Is there a visual path via size/weight/position, not just top-to-bottom stack?

## Spacing & Density

- Scale: 4, 8, 16, 24, 40, 64, 96 (not arbitrary 13px)
- Card padding 20-24, section gap 64-96 on desktop, 40 on mobile
- Density decision:
  - Marketing: airy, 64-96 between sections, large type
  - Product/dashboard: dense 16-24, small type 13-14, compact rows

## Color Systems

- 60-30-10: neutral 60, surface 30, accent 10 — accent is signal
- Never random purple/blue glow; choose one narrative accent (amber, orange, or neutral + single hue)
- Contrast: WCAG AA for text, but also *visual* contrast for focus (not every element high contrast)

## Density & Editorial

- Editorial layouts: overlap, bleed, pull-quote, sticky sidebar — beats equal cards
- Brutalist: raw type, borders, monochrome, high contrast — only if intentional
- Futuristic: precise grid, thin borders, mono accents, glow as signal not background

## Anti-Slop

- Doubt each effect: "does removing this improve?" → remove
- Bento by default is template signal; use only when data suits grid
- No huge meaningless headings; display type needs to earn its size via weight/tight tracking/contrast

## Verification

After implement, run design-review:
- Hierarchy clear?
- Focal distinct?
- Spacing intentional (measure)?
- Typography strong?
- Too much noise?
- Generic template? → add asymmetry / stronger type / unique texture
