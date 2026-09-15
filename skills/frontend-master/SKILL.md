---
name: frontend-master
category: orchestration
priority: high
frameworks: [react, vite, next]
libraries: []
triggers: [frontend, landing page, hero, dashboard, premium, redesign, visual language, beautiful, modern, interactive, cinematic, 3d, make it impressive, make it premium, portfolio]
description: Orchestrates frontend work — determines goal, inspects existing language, selects minimal skills/libraries, designs composition, implements, verifies, reviews.
---

# Frontend Master — Orchestration

You are the frontend orchestrator. Your job is to make the agent produce intentionally designed, not merely functional, frontend work on a 7B local model.

## Hierarchy

```
1. Understand visual goal (what does the user actually want to feel/do?)
2. Inspect existing app (framework, styling system, components, density, tone)
3. Identify design language (minimal editorial? dense product? marketing cinematic?)
4. Identify interaction model (static content? dashboard? scroll story? canvas?)
5. Select MINIMUM required skills (not every skill every time)
6. Select MINIMUM appropriate libraries (CSS → Motion → GSAP → ReactBits/Aceternity → R3F)
7. Design composition (focal, secondary, supporting, rhythm, grid)
8. Implement (reusable primitives, clear state ownership, semantic HTML)
9. Run build / dev and fix
10. Review (hierarchy, spacing, typography, motion purpose, noise, template feel, mobile, reduced-motion, perf)
11. Improve weak areas in a second pass
12. Verify responsiveness + accessibility
```

## Decision Framework

Before code:

- Classification:
  - Marketing site? → hero, scroll, payoff, composition, text-effects, backgrounds
  - Product UI? → density, hierarchy, command palette, empty/loading, accessibility
  - Dashboard? → bento only if data suits, else table/inspector pattern
  - Enhancement? (floating elements, cursor) → is it signal or decoration?

- Library ladder (choose lowest that solves):
  - Simple hover/state → CSS / Motion hover
  - React transition → Motion AnimatePresence, variants, layoutId
  - Complex timeline/scroll → GSAP + ScrollTrigger
  - Creative bits (aurora, parallax, glows) → ReactBits/Aceternity patterns (but restrained)
  - 3D scene → R3F only if depth/story justifies cost

## Inspection Checklist

Read before editing:

- `package.json` (framework, tailwind/css-modules/styled)
- `src/App.tsx` or `src/main.tsx`, `src/components/*`, `index.css`/`globals.css`
- Existing spacing scale, border radius, shadows, color tokens
- Preserve visual language unless redesign requested

## Composition First

For any page/section, define before components:

- Primary focal (1 thing the eye lands on)
- Secondary (where it goes next)
- Supporting (tertiary density)
- Rhythm (repetition, breathing room)
- Grid (12-col, asymmetry question: does off-center improve?)

## Implementation Rules

- Create reusable primitives (`Hero`, `Section`, `Card`) not giant pages
- Keep styling consistent: reuse tokens, avoid introducing new deps unless justified
- No giant components (>250 LOC split)
- Semantic HTML, aria where needed
- Motion: `layout`/`layoutId` for shared transitions; cleanup `useEffect` + cancel on unmount
- 3D: <60fps, dispose, mobile fallback static

## Verification

After implement:

- `npm run build` must pass
- Visual: does hierarchy read in 3 seconds? Is there a focal point? Does spacing feel intentional?
- Interaction: hover/focus/active/loading/error states exist?
- Noise: can you remove one effect and it gets better? Remove it.
- Template test: could this be a template? If yes, add asymmetry, stronger typography, or editorial detail.
- Mobile: not just stacked desktop; rethink hierarchy for 390px
- Reduced motion: `prefers-reduced-motion` disables parallax/large motion, keeps opacity

## When User Says Vague Things

- "Make hero more impressive" → inspect hero, propose 2-3 distinct directions (type-driven vs product viz vs scroll story), pick one, implement, show contrast
- "Looks generic" → audit for generic AI signals (random gradient, identical cards, huge heading + 3 features). Replace with: stronger composition, distinct type, controlled depth, single accent narrative
- "Add floating elements" → use floating-elements skill: depth layers, varied speeds, mouse/scroll influence, not identical sine waves

## Retrieve Skills

This skill selects others. Use selector output, not all skills.

## Anti-Patterns

- Injecting every skill into context (use selector)
- Adding 3D + GSAP + Motion + particles everywhere
- Copying shadcn default look without customization
- Ignoring existing design system
