---
name: parallax
category: animation
priority: medium
frameworks: [react]
libraries: [motion, gsap]
triggers: [parallax, scroll parallax, depth parallax, parallax images, layered parallax]
description: Subtle depth parallax ±16-40px via scroll, not seasick 200px.
---

# Parallax

Depth cue, not seasick.

- **Subtle range**: `±16 to 40px` max. Not 200.
- **Layered**: near 1.2 speed, far 0.6
- **Implementation** Motion:
```jsx
const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] })
const y = useTransform(scrollYProgress, [0,1], [20, -20])
<motion.div style={{y}} />
```
GSAP for complex scrub: `gsap.to(el, { y: -40, scrollTrigger:{scrub:1}})`

- **Image parallax**: container `overflow-hidden` + inner image `scale 1.1` + `y` -16 to 16

## Rules

- Disable on `prefers-reduced-motion` and on mobile coarse pointer
- Limit to 1-2 layers per viewport
- Test performance: parallax uses transform only
