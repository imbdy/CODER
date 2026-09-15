---
name: page-transitions
category: animation
priority: medium
frameworks: [react, next]
libraries: [motion, gsap]
triggers: [page transition, shared element, layout transition, route transition, AnimatePresence, page wipe, continuity]
description: Layout and shared element transitions for continuity between routes/states.
---

# Page Transitions

Continuity matters.

- **Motion `layoutId`**: element with same `layoutId` across routes animates position/size automatically — use for hero image → detail, card → modal.
```jsx
// List
<motion.div layoutId={`card-${id}`} />
// Detail
<motion.div layoutId={`card-${id}`} />
// Wrapped in <AnimatePresence>
```
- **AnimatePresence mode="wait"**: stagger exit then enter, not overlap chaos.
- **GSAP page wipe**: for full page cinematic: `gsap.timeline().to(".wipe", {scaleY:1})` → route change → `to(".wipe",{scaleY:0})`.

Keep transitions <360ms; shared element handles sophistry without heavy code.
Respect reduced-motion: disable layout transition, keep opacity.
