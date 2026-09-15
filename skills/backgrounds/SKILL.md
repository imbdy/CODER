---
name: backgrounds
category: design
priority: medium
frameworks: [react]
libraries: []
triggers: [backgrounds, gradient fields, aurora, noise, grain, mesh gradients, particles, stars, beams, glows, grid, dots, waves, vortex, webgl backgrounds, shader backgrounds, atmosphere]
description: Layered backgrounds — base + atmosphere + depth — not 5 effects stacked.
---

# Background Systems

Layer carefully, not maximally.

## Layer Model

```
base (solid #0B0C0E or #FAFAF9)
+
atmosphere (ONE: aurora / mesh gradient / noise / grid — low opacity 0.3-0.6)
+
depth (subtle: glow behind product, vignette)
+
content
```

Example hero:

```css
.hero {
  background:
    radial-gradient(800px 400px at 20% -10%, rgba(255,122,26,0.08), transparent 60%),
    radial-gradient(600px 400px at 90% 0%, rgba(255,59,48,0.06), transparent 60%),
    #0B0C0E;
}
```

Add noise texture `opacity 0.04` via SVG turbulence for premium grain, not heavy canvas.

## Options

- **Aurora**: blurred gradient blobs 600px `blur(80px)` drift 18s linear, opacity 0.35
- **Grid/Dots**: `background-image: linear-gradient(...)` 24px grid 1px #23262E, opacity 0.4
- **Noise/grain**: `<filter><feTurbulence baseFrequency="0.8" /></filter>` 0.04 opacity
- **Mesh**: canvas fluid not needed unless story demands; prefer CSS gradients

## Avoid

- 5 backgrounds at once (aurora + particles + grid + beams + noise at 0.7)
- High opacity atmosphere competing with content

## Checklist

- Is atmosphere single and low opacity?
- Does content contrast still pass?
- Is grain/ noise subtle?
