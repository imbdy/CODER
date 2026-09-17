---
name: landing-narrative
category: design
priority: high
frameworks: []
libraries: []
triggers: [sections, structure, narrative, storytelling, page flow, landing page, information architecture, arc]
description: Section architecture as a narrative arc - the 5 arcs, what earns a section, pacing by density.
---

# Landing Narrative

A page is an argument in order, not a stack of modules.

## The 5 Arcs

- **Proof-led** — hero, named customer result, mechanism, objection, pricing, one CTA. Fits: crowded category, buyer already knows the problem.
- **Problem-led** — hero states the cost of today, evidence it is real, the shift, the product as the shift, proof, CTA. Fits: new category, buyer has the pain but no vocabulary.
- **Product-led** — hero, interface shot, three capabilities each with a real screen, integrations, pricing, CTA. Fits: technical buyer who wants to see it.
- **Manifesto-led** — a claim about how work should be, why the old way persisted, the product as consequence, who agrees, CTA. Fits: opinionated tool, design-forward audience.
- **Demo-led** — hero is the interactive thing, then what just happened, then limits, then CTA. Fits: single-action utility you can try in 5 seconds.

## What Earns a Section

Each section answers exactly one question the previous section raised. Write the questions before the sections:

| Section type | Question it answers | Failure mode |
|---|---|---|
| Hero | What is this and for whom? | Two focal points, no claim |
| Problem | Why does this need to exist? | Complains about a problem nobody has |
| Mechanism | How does it actually work? | Adjectives instead of a diagram |
| Product shot | What will I be looking at? | A blurred fake dashboard |
| Proof | Who already bet on this? | Logo wall with no claim attached |
| Objection | What breaks, what does it cost me? | Skipped, so the CTA feels early |
| Pricing | What do I pay and when? | Placed before the product is understood |
| Close | What do I do next? | 30-link footer as the final beat |

## The Cut-One-Section Test

Delete the weakest section. If the argument still holds, it was decoration — leave it out. Run this until deleting any section breaks the argument. Most pages land at 5-7 sections; 9+ almost always contains a restatement of the hero.

## Pacing

- Alternate **dense** and **quiet**: a 3-column spec table, then a single centered sentence at 40px.
- Never three sections of equal height and equal density in a row — that is the "template" feeling.
- Vary heights deliberately: ~90vh hero, 60vh breather, 140vh sticky mechanism, 50vh proof strip.
- Change the container too: full-bleed, then 1200px, then a 640px measure. Same width three times reads as a CMS.
- One section per page may be visually loud. Two loud sections cancel each other.

## How to End

One action, restated in the user's words, with the smallest next step visible ("Scan a repo - takes about a minute, no card"). Under it: one reassurance line. Not a wall of links, not a second pricing table, not a newsletter box competing with the CTA.

## DECIDE

- Which of the 5 arcs is this page? Name it before writing sections.
- For each section, write the one question it answers. No question, no section.
- Which single section is loud? Which is the quiet one right before the close?
- Does any section merely restate the hero in other words? Cut it.
- Does pricing come after the reader understands the mechanism?

## NEVER

Hero + 3 feature cards + testimonial + CTA by default. A section that restates the hero. A logo wall with no claim beside it. Pricing before the product is understood. Four identical card grids down the page. "Features" as a section title. A FAQ used to hide the objections the page should answer directly.
