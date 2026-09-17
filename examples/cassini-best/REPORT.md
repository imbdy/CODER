# Cassini Instruments — best build

Engine: **deterministic design engine** (`--brain deterministic`).
Rendered and measured with the project's own browser harness at 1440×900, 834×1112 and 390×844.

## The brief

> Build the site for Cassini Instruments, a company that makes a single hand-built film
> scanner. I want it to feel like the instrument itself: precise, mechanical, quiet,
> expensive. Absolutely no AI-SaaS look, no purple, no glass, no floating gradients, no
> stock photography, and no three-identical-cards features section. The hero should state
> what the machine does in one sentence and show one specification. Below that I want the
> mechanism explained in three moves, a specification table with real figures, one quote
> from a working archivist, and a single closing action.

## What the automated checks say

| Group | Result |
|---|---|
| Brief coverage | 4/4 — spec table, quote, stepped explanation, closing action |
| Rejections honoured | 6/6 — no purple, no glass, no soft gradients, no identical cards, no stock photography, no AI-SaaS copy |
| Hero | 2/2 — one-sentence headline, a specification in the fold |
| Craft | 7/7 — measure 62ch, no overflow at any viewport, no contrast failures, no console errors, reduced-motion guard, separate files |

Sections: nav · hero · three moves · specification table · quote · closing action · footer.
Pricing and FAQ were planned away because the brief enumerates its own page.

## What the checks do NOT say

Every gate above is structural. Three things are still weak, and no automated check
catches them:

1. **The three moves are not the mechanism.** The brief asks for "the mechanism explained
   in three moves" — how the scanner works. The page ships "Describe the outcome / Do the
   smallest useful version / Refine against evidence", which is generic product-process
   copy that would suit any product. This is the single biggest gap between this page and
   the brief.
2. **The quote is not from an archivist, and there are two.** The brief asks for "one
   quote from a working archivist". The page carries two testimonials attributed to a head
   of operations and a founder.
3. **The hero does not say what the machine does.** "Every unit, documented: 48 parts, all
   replaceable." is a claim about the company's transparency, not a sentence describing
   the instrument.

The figures in the specification table are plausible placeholders, as the engine itself
notes in its build record — they are not measurements of a real instrument.

## Fixed in this build

- The three moves render as the intended three-column grid. The markup emitted
  `<ol class="process">` while every rule targeted `.process__steps`, so the section
  matched no CSS at all and rendered as full-width body text — the cause of the
  long-standing paragraph-measure finding (103ch measured honestly; 62ch now).
- The paragraph measure is now computed from the real advance width of the font's "0"
  glyph rather than an assumed 0.5em, which had over-reported every measure by ~20%.
- The sticky nav no longer uses a backdrop blur, because the brief rules out glass.
- Both nav links resolve. The nav previously carried three dead anchors, one of them
  pointing at the pricing section the planner had deliberately dropped.

## Files

`index.html`, `styles/main.css`, `scripts/main.js`, and six screenshots in `shots/`.
