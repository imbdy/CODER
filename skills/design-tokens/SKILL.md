---
name: design-tokens
category: design
priority: high
frameworks: []
libraries: []
triggers: [design tokens, tokens, css variables, custom properties, spacing scale, type scale, color system, colour system, theme, dark mode, palette, radius, shadows, consistency]
description: The token layer — a single :root scale for spacing, type, colour, radius, shadow and motion, instead of magic numbers.
---

# Design Tokens

Every value that appears more than once is a token. Define them once in `:root`, then only use `var(--token)`. Magic numbers scattered through a stylesheet are how designs drift.

## Required Token Set

```css
:root {
  /* space — 4px rhythm, named by intent not size */
  --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem;
  --space-6: 1.5rem; --space-8: 2rem; --space-12: 3rem; --space-16: 4rem;

  /* type — fluid, never fixed px for display */
  --text-xs: 0.78rem; --text-sm: 0.9rem; --text-base: 1rem;
  --text-lg: 1.25rem; --text-xl: 1.6rem;
  --text-display: clamp(2.2rem, 5vw + 1rem, 4.5rem);
  --leading-tight: 1.05; --leading-body: 1.6;
  --tracking-tight: -0.02em; --tracking-wide: 0.08em;

  /* colour — 60% neutral / 30% secondary / 10% accent */
  --color-bg: #0b0a09; --color-surface: #141210; --color-surface-alt: #1c1916;
  --color-text: #f5f2ee; --color-muted: #a8a29b; --color-border: #2a2621;
  --color-accent: #e06a2b; --color-accent-hover: #f07c3c; --color-on-accent: #1a0f06;

  /* shape + depth */
  --radius-sm: 6px; --radius-md: 12px; --radius-lg: 20px; --radius-pill: 999px;
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.3);
  --shadow-lg: 0 24px 60px -20px rgb(0 0 0 / 0.55);

  /* motion */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 140ms; --dur-base: 240ms; --dur-slow: 520ms;

  /* layout */
  --container: 72rem; --gutter: clamp(1rem, 4vw, 2.5rem);
}
```

## Usage Rules

- One accent colour. If two things compete for attention, neither wins — demote one.
- Contrast: body text ≥ 4.5:1 against its background, large text ≥ 3:1. Check the muted colour, it is the usual offender.
- Density is a decision: pick one rhythm (tight product UI vs airy marketing) and keep it for the whole page.
- Change theme by overriding tokens, never by rewriting rules:

```css
@media (prefers-color-scheme: light) {
  :root { --color-bg: #faf8f5; --color-text: #1a1714; --color-surface: #ffffff; }
}
```

- Reuse an existing token set when the workspace already defines one; do not create a parallel scale.

## Anti-Patterns

- `padding: 13px 27px` — arbitrary values outside the scale.
- Ten near-identical greys with no semantic names.
- A new radius/shadow value per component.
- Repeating a colour literal (`#e06a2b`) in 30 rules instead of `var(--color-accent)`.
- Animating `all` with no duration token: use `transition: transform var(--dur-base) var(--ease-out)`.
