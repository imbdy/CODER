---
name: background-systems
category: design
priority: medium
frameworks: [react]
libraries: []
triggers: [gradient fields, aurora, noise, grain, mesh gradients, particles, stars, beams, glows, grid, dots, waves, vortex, webgl backgrounds, shader backgrounds, atmosphere, depth]
description: Background layering system — base + atmosphere + depth hierarchy.
---

# Background Systems (extended)

See `backgrounds` for base; this handles **systems**.

- **Mesh gradient**: 3-4 radial blobs 700px `blur(70)` at 20%, 80%, 50% positions, opacity 0.5, drift via `transform` 24s
- **Grid + glow**: grid 24px #23262E behind, glow `radial-gradient(600px, amber 0.08, transparent)` on top
- **Beams**: Aceternity-style vertical 1px lines with moving gradient — one per hero side, not 10
- **Vortex/waves**: canvas only if hero story demands; else CSS

**Selection**:

```
Need subtle depth?     → radial gradients + noise
Need editorial?        → grid + vignette
Need futuristic?       → aurora single layer
Need data flow?        → beams (2 max)
Need starfield?        → particles 80
```

**Avoid**: combining aurora + beams + particles + grid + noise at 0.6 each → mud.

**Fallback**: `prefers-reduced-motion` → static gradient, no drift.
