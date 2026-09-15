---
name: motion
category: animation
priority: high
frameworks: [react]
libraries: [motion]
triggers: [motion, framer motion, enter exit, variants, stagger, hover, tap, drag, whileInView, useScroll, layout animation, shared layout, AnimatePresence, spring]
description: Motion for React — variants, stagger, layout, gestures, scroll, for React-driven interactions.
---

# Motion for React

Official: https://motion.dev

Prefer Motion for: micro-interactions, component transitions, state transitions, layout transitions, React gestures, shared layout.

## Core APIs

- **Variants + stagger**:
```jsx
const parent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } }
}
const child = {
  hidden: { opacity:0, y:16, scale:0.98 },
  show: { opacity:1, y:0, scale:1, transition:{duration:0.32, ease:[0.16,1,0.3,1]} }
}
<motion.div variants={parent} initial="hidden" animate="show">
  {items.map(i=> <motion.div key={i} variants={child}/>)}
</motion.div>
```

- **Enter/exit**:
```jsx
<AnimatePresence mode="wait">
  {open && <motion.div initial={{opacity:0, y:8, scale:0.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0, y:8, scale:0.98}} transition={{duration:0.24}} />}
</AnimatePresence>
```

- **Hover/tap/drag**:
```jsx
<motion.button whileHover={{y:-2}} whileTap={{scale:0.97}} drag="x" dragConstraints={{left:0,right:0}} />
```

- **Viewport**:
```jsx
<motion.div initial={{opacity:0, y:24}} whileInView={{opacity:1,y:0}} viewport={{once:true, margin:"-80px"}} transition={{duration:0.5, ease:[0.16,1,0.3,1]}} />
```

- **Scroll**:
```jsx
const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] })
const y = useTransform(scrollYProgress, [0,1], [40, -40])
<motion.div style={{y}} />
```

- **Shared layout**:
```jsx
<motion.div layout layoutId="tab-indicator" /> // slides between tabs via layoutId
// also <motion.div layout> auto-animates layout changes (grid reorder)
```

- **Spring**: `transition={{ type:"spring", stiffness:340, damping:26 }}` for UI; `180/22` for playful

## Performance

- Animate `transform`/`opacity` only
- `layout` is powerful but expensive on many elements; limit to 1-2 shared elements
- Cleanup: Motion handles but ensure `AnimatePresence` exits before unmount

## When Not Motion

- Complex scrubbed timeline → GSAP
- WebGL → use R3F

## Anti-Pattern

- `delay: i*0.1` manual loop → use `staggerChildren`
- No `viewport once` → re-animates annoyingly on scroll
