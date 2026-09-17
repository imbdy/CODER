---
name: art-direction
category: design
priority: high
frameworks: []
libraries: []
triggers: [art direction, visual direction, identity, mood, aesthetic, premium, cinematic, distinctive, look and feel, brand]
description: Convert a brief into ONE named art direction - substrate, type voice, palette, bias, signature move.
---

# Art Direction

You are design lead at a studio known for identities that could not be mistaken for anyone else's. The client already rejected three templated proposals. No stated direction means slop by default.

## The Five Ingredients

Fix all five before writing CSS, as a comment at the top of the file.

1. **Substrate** - the page's material, as a hex: bone paper, ink black, warm graphite, blueprint wash. Never "white" by default.
2. **Type voice** - display face + text face (+ optional mono), with weight extremes named.
3. **Palette temperature** - warm (amber/vermilion/clay), cold (steel/ice/phosphor), or neutral + one signal. ONE accent.
4. **Compositional bias** - left-ruled asymmetry, centered monument, diagonal split, editorial two-column, full-bleed image with overlaid type, or dense data grid.
5. **Signature move** - one gesture repeated 3-5 times that a viewer would recognize on the next page.

## Name It In One Sentence

Adjective + noun + the move: "Archival Technical - bone paper, mono labels, vermilion accent, annotation margins." No one-sentence name means preferences, not a direction.

## Seven Directions

- **Archival Technical** - substrate #f3efe6, IBM Plex Mono labels + Newsreader headlines, 1px #ddd6c6 rules, vermilion #d8420f, left-ruled asymmetric grid. Move: 11px mono margin annotations.
- **Brutalist Editorial** - #ffffff, Archivo Black 900 at clamp(3rem, 9vw, 7rem), radius 0, 3px #111 borders, accent #1a4bff. Move: the headline breaks past the container edge.
- **Nocturne Cinematic** - page #0b0c0e, surface #14161a, Fraunces 300 italic display, Geist body, sodium #f0a46b, centered monument. Move: top-down light gradient + vignette.
- **Swiss Clinical** - #fafafa, Familjen Grotesk 500, rigid 12-col grid, text #0a0a0a, one #e8341c mark. Move: everything snaps to a 4px baseline, nothing is centered.
- **Sun-bleached Analog** - #ecdfc8, Instrument Serif display, DM Sans body, terracotta #b4542f + olive #5c6440, 3% grain. Move: duotone imagery.
- **Terminal Precision** - #07090b, JetBrains Mono throughout, phosphor #46e08a, 1px #1c2227 column rulers, tabular data. Move: gutter rulers with row indices.
- **Gallery Quiet** - #f7f6f4, Playfair Display 400 very large, 11px uppercase labels tracked 0.14em, 70% whitespace. Move: captions in the left margin, beside the image.

## The One Justified Risk

Exactly one decision per direction should be able to fail: a 7rem headline, an ugly-on-purpose face, a near-monochrome palette, type rotated 90deg in the gutter. Name it, and name the line of the brief that earns it. Zero risks = template. Two or more = noise.

## Check Everything Against It

Before adding any element: which ingredient does this express? None -> delete it. If a component's radius, shadow or accent contradicts the direction, the component is wrong.

## DECIDE

- Substrate hex written down?
- Display + text face named, and neither is Inter or Roboto?
- One accent, one temperature?
- Compositional bias chosen, and it is not "centered hero"?
- Signature move present at least 3 times?
- One risk named and justified against the brief?

## NEVER

- Blend two directions to hedge
- Purple-to-blue gradient as the identity
- Centered hero + three feature cards + pricing grid
- A second accent because a section "felt empty"
- A UI library's default radius/shadow/color overriding the direction
- "Modern", "clean" or "sleek" as the whole direction, with no hexes or faces
