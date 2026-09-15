---
name: floating-elements
category: animation
priority: medium
frameworks: [react]
libraries: [motion, gsap]
triggers: [floating, floating cards, floating code, floating badges, orbital, depth layers, parallax objects, ambient motion, floating ui]
description: Floating with depth cues, varied speeds, spring, mouse/scroll influence — avoid identical sine waves.
---

# Floating Elements

Float to convey depth, not to decorate.

## Patterns

- **Cards/snippets** around product preview at different depths `z: -20, 0, 20`
- **Orbital**: elements circle center with `rotate` 20s + counter-rotate content
- **Depth layers**: near moves fast (parallax 1.2), far slow (0.6)

## Motion

- Vary: `duration 4.2, 6.8, 5.1` not all 3s; `amplitude 8, 14, 6px`; `delay` stagger
- Use noise, not sine: `x: Math.sin(t*0.7)*8 + Math.cos(t*1.3)*4` or `gsap` `yoyo` + `repeatRefresh`
- Spring for mouse influence: `useSpring` + `useMotionValue`
```jsx
const mx = useMotionValue(0); const sx = useSpring(mx, {stiffness:80, damping:20})
useEffect(()=>{ const h=e=> mx.set((e.clientX - w/2)/w * 12); window.addEventListener("mousemove",h); return()=>remove() },[])
<motion.div style={{x: sx, y: sy}} />
```
- Scroll influence: `useTransform(scrollY, [0,400], [0,-16])` per layer

## Avoid

- Identical sine every element → robotic
- Too many (3-5 max), too large amplitude (>20px)
- No depth cue (all same speed)

## Fallback

- `prefers-reduced-motion` → static + slight shadow
- Touch: no mouse follow, keep subtle float
