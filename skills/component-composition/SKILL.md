---
name: component-composition
category: engineering
priority: medium
frameworks: [react]
libraries: []
triggers: [component, composition, reuse, reusable, architecture, state ownership, rerenders, primitives]
description: Build from reusable primitives — search before invent, keep state ownership clear, avoid giant components.
---

# Component Composition

> Don't build every page from scratch.

1. Search existing project (`search_files` for component, `find_files` for patterns)
2. Search installed libs (shadcn, etc.)
3. Search `.agent/references` + pattern library
4. Reuse/adapt when appropriate
5. Only invent when necessary

## Rules

- Giant component >250 LOC → split (`Hero` → `HeroVisual` + `HeroCopy` + `HeroActions`)
- State ownership: lift only when shared sibling needs it; otherwise collocate
- Avoid unnecessary context/re-renders: memoize heavy prop objects, not everything
- Semantic HTML first, then style
