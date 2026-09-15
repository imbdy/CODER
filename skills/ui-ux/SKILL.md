---
name: ui-ux
category: design
priority: high
frameworks: [react]
libraries: [shadcn/ui]
triggers: [ui, ux, product ui, dashboard, command palette, dialogs, sheets, tabs, forms, navigation, empty states, loading states]
description: Product UI as calm, dense, composable primitives — shadcn as foundation, not visual identity.
---

# UI/UX — Product Surfaces

## Principle

Product UI = composable primitives, not pages.

Reuse `shadcn/ui` accessible foundations (Dialog, Sheet, Tabs, Command) but customize visual language — don't ship default shadcn look if product needs distinction.

## States (every component)

For each interactive element define:

`idle` → `hover` → `focus` → `active` → `disabled` → `loading` → `success` → `error` → `empty`

- Button: hover lift 2px + shadow, press scale 0.97, disabled 40% opacity + not-allowed
- Input: idle border, focus ring 2px amber + border, error border red + message, success check
- Empty: illustration + headline + action (not just "No data")
- Loading: skeleton per content shape (not spinner everywhere)

## Composition

- Density: 13-14px type, 16px row height for tables; 20px card padding → feels premium dense like Linear
- Command palette: `cmdk` + shadcn Command — trigger vs search
- Navigation: floating pill on marketing, sidebar/inspector on product; don't mix

## Implementation

- Prefer shadcn primitives for a11y, then style via `className` tokens (keep `cva` variants)
- Keep state ownership clear: lift only when shared, not global

## Checklist

- All states exist and feel consistent?
- Empty/loading not forgotten?
- Keyboard + screen reader pass via shadcn base?
