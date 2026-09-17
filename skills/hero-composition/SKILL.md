---
name: hero-composition
category: design
priority: high
frameworks: []
libraries: []
triggers: [hero, above the fold, first screen, headline layout, hero section, composition]
description: Eight hero compositions with grid values, focal rules and 390px collapse - none of them a centered stack.
---

# Hero Composition

## 8 Compositions

**1. Editorial split 7/5** — `grid-template-columns: 7fr 5fr; gap: clamp(2rem,5vw,6rem)`. Type left, figure right, both top-aligned to one baseline. Eye lands on the first word. Breaks when the figure outweighs the type — cap it at 45% width.

**2. Full-bleed display type with offset lede** — headline `clamp(3.5rem,11vw,10rem)`, `line-height:.88`, cols 1-12; lede 320-420px wide in cols 8-11, one line below. Eye lands on the type mass, then drops right. Breaks if the lede is centered under the headline.

**3. Offset figure with type overlap** — figure cols 5-12 rows 1-2; headline cols 1-8 row 2 with `z-index:2` and a 40-80px overlap onto the image. Needs a contrast guard under the overlap only. Breaks when the overlap lands on a busy region.

**4. Left-ruled asymmetric with margin labels** — `grid-template-columns: 160px 1px 1fr`; col 1 holds 11px uppercase labels (`letter-spacing:.08em`) top-aligned to each block, col 2 is a `1px` hairline at 12% opacity running full height. Eye enters at the rule and travels down. Breaks if labels wrap.

**5. Stacked layers with scrim** — media `position:absolute; inset:0`, content above with `background: linear-gradient(to top, rgb(0 0 0/.72), rgb(0 0 0/.15) 60%, transparent)`, anchored bottom-left. Breaks when the scrim is a flat 50% black over the whole frame.

**6. Split-screen with vertical rule** — `grid-template-columns: 1fr 1px 1fr`, the `1px` a real element at 14% opacity, panels in differing tones. Only when two ideas are genuinely equal (before/after, two audiences); if one side is the point, use 7/5.

**7. Oversized type breaking the grid edge** — container with `margin-left: calc(50% - 50vw)` and `padding-left: clamp(1rem,6vw,8rem)`, last word clipped by `overflow:hidden` on the section. Once per site. Breaks if the clipped word carries meaning.

**8. Product frame with cropped bleed** — UI screenshot in cols 6-13 of a 12-col grid plus a bleed track, cropped by the viewport's right edge, `border-radius:12px 0 0 12px`, one hairline border, no shadow stack. Breaks with a floating perspective mockup.

## Focal + Hierarchy

- **Single-focal rule**: exactly one element wins on size, weight or contrast. A big headline *and* a bright image *and* a filled button is three competitors.
- **3-second test**: reveal the screen for 3s. You should recall the claim and one visual. "There was a lot" means the hierarchy failed.
- **CTA**: one primary (filled or high-contrast outline), secondary as a plain text link with an arrow — not a second pill. 24-40px under the lede, aligned with the type block, never centered under a left-aligned hero.

## 390px Collapse

Re-compose, do not stack. Display type to `clamp(2.25rem,9vw,3rem)`/`line-height:1.02`. Margin labels become one line above the headline. The 7/5 figure becomes a full-bleed 4:3 crop *below* the CTA. Overlaps lose the overlap and gain a rule. Height 80-92vh — never 100vh with the CTA cut off.

## DECIDE

- Which of the 8 is this, by name, before any CSS?
- What is the single focal element, and what did you weaken to let it win?
- What is visible first at 390px, and does the CTA fit without scrolling?

## NEVER

Centered heading + subtitle + two pill buttons. Three floating gradient blobs. A hero taller than ~1.2 viewports with nothing below to justify it. Two competing focal points. A device mockup at a 15-degree tilt. Text over an unguarded photo.
