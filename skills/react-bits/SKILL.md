---
name: react-bits
category: creative
priority: medium
frameworks: [react]
libraries: []
triggers: [react bits, animated components, backgrounds, text animations, cursor effects, cards, navigation, galleries, parallax, scroll effects, particles, glows, distortion, aurora, particle fields, floating elements, magnetic, glow, text reveals, split text, parallax, tilt cards, 3d cards, marquees, morphing, shader]
description: React Bits as reference — aurora, particles, glows, text reveals, tilt, marquees; use as pattern library, not blind copy.
---

# React Bits — Creative Reference

https://reactbits.dev — collection of animated components, backgrounds, text, cursors, cards.

Treat as **pattern library**, not copy-paste source. Understand principles behind patterns.

## Key Patterns

- **Aurora / Gradient field**: layered blurred gradients `filter: blur(60px) opacity(0.5)` + slow `transform` drift 20s, not 2s
- **Particles**: `react-three-fiber` points or `canvas` 80-120 particles, size 1-2px, speed 0.3, opacity 0.4; limit to background layer
- **Glow / Glows**: `box-shadow` glow as signal on hover `0 0 24px rgba(255,122,26,0.35)` not static glow everywhere
- **Text reveal**: split per word/char `staggerChildren 0.04` + `y: 100% → 0%` with `clipPath` or `overflow hidden`
- **Tilt / 3D cards**: `rotateX/Y` tied to mouse `useMotionValue` + `perspective 1000px`, glare `radial-gradient` at cursor
- **Infinite marquee**: `gsap` or `motion` x from 0 → -50% loop linear `duration 20` `ease: linear`, pause on hover
- **Parallax / Scroll reveals**: `whileInView` with `y: 24 → 0`
- **Morphing**: `clipPath` or `border-radius` 16 → 32 + Motion `layout`
- **Distortion / Shader**: via `framer-motion` not heavy shader unless justified

## When to Use

- Aurora/particles: hero atmosphere only, one layer
- Text reveal: hero display only, not every paragraph
- Tilt: product card primary, not all cards
- Marquee: logos/testimonials, not hero

## Decision

Ask: does this pattern support story? Aurora for futuristic product yes, for dense dashboard no. Tilt for product preview yes, for table no.

## Implementation Notes

- Many React Bits components are standalone; extract principle, re-implement with Motion/tailwind
- Keep bundle small — don't install entire bits lib if one pattern needed
- Mobile: disable 3d tilt, reduce particles 50%

## Anti-Pattern

- Effect soup (aurora + particles + glow + tilt + marquee on one page)
- Copying exact React Bits demo look → adapt to your design language
