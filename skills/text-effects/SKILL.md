---
name: text-effects
category: creative
priority: medium
frameworks: [react]
libraries: [motion]
triggers: [text animation, text reveals, split text, scrambling text, scroll reveals, typewriter, gradient text, shimmer, morphing text]
description: Text reveals, split, scramble, shimmer — for display only, not body.
---

# Text Effects

For display headlines, not paragraphs.

## Patterns

- **Split reveal**: per word stagger
```jsx
const sentence = { hidden:{}, show:{ transition:{ staggerChildren:0.06 } } }
const word = { hidden:{ y:"100%", opacity:0 }, show:{ y:"0%", opacity:1, transition:{duration:0.5, ease:[0.16,1,0.3,1]} } }
<motion.h1 variants={sentence} initial="hidden" animate="show" style={{overflow:"hidden"}}>
  {text.split(" ").map(w=> <motion.span variants={word} style={{display:"inline-block", overflow:"hidden"}}>{w} </motion.span>)}
</motion.h1>
```
Clip with `overflow-hidden` parent.

- **Scramble**: decode effect via `useEffect` interval replacing chars, duration 600ms, trigger on view not hover spam
- **Gradient shimmer**: `background-clip:text` + `animate: shimmer 2s linear infinite` but subtle, not rainbow
- **Mask reveal**: `clipPath inset(0 100% 0 0)` → `inset(0 0 0 0)` via GSAP for editorial wipe

## When

- Hero display: split stagger yes
- Section headings: maybe fade + 12px y, not split chars
- Body: never

## Fallback

- `prefers-reduced-motion` → no split, opacity only
- Ensure text remains selectable, not canvas

## Anti

- Scrambling every heading on scroll
- Gradient rainbow on body
