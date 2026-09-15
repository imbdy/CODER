---
name: responsive-design
category: design
priority: high
frameworks: [react]
libraries: []
triggers: [responsive, mobile, tablet, desktop, touch, breakpoints, adaptive, fluid]
description: Responsive as design problem — not stacking, rethinking hierarchy per breakpoint.
---

# Responsive Design

Design each breakpoint intentionally; motion must adapt.

## Breakpoints as Design Modes

- **Desktop 1280+**: focal side-by-side, layered depth, hover interactions, cursor
- **Laptop 1024**: tighten spacing, maybe 2-col → maintain focal
- **Tablet 768**: reduce columns, increase whitespace, maintain visual path
- **Mobile 390**: rethink hierarchy — often single column but with stronger type and tighter rhythm, not just collapsed desktop

## Techniques

- Fluid: `clamp()`, `%`, `flex`, `grid` intrinsic > fixed `md:` jumps
- Container queries: `@container` for card internals
- Touch vs mouse: large tap targets 44px, no hover-only affordances
- Re-order: `order-1 lg:order-2` to keep focal first on mobile

## Animation Adaptation

- Desktop: parallax, drag, magnetic cursor, 3D tilt
- Mobile: disable parallax/magnetic, keep fade/reveal; reduce duration 30%
- Always `prefers-reduced-motion` → opacity only

## Verification

- Test 390, 768, 1280, 1440
- Does mobile have its own composition, not just stacked desktop?
- Are animations still purposeful on mobile or disabled?
