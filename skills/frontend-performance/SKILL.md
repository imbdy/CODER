---
name: frontend-performance
category: engineering
priority: high
frameworks: [react]
libraries: []
triggers: [performance, transform, opacity, gpu, will-change, lazy loading, code splitting, dynamic imports, 3d throttling, texture, image optimization, webgl performance, cleanup]
description: Transform vs layout, GPU, lazy, split, 3D throttling, cleanup — keep 60fps without heavy systems.
---

# Frontend Performance

> Can this effect be achieved without a heavy rendering system? Prefer CSS.

## Compositing

- Animate only `transform` (`translate`, `scale`, `rotate`) and `opacity` — stays on GPU
- Avoid animating `width`, `height`, `top`, `left`, `margin` (layout thrash)
- `will-change: transform, opacity` sparingly, only when about to animate, remove after
- Use `contain: layout paint` for isolated cards

## Loading

- `loading="lazy"` + `decoding="async"` for images; `next/image` or explicit `width/height` + `aspect-ratio`
- Code split: `React.lazy(() => import('./Heavy3D'))` + `Suspense`; dynamic import for GSAP/R3F only when needed
- IntersectionObserver: trigger `whileInView` / lazy mount

## 3D/WebGL

- <100k triangles hero, <50 particles visible; `dpr={[1,1.8]}` not 3
- Throttle `useFrame` on hidden tab (`document.hidden` → pause)
- Dispose: `useEffect(() => () => { geometry.dispose(); material.dispose() }, [])`
- Texture max 1k for background, 2k product

## React

- `useMemo`/`useCallback` for heavy calcs, but not premature micro-memo
- Cleanup listeners: `return () => { observer.disconnect(); raf.cancel() }`
- Debounce scroll/resize 16ms

## Checklist

- Build passes, FPS 60 on scroll (check `will-change` not leaking)?
- Images optimized, lazy?
- Heavy libs dynamically imported?
- 3D pausing when offscreen?
