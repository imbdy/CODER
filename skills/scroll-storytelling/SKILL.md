---
name: scroll-storytelling
category: animation
priority: medium
frameworks: [react]
libraries: [gsap, motion]
triggers: [scroll storytelling, pinning, scrubbing, parallax, sticky sections, horizontal transitions, camera movement, text reveals, masking, scroll animation, narrative, cinematic scroll]
description: Scroll as narrative — scenes, pin, scrub, parallax, sticky; not every site needs scroll demo.
---

# Scroll Storytelling

Scroll is narrative, not decoration.

## Sequence

```
Scene 1 Introduction (hero, establish)
Scene 2 Reveal (product appears, scale 0.9 → 1)
Scene 3 Transformation (features, sticky text + scrolling media)
Scene 4 Interaction (user scrubs, 3D rotates)
Scene 5 Payoff (CTA, payoff, resolve)
```

Design beats before code.

## Techniques

- **Pin**: `ScrollTrigger pin` or `position: sticky top-0` for text while media scrolls beside
- **Scrub**: animation progress tied to scroll `scrub:1` — user controls timeline
- **Parallax**: `y: -40` + `scrub`, but subtle (±16-40), not 200px
- **Sticky**: left sticky copy, right scroll cards `position: sticky top-24`
- **Horizontal**: `gsap.to(container, { xPercent: -100 * (sections-1), scrollTrigger: {pin, scrub}}) `
- **Opacity/scale choreography**: cross-fade via scrub, not jump
- **Text reveals**: `clipPath` or `gsap.from(".line", { yPercent: 100, stagger:0.08 })`

## Implementation (GSAP Preferred for Complex)

```js
// Sticky narrative
const tl = gsap.timeline({ scrollTrigger:{ trigger:".narrative", pin:".narrative", scrub:1, end:"+=200%" }})
tl.to(".step1", { opacity:1 }).to(".step1", { opacity:0 })
tl.to(".step2", { opacity:1 }).to(".step2", { opacity:0 })
```

Motion alternative for simple sticky: `useScroll` + `useTransform`.

## Restraint

- Not every site needs scroll storytelling; use when narrative benefits
- One pinned narrative per page max
- Provide reduced-motion: pin but no scrub, opacity only

## Checklist

- Is there a clear 3-5 beat story?
- Does scrub enhance control or just delay?
- Is parallax subtle (±24) not seasick?
- Keyboard still navigates (not trapped in pin)?
