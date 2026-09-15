---
name: image-media
category: design
priority: medium
frameworks: [react]
libraries: [motion, gsap]
triggers: [image reveal, image masking, parallax images, image distortion, video transitions, scroll-scrubbing, hover zoom, comparison sliders, gallery interactions, cinematic media]
description: Image reveals, masking, parallax, hover zoom, scrub — media as story.
---

# Image / Media Interaction

- **Reveal**: `clipPath: inset(0 100% 0 0)` → `inset(0 0 0 0)` 0.7s `power3.out` on view, or `scale 1.1 → 1` + fade
- **Masking**: SVG mask or `mask-image: linear-gradient(to bottom, black 60%, transparent)` for cinematic fade
- **Parallax**: as parallax skill ±20px via scroll
- **Hover zoom**: container `overflow-hidden` + img `scale 1.06` 0.4s
- **Comparison slider**: draggable divider `x` Motion drag with `constraintsRef`, not library unless needed
- **Gallery**: masonry via CSS `columns`, lightbox with `AnimatePresence` scale

**Performance**: `loading="lazy"`, `aspect-ratio` to prevent shift, `will-change: transform` on hover.
