---
name: distortion
category: creative
priority: low
frameworks: [react]
libraries: []
triggers: [distortion, shader distortion, image distortion, liquid effects, displacement, glitch, morphing elements]
description: Distortion via clip, SVG filter, or shader — advanced, use only when materially improves.
---

# Distortion

High cost, high impact — use sparingly.

- **CSS**: `filter: url(#distort)` SVG turbulence `feTurbulence` + `feDisplacementMap` scale 12 on hover; not static
- **Liquid**: `border-radius` morph 24% → 32% via Motion `layout`
- **Image displacement**: hover `scale 1.05` + `filter: contrast(1.1)` cheaper than shader

**Shader** only if story needs: fluid hero, product warp. Prefer R3F shader via `useFrame` with `ShaderMaterial`, but fallback static.

**Rule**: Ask "does distortion reinforce brand?" — futuristic data product maybe yes, dashboard no.
