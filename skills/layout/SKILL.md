---
name: layout
category: design
priority: high
frameworks: [react]
libraries: []
triggers: [layout, grid, flexbox, responsive, container, clamp, breakpoints, css grid, aspect ratio, sticky, absolute positioning, z-index, overlap, full-bleed]
description: Teaches intentional responsive layouts beyond stacking desktop.
---

# Layout Intelligence

## Core Tools

- **CSS Grid** for 2D composition, **Flexbox** for 1D alignment; prefer Grid for page sections
- **Container**: `max-w-[1280px] mx-auto px-6` + full-bleed wraps for heroes
- **Fluid type/spacing**: `clamp(2.5rem, 6vw, 4rem)` for hero; `clamp(16px, 2vw, 24px)` for padding
- **Intrinsic sizing**: `minmax()`, `auto-fit`, `min-content` > fixed breakpoints

## Grid Recipes

- 12-col: `grid-cols-12 gap-6` — span `col-span-8` + `col-span-4` creates asymmetry
- Editorial split: `lg:grid-cols-[1.1fr_0.9fr]` for hero text/product
- Product + code: `grid lg:grid-cols-2` but on mobile re-order via `order-*` not just stack
- Bento: only if `auto-rows-[minmax(0,1fr)]` and content variation justifies; else use masonry or timeline

## Responsive as Design

Not afterthought:

- Desktop (1280): focal + secondary side-by-side, layered depth
- Tablet (768): reduce columns, increase whitespace, maintain focal
- Mobile (390): rethink hierarchy — often stack but with stronger type scale and tighter spacing
- Use `container queries` where available for component-level responsiveness

## Layering

- `relative` + `absolute` for overlaps (product card overlapping hero text)
- `sticky` for scroll storytelling (pin left text, scroll right media)
- `z-index` scale: base 0, surface 10, overlay 50, nav 40 — don't sprinkle z-50 everywhere
- Full-bleed: `w-screen relative left-1/2 -translate-x-1/2` for breakout sections

## Performance & Stability

- Use `transform` and `opacity` for animation, not `width/height`
- `aspect-ratio` for media to avoid layout shift
- `content-visibility: auto` for long pages

## Anti-Patterns

- Stacking desktop 3-col to mobile single column without rethinking type/spacing
- Every section `rounded-3xl border shadow-xl` → flat, intentional borders only where needed
- Fixed `h-[600px]` heroes → use `min-h-[80vh]` + flex center

## Checklist

- Does mobile have intentional hierarchy, not just collapsed desktop?
- Are overlaps intentional and not breaking at breakpoints?
- Is grid consistent across sections?
