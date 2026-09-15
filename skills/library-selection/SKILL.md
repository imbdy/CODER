---
name: library-selection
category: decision
priority: high
frameworks: [react]
libraries: [motion, gsap, react-three-fiber, three, shadcn/ui]
triggers: [library, choose, motion, gsap, three, r3f, aceternity, react bits, effect selection]
description: Effect selection matrix — choose minimal appropriate tech, not the most impressive.
---

# Library Selection — Effect Matrix

Complexity must be justified.

```
Need simple hover / focus?                → CSS
Need React state transition?              → Motion
Need shared element (layoutId)?           → Motion layoutId
Need viewport reveal?                     → Motion whileInView
Need micro-interaction (tap/drag)?        → Motion
Need timeline / choreographed sequence?   → GSAP timeline
Need scroll choreography (scrub/pin)?     → GSAP + ScrollTrigger
Need simple scroll parallax?              → Motion useScroll
Need complex scroll (pin+scrub+timeline)? → GSAP
Need accessible primitive?                → shadcn/ui
Need creative animated component?         → React Bits pattern (restrained)
Need marketing flair (beams, aurora)?     → Aceternity (sparingly)
Need 3D scene?                            → R3F + Drei
Need max perf simple effect?              → CSS
```

## Toolbox Ladder

`CSS → Motion → GSAP → ReactBits/Aceternity → R3F`

Not `ReactBits + Aceternity + GSAP + Motion + Three` everywhere.

## Cost Question

- Does 3D improve story vs CSS depth? If not, CSS.
- Could Motion variant do this vs GSAP timeline? If yes, Motion.
- Is this library already in project? Prefer reuse.

## Checklist

- Lowest ladder rung that solves?
- Complexity justified vs benefit?
- Fallback for touch/reduced-motion?
