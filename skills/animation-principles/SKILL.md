---
name: animation-principles
category: animation
priority: high
frameworks: [react]
libraries: [motion, gsap]
triggers: [animation, timing, easing, staging, hierarchy, rhythm, continuity, weight, momentum, anticipation, choreography]
description: Timing, spacing, easing, staging — animation communicates hierarchy, not just moves.
---

# Animation Principles

Animation is communication: *what should the user notice, when, and how does movement convey it?*

## Core Principles

- **Timing**: UI micro 120-200ms, transitions 240-360ms, cinematic 600-900ms. Faster feels snappy; slower feels weighty.
- **Spacing**: easing defines weight — `easeOut` ([0,0,0.58,1]) for enters (decelerate, feels natural), `easeIn` for exits, `easeInOut` for moves. Springs for playful: `stiffness 320, damping 26`.
- **Staging**: reveal focal first (100ms), secondary stagger 60-90ms, supporting last. Don't stagger everything equally — stagger groups.
- **Hierarchy**: largest motion on focal (hero), subtle on secondary. Not every card animates same amount.
- **Anticipation**: tiny pull-back before major move (e.g., button press 0.97 scale for 80ms before release)
- **Follow-through**: elements settle with overshoot 2-4% then settle via spring, not linear snap
- **Continuity**: shared element via `layoutId` keeps object identity across routes
- **Easing choice**:
  - Natural: `cubic-bezier(0.16,1,0.3,1)` (easeOutExpo)
  - Snappy UI: `spring(320,26)`
  - Cinematic: `power3.out` (GSAP) / `easeOut [0.16,1,0.3,1]`

## Decision

Ask before animating:

- What should user notice? (motion draws attention — use sparingly to guide)
- When? (enter order = reading order)
- How does motion reinforce meaning? (e.g., upward motion = progress, scale = importance)

## Anti-Patterns

- Same `delay: i*0.1` for 12 items → robotic. Use `staggerChildren` with `staggerDirection` variation
- Overusing `easeInOut` for enters → feels sluggish; use `easeOut`
- Animating `height`/`width` → use `scaleY` or `clipPath` with `layout`

## Implementation Hints

- Motion `variants` for orchestration: parent controls `staggerChildren`
- GSAP `timeline` for choreographed scenes, not scattered `setTimeout`s
- Respect `prefers-reduced-motion` — fallback to `opacity` only

## Checklist

- Does motion guide attention to focal?
- Is stagger grouped, not uniform?
- Is easing intentional (out for enter)?
- Is there continuity via shared layout?
