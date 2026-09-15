---
name: design-review
category: process
priority: high
frameworks: [react]
libraries: []
triggers: [design review, review, hierarchy check, spacing, typography, visual noise, template, mobile, reduced motion, performance]
description: Post-implement audit — hierarchy, focal, spacing, typography, motion, noise, template feel, mobile, reduced-motion, perf.
---

# Design Review — Second Pass

Run after implementing UI, before declaring done.

## Checklist (ask each)

- Is hierarchy clear? Can viewer name focal in 3s?
- Does page have singular visual focal point, not 3 equal?
- Is spacing intentional? Measure: 4/8/16/24/40/64/96 scale, not random 13.
- Is typography strong? Display earns size via weight/tracking, body 60-75ch, line-height 1.6.
- Are interactions consistent? Hover/focus/active/loading/error exist and share language.
- Are animations purposeful? Each motion guides attention or communicates state — not decoration.
- Is there too much visual noise? Remove one effect — better? Remove it.
- Does anything feel generic/template? Bento-by-default, huge heading + 3 cards, random gradient → need asymmetry, stronger type, editorial overlap.
- Does mobile work? Not just stacked desktop; hierarchy re-thought for 390.
- Does reduced motion work? Parallax/scrub disabled, opacity fallback.
- Is performance reasonable? 60fps scroll, images lazy, no layout thrash, 3D <100k?

## Process

1. Screenshot mentally: squint — what's focal?
2. Measure spacing: any outlier?
3. Read typography: hierarchy audible without color?
4. Interact: tab through, hover all buttons — states exist?
5. Motion: disable JS — still usable? Enable reduced-motion — calm?
6. If any weak, do second pass: one focused improvement (e.g., stronger type, asymmetry) not five tweaks.

## Output

Summarize: "Review: hierarchy strong, spacing Intentional, but hero generic — added editorial overlap and tighter display tracking."

If user said "looks generic", this skill is mandatory second pass.
