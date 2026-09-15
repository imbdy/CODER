---
name: cursor-interactions
category: animation
priority: low
frameworks: [react]
libraries: [motion, gsap]
triggers: [cursor, pointer, custom cursor, magnetic, cursor follower, cursor distortion, spotlight, cursor trail, cursor-reactive]
description: Desktop enhancement with touch fallback — magnetic, spotlight, follower, but never required for use.
---

# Cursor / Pointer Interactions

Must be enhancement, not requirement.

## Types

- **Custom cursor**: dot + ring; ring follows via `spring(300,28)`, dot instant.
```jsx
const mx=useMotionValue(0), my=useMotionValue(0)
const rx=useSpring(mx,{stiffness:180,damping:18})
// div style left: rx, top: ry
```
Hide default `cursor: none` only when custom active; restore on inputs.

- **Magnetic**: button pulls toward cursor within 80px `x = (mx - cx)*0.25` spring.

- **Spotlight**: radial gradient follows cursor `background: radial-gradient(600px at ${mx}px ${my}px, rgba(255,255,255,0.08), transparent 80%)`.

- **Trails**: 3-5 trailing dots with decreasing opacity, `stagger` 0.02

## Rules

- Detect touch: `matchMedia("(pointer: coarse)")` → disable custom, keep native
- Respect `prefers-reduced-motion` → disable follower, keep static hover
- Never hide content behind cursor; pointer-independent alternative always works
- Cleanup mousemove listeners

## Performance

- Use `transform` only, debounce rAF, limit to one follower + spotlight per section
