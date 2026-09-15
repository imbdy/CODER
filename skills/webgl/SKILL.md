---
name: webgl
category: 3d
priority: low
frameworks: [react]
libraries: [three, react-three-fiber]
triggers: [webgl, gltf, glb, renderer, postprocessing, environment lighting, fog, depth, instancing, frame loop]
description: WebGL fundamentals via R3F — Canvas, refs, state, instancing, postprocessing when justified.
---

# WebGL

Advanced, cost high.

- **Renderer**: R3F Canvas handles; set `gl={{ powerPreference:"high-performance", antialias:true, stencil:false, depth:true }}`
- **GLTF**: `useGLTF` + `draco` if heavy; optimize in Blender `<50k verts`
- **Instancing**: `<Instances>` from Drei for repeated mesh (particles, cards) — 1 draw call vs N
- **Postprocessing**: `@react-three/postprocessing` `<EffectComposer><Bloom intensity={0.6} /><Vignette /></EffectComposer>` — enable only for hero cinematic, cost high
- **Fog**: `<fog attach="fog" args={["#0B0C0E", 6, 12]} />` for depth
- **Depth/parallax**: camera `position.z` linked to scroll `useScroll` + `useTransform`

**Cost decision**: Need post bloom? If product is futuristic AI, subtle bloom 0.3 okay; dashboard never.

**Cleanup**: dispose renderer on route change, pause `frameloop` when hidden.
