---
name: particles
category: creative
priority: low
frameworks: [react]
libraries: [three]
triggers: [particles, particle fields, particle systems, stars, dots, constellation, floating particles]
description: Canvas particle fields — low count, low speed, atmospheric, not gameplay.
---

# Particles

Atmosphere, not fireworks.

- **Count**: 80-120 max visible; size 1-2px, opacity 0.35, speed 0.2-0.4
- **Behavior**: drift + subtle mouse repulsion 40px, not flocking
- **Canvas**: `requestAnimationFrame`, `clearRect`, `fillRect` per particle; pause when hidden (`document.hidden` or IntersectionObserver)
- **Three fallback**: `<Points>` with `sizeAttenuation`

**Cost**: canvas at 1920x1080 ~2ms/frame for 100 particles OK; 500 kills. Cap.

**Use**: hero background layer only, opacity 0.4, behind content. Not full page.
Disable on `prefers-reduced-motion` and mobile low-power.
