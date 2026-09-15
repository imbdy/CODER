---
name: 3d-performance
category: 3d
priority: high
frameworks: [react]
libraries: [three, react-three-fiber]
triggers: [3d performance, webgl performance, throttling, instancing, texture size, disposal, frame loop,Particle limits]
description: 3D performance — throttling, instancing, texture, disposal, when to fall back.
---

# 3D Performance

Keep 60fps or don't use 3D.

- **Throttling**: `useFrame` early return if `document.hidden` or not intersecting; `frameloop="demand"` for mostly static
- **Instancing**: 100 particles → `InstancedMesh` 1 draw call
- **Texture**: max 1k bg, 2k product, `KTX2` compressed; `anisotropy 4` not 16
- **Geometry**: <100k hero, draco compress glb, decimate in Blender
- **Shadows**: `2048`, `PCFSoft`, only directional, not point shadows
- **Post**: bloom 0.3 not 1.5, disable on mobile
- **Dispose**: manual dispose for non-R3F textures/materials; `useEffect cleanup`
- **DPR**: `dpr={[1,1.8]}` not 3
- **Fallback**: touch/coarse → static image; `matchMedia("(max-width: 768px)")` hide Canvas

Ask: can CSS achieve 80% of effect at 5% cost? If yes, CSS.
