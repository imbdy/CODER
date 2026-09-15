---
name: typography
category: design
priority: high
frameworks: [react]
libraries: []
triggers: [typography, font, font pairing, display typography, line height, letter spacing, hierarchy, variable fonts, fluid type, measure]
description: Typography as strongest visual identity signal — pairing, hierarchy, measure, fluid type.
---

# Typography Intelligence

Typography is identity before color.

## Pairing

- **One display + one body** is enough
- Display: distinctive (Instrument Sans, General Sans, Space Grotesk, Newsreader for editorial) — tight tracking `-0.02em`, weight 600-700
- Body/UI: neutral (Inter, System, Geist) — weight 400/500, line-height 1.6
- Avoid Inter everywhere for display; pair distinct display + neutral body → premium

## Hierarchy

Scale (4 sizes, not 7):

- Display: `clamp(2.5rem, 6vw, 4.5rem)` / `leading-[0.9] tracking-[-0.03em]`
- H2: `text-3xl md:text-4xl leading-tight tracking-tight`
- H3: `text-xl font-semibold`
- Body: `text-[15px] leading-6`, muted `text-sm text-muted`

Weight contrast more than size: display bold vs body regular creates focus without huge size gaps.

## Measure & Flow

- `max-w-[65ch]` for body, `max-w-[24ch]` for display (prevents long line)
- Line height: display 1.0-1.1, headings 1.2, body 1.6
- Letter spacing: display -0.02 to -0.04em, body 0, caps 0.08em uppercase
- Paragraph spacing: `space-y-4`, not `mb-2` everywhere

## Fluid Type

```css
/* Hero: */ font-size: clamp(2.5rem, 5vw + 1rem, 4rem);
/* Section title: */ clamp(1.875rem, 3vw, 2.5rem);
```

No jump between breakpoints.

## Implementation

- Use `font-variation` for variable fonts; `font-feature-settings: "ss01"` where appropriate
- `text-balance` for headings (Chrome) + `max-w` fallback
- Responsive: slightly larger line-height on mobile

## Anti-Patterns

- Three similar heading sizes (`text-2xl`, `text-3xl`, `text-4xl` barely distinct)
- Huge heading with thin weight + poor contrast → not focal, just big
- Centered long paragraphs >75ch

## Checklist

- Can hierarchy be felt without color?
- Does display earn its size via weight/tracking/contrast?
- Is body comfortable to read (measure, line-height)?
