---
name: gsap
category: animation
priority: high
frameworks: [react]
libraries: [gsap]
triggers: [gsap, timeline, ScrollTrigger, scrub, pin, choreography, cinematic, sequence, svg animation, stagger, easing]
description: GSAP for timelines, scrub, pinning, complex scroll choreography — prefer timelines over scattered delays.
---

# GSAP

Official: https://gsap.com/docs/

Use GSAP when: complex timelines, precise choreography, cinematic sequences, scrub/pin, SVG, advanced easing.

## Essentials

```js
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
gsap.registerPlugin(ScrollTrigger)

// Timeline (preferred)
const tl = gsap.timeline({ defaults: { duration: 0.6, ease: "power3.out" } })
tl.from(".hero-title", { y: 40, opacity: 0 })
tl.from(".hero-p", { y: 24, opacity: 0 }, "-=0.3") // overlap
tl.from(".hero-visual", { scale: 0.96, opacity: 0 }, "-=0.4")

// ScrollTrigger + scrub
gsap.to(".product", {
  y: -80,
  scrollTrigger: {
    trigger: ".section",
    start: "top bottom",
    end: "bottom top",
    scrub: 1,
  }
})

// Pin + timeline
const st = gsap.timeline({
  scrollTrigger: {
    trigger: ".sticky-wrap",
    pin: true,
    scrub: 1,
    start: "top top",
    end: "+=120%",
  }
})
st.to(".card-a", { y: -40, opacity: 1 })
st.to(".card-b", { y: -80, opacity: 1 }, 0.2)

// React cleanup
useEffect(() => {
  const ctx = gsap.context(() => { /* animations */ }, ref)
  return () => ctx.revert()
}, [])
```

## Choreography Principle

BAD: scattered delays

```
A delay 0, B delay 0.4, C delay 1.1, D delay 2.0  // fragile
```

BETTER: master timeline

```
tl
  scene1 (title + p)
  scene2 (visual, overlap -=0.3)
  scene3 (cards stagger 0.08)
```

## Easing

- `power3.out` for enters, `power2.inOut` for moves, `expo.out` for cinematic
- Springs via `gsap` not manual

## Performance

- Target transforms, use `will-change` via gsap `autoAlpha`
- Kill on unmount `ctx.revert()`, `ScrollTrigger.kill()`
- Limit scrub to 1-2 elements; many scrubs kill perf

## Choice

- Simple viewport reveal → Motion `whileInView` (lighter)
- Complex scrubbed narrative → GSAP
