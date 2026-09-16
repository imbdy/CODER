---
name: css
category: implementation
priority: high
frameworks: []
libraries: []
triggers: [css, stylesheet, plain css, custom properties, css variables, flexbox, grid, responsive, media query, clamp, fluid type, modern css, css modules]
description: Modern CSS — custom properties, flexbox/grid, responsive design, animation, accessibility.
---

# Modern CSS

When the project uses plain CSS, CSS Modules, or global stylesheets:

## CSS Custom Properties (Design Tokens)
```css
:root {
  --color-bg: #faf7f2;
  --color-text: #171512;
  --color-accent: #3b6df6;
  --font-sans: "Inter", system-ui, sans-serif;
  --font-display: "Fraunces", Georgia, serif;
  --radius-md: 16px;
  --space-4: 20px;
  --space-8: 40px;
  --text-base: 1rem;
  --text-3xl: clamp(1.875rem, 2rem + 0.5vw, 2.25rem);
}
```

Reference tokens: `color: var(--color-text);`, `padding: var(--space-4);`

## Layout — CSS Grid (2D)
```css
.grid {
  display: grid;
  gap: var(--space-6);
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-12);
  align-items: center;
  min-height: 80vh;
}
```

## Layout — Flexbox (1D)
```css
.flex-center {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}
```

## Responsive — Mobile First
```css
/* Base (mobile) */
.btn { padding: 12px 20px; }

/* Tablet */
@media (min-width: 768px) {
  .btn { padding: 16px 28px; }
}

/* Desktop */
@media (min-width: 1024px) {
  .btn { padding: 18px 32px; }
}
```

## Fluid Type & Spacing (no jumps)
```css
h1 {
  font-size: clamp(2rem, 5vw + 1rem, 3.5rem);
  line-height: 0.9;
  letter-spacing: -0.02em;
}
```

## Interactive States
```css
.btn {
  transition: transform 160ms ease, box-shadow 160ms ease;
}
.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.btn:active {
  transform: scale(0.97);
}
.btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
```

## Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Modern Selectors
- `:focus-visible` — keyboard focus only
- `:has()` — parent selector: `.card:has(.active) { ... }`
- `:is()` — shorthand compound: `:is(h1, h2, h3) { ... }`
- `@layer` — CSS cascade layers
- `@container` — container queries (component-level responsiveness)

## CSS Modules (scoped)
```css
/* Card.module.css */
.container { background: var(--color-surface); }
.title { font-size: var(--text-xl); }
```
```jsx
import styles from './Card.module.css'
<div className={styles.container}>
  <h3 className={styles.title}>Title</h3>
</div>
```

## Accessibility in CSS
```css
.visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0);
  white-space: nowrap; border: 0;
}
```