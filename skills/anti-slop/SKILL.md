---
name: anti-slop
category: process
priority: high
frameworks: [react]
libraries: []
triggers: [anti-slop, generic, ai slop, template, glassmorphism, bento, generic ai, slop]
description: Permanent policy — avoid generic AI signals, prefer intentional composition, restraint, distinct identity.
---

# Anti-Slop — Permanent Frontend Policy

Avoid generic AI dashboard/landing signals.

## FORBIDDEN (unless explicitly requested)

- Random purple/blue glow blobs everywhere
- Excessive glassmorphism (`backdrop-blur` + `bg-white/10` on everything)
- Everything inside `rounded-3xl border shadow-xl` cards
- Everything `rounded` 24px uniformly
- Huge meaningless headings `text-6xl font-bold` with no weight/tracking/contrast
- Random floating blobs with same sine 3s
- Unnecessary 3D (adds cost without story)
- Animation everywhere (every card staggered, every scroll parallax)
- Bento grid by default (only when data suits grid)
- Same hero composition every time (centered heading + subtitle + 2 buttons + 3 features)
- Generic SaaS layouts (identical spacing, identical shadows)

## PREFER

- Strong composition (clear focal, secondary, supporting)
- Distinct visual identity (one accent narrative, not rainbow)
- Intentional whitespace (more around focal, tighter in dense areas)
- Interesting typography (display + body pairing, tight tracking, `text-balance`)
- Controlled motion (subset of elements, grouped stagger, purpose)
- Visual storytelling (sequence: introduction → reveal → interaction → payoff)
- Asymmetry (off-center product, overlap `relative -top-8` on desktop)
- Depth via layered backgrounds (one base + one atmosphere max) not 5 effects
- Contrast + restraint: 60-30-10, remove one effect and it gets better → remove it

## Test

After work, ask: could this be a template? If yes, it fails anti-slop. Add asymmetry, stronger type, editorial detail, or unique interaction.

Enforce `design-review` after.
