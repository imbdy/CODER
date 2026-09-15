---
name: micro-interactions
category: animation
priority: high
frameworks: [react]
libraries: [motion]
triggers: [micro-interaction, button hover, magnetic, cursor following, tooltip, input focus, loading, success, error, drag, sorting, expansion, collapse, modal, dropdown, tabs, carousel, cards, hover, tap, press]
description: Idle/hover/focus/active/disabled/loading/success/error for every interactive element.
---

# Micro-Interactions

Every interaction has a state story.

## State Map

For each component define:

`idle` → `hover` → `focus` → `active` → `disabled` → `loading` → `success` → `error` → `empty`

- **Button**:
  - idle: base + 1px border
  - hover: lift `translateY(-2px)` + shadow `0 8px 24px rgba(0,0,0,0.12)`, transition 160ms easeOut
  - active: `scale(0.97)` 80ms
  - focus: `ring-2 ring-amber-500 ring-offset-2`
  - disabled: 45% opacity, `cursor-not-allowed`
  - loading: spinner 16px + "Loading..." + `aria-busy`
- **Card**: hover `translateY(-4px)` + `shadow-lg` + subtle `scale(1.01)` via transform; not just shadow
- **Input**: idle border `#2A2F3A`, focus `border-amber-500 ring-2`, error `border-red-500`, success `border-green`
- **Tabs**: `layoutId` underline slides between active, not fade
- **Modal**: `AnimatePresence` fade + scale 0.96 → 1, backdrop blur 8px, `focus-trap`

## Magnetic & Cursor

- Magnetic button: cursor within 80px → button follows `spring(400,28)` with `x = (cursorX - centerX)*0.3`; reset on leave
- Only for primary CTA, not every button; fallback to normal hover on touch

## Loading/Success

- Skeleton matching content shape (`h-4 w-3/4 rounded`) not spinner for pages
- Success: checkmark draw 240ms + subtle scale pulse 1.0 → 1.04 → 1

## Implementation (Motion)

```jsx
<motion.button
  whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
  whileTap={{ scale: 0.97 }}
  transition={{ type: "spring", stiffness: 400, damping: 26 }}
>
```

Group variants:

```jsx
const list = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }
const item = { hidden: { opacity:0, y:12 }, show: { opacity:1, y:0, transition:{duration:0.28, ease:[0.16,1,0.3,1]} } }
```

## Checklist

- Are all states defined (not just hover)?
- Is hover meaningful (lift + shadow) not just color?
- Is focus visible and accessible?
- Does loading/success communicate clearly?
