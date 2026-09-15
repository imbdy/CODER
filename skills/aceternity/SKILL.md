---
name: aceternity
category: creative
priority: medium
frameworks: [react, next]
libraries: []
triggers: [aceternity, background beams, aurora, 3d marquee, hero parallax, moving borders, spotlights, tracing beams, sticky scroll, glowing cards, glare cards, floating navbar, direction-aware hover, vortex, wavy backgrounds]
description: Aceternity as marketing flair reference — beams, spotlights, sticky scroll, glare; use when supports story.
---

# Aceternity UI

https://ui.aceternity.com — highly interactive marketing patterns.

Use sparingly, when supports visual story, not default.

## Core Patterns

- **Background beams**: vertical beams `gradient` + `animate` translateY infinite, opacity 0.6; behind hero only
- **Spotlight**: cursor spotlight `radial-gradient(600px circle at x y, rgba(255,255,255,0.15), transparent)` via mouse
- **Hero parallax**: 2-3 columns `y` parallax `useTransform(scrollYProgress, [0,1], [0, -100])` staggered columns
- **Tracing beam**: scroll progress line left of content `scaleY` via `scrollYProgress`
- **Glare / Glowing cards**: tilt + glare `linear-gradient` at cursor angle; hover only
- **Floating navbar**: `useScroll` hide on down, show on up, blur `backdrop-blur-xl`
- **Wavy / Vortex**: canvas noise waves — hero only, pause if not in view
- **Infinite moving cards**: marquee via `gsap` with pause on hover

## Principle

> Use when it supports story.

Marketing hero: beams + spotlight can reinforce futuristic AI product; dashboard tables: not.

Avoid: 3 aceternity effects per page → soup. One signature per section max.

## Implementation

- Aceternity components often require `clsx` + `tailwind-merge`; copy component then restyle to your tokens (ink/amber not default)
- Performance: canvas beams use `requestAnimationFrame` cleanup; disable on mobile

## Checklist

- Does effect reinforce product story (beams for data flow)?
- Is there at most one aceternity flair per viewport?
- Mobile fallback (static gradient vs canvas)?
