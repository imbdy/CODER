---
name: cinematic-direction
category: design
priority: high
frameworks: []
libraries: []
triggers: [cinematic, immersive, award winning, awwwards, premium, high end, launch page, editorial, signature moment, art direction, film like, luxury, flagship, showcase]
description: The decision order behind award-level pages — the signature moment first, typography as architecture, one easing family, a load ladder in milliseconds, and the scoring rubric the work is judged against.
---

# Cinematic direction

The difference between a competent page and one worth looking at is not effort spread evenly. It is
**one moment designed first**, and everything else built to serve it.

## Decide in this order

1. **The signature moment.** The single frame someone would screenshot. Not the header — the moment.
   Name it in a sentence before writing any markup: *"the instrument opens and the camera passes
   through it while the headline holds."* If you cannot name it, you do not have a design yet.
2. **The tension.** One idea in conflict: precision vs. warmth, mass vs. light, archive vs. machine.
   Every later choice resolves toward that tension.
3. **The display typeface.** The identity lives here. Choose it before layout.
4. **The composition around the moment.** Where the eye lands, and what it does next.
5. **Motion, prototyped with the visual — not bolted on after.**
6. **Cut.** Three things perfect beats ten things present.

## Typography as architecture

- **Display-to-body ratio of at least 10:1.** A 180px display against 15px body is a scale *system*;
  48px against 16px is a document. Fluid with `clamp()`, never fixed.
- Negative tracking on large type: −0.02em to −0.05em. Display line-height 0.88–1.02.
- Body 16–18px, measure 45–75ch, line-height 1.5–1.7.
- Never a commodity face as the identity: Inter, Roboto, Open Sans, Lato, Arial, system-ui alone.
- Weight extremes (200 against 800) instead of 400 against 600.
- Variable fonts let weight shift on hover with no layout shift — a detail that reads as expensive.
- `text-wrap: balance` on headings, `pretty` on paragraphs. Smart quotes, en/em dashes, real ellipses.

## Colour and atmosphere

- Never `#000000` or `#ffffff`. Use `#0a0a0b`, `#fafaf8`. Pure values read as untouched defaults.
- **Monochromatic tension**: ~95% one substrate, ~5% one signature accent. One accent, used rarely,
  beats a palette.
- Functional tokens, not colour names: `--color-text-primary`, `--color-text-muted`, `--color-accent`.
- Body text clears 4.5:1 on *every* surface it lands on, not just the page background.

## Composition

- White space is material, not leftover. Asymmetry over centring.
- Let elements bleed past their container. Break the grid deliberately, having established it.
- Unexpected scale shifts create rhythm; uniform spacing everywhere reads as a template.
- One focal point per viewport. Hierarchy readable in three seconds.

## Motion

- **Custom easing is mandatory.** `cubic-bezier(0.16, 1, 0.3, 1)` for exponential-out.
  `ease`, `linear`, `ease-in-out` are the sound of an unfinished page.
- One easing family across the whole page.
- The load is a ladder, not a pile:

```
0–200 ms     structure and substrate
200–600 ms   hero line, per-line mask reveal, 60–90 ms stagger
400–800 ms   supporting line
600–900 ms   navigation
800–1200 ms  below the fold hands over to scroll
```

- Animate in relationship: things that belong together move together, with offset.
- 60 fps or cut the effect. Transform and opacity only.

## Techniques worth the budget

- **Per-line mask reveal** — wrap each line, translate from 110% inside `overflow: hidden`.
- **Clip-path reveal** on media entering the viewport.
- **Magnetic hover** on the one primary action; not on everything.
- **Variable-font weight shift** on hover, no reflow.
- **Horizontal gallery** with a visible affordance that it scrolls.
- **Branded `::selection`**, designed focus states, a designed empty/404 state.
- **Custom cursor**: opt-in only, and never on a coarse pointer.

## How the work is scored

Judge the page against this before calling it done. Weighted, 0–10 each:

| Category | Weight | 9–10 looks like |
|---|---|---|
| Typography | 25% | a real scale system, a face with a point of view, optical alignment |
| Composition | 25% | asymmetric, one clear focal point, deliberate grid breaks |
| Motion & interaction | 20% | one choreographed ladder, custom easing, nothing janky |
| Colour & atmosphere | 15% | one substrate, one accent, contrast that holds everywhere |
| Details & craft | 15% | focus states, selection colour, typographic detail, no default anything |

Bands: 0–3 amateur · 4–6 competent · 7–8 professional · 9–10 exceptional. **7 is the floor for
shipping**; below that, name the weakest category and fix that one thing.

## Automatic failures

Inter/Roboto/Arial as the identity · uniform type scale · default easing · centred everything ·
equal spacing everywhere · pure black or white · parallax on body text · three identical cards ·
glass everywhere · purple-to-blue gradients · floating orbs · unmodified icon-set icons · default
form styles · invented customer logos · decoration with no story.

## Checklist

- Can you name the signature moment in one sentence?
- Is the display-to-body ratio at least 10:1?
- One custom easing family, no defaults anywhere?
- Is the load a timed ladder rather than everything at once?
- One substrate plus one accent, no pure black or white?
- Does it score ≥7 in every category, not just on average?
