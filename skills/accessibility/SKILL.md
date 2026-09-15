---
name: accessibility
category: design
priority: high
frameworks: [react]
libraries: []
triggers: [accessibility, a11y, keyboard, focus, aria, semantic, screen reader, reduced motion, contrast, touch]
description: Keyboard, focus, semantics, reduced-motion, contrast, touch — complex motion must degrade gracefully.
---

# Accessibility

Serious product = accessible product.

## Essentials

- **Keyboard**: all interactive via Tab, Enter/Space, Escape closes modals/menus; visible focus ring `focus-visible:ring-2 ring-amber-500`
- **Semantics**: `button` for click, `a` for nav, `header/nav/main/section` not div soup; `h1` once per page
- **ARIA**: only when semantics insufficient; `aria-label`, `role="dialog"` + `aria-modal`, `aria-expanded`
- **Contrast**: WCAG AA (4.5:1 body, 3:1 large); test muted text on surface — #9AA0AE on #13151A passes
- **Reduced motion**: wrap parallax/large motion in `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transform: none !important } }` or JS `matchMedia` check — fallback to opacity

## Motion A11y

- Provide `prefers-reduced-motion` toggle: disable parallax, scrub, large transforms; keep fade
- No motion that triggers vestibular issues (rapid scale + translate together long duration)
- Pause infinite marquees on hover/focus

## Touch

- Tap target ≥44px, spacing 8px between
- Hover content also reachable via focus/tap (no hover-only tooltips)
- Drag has button alternative

## Checklist

- Tab through page — logical order?
- Focus visible everywhere?
- Screen reader: landmarks + headings useful?
- `prefers-reduced-motion` disables parallax?
- Contrast passes?
