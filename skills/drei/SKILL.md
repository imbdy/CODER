---
name: drei
category: 3d
priority: low
frameworks: [react]
libraries: ["@react-three/drei"]
triggers: [drei, useGLTF, Environment, OrbitControls, Float, PerspectiveCamera, ContactShadows, sparkles, helpers]
description: Drei helpers — Environment, useGLTF, Float, OrbitControls, etc., to avoid reimplementing.
---

# Drei — R3F Helpers

Avoid reimplementing.

- **Environment**: `<Environment preset="studio" background={false} />` for studio lighting without HDRI file
- **useGLTF**: `const { scene } = useGLTF("/model.glb")` + `<primitive object={scene} />` + `useGLTF.preload`
- **Float**: `<Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.8}><mesh/></Float>` for ambient float
- **OrbitControls**: `enableZoom={false} enablePan={false} autoRotate` subtle; disable on mobile
- **ContactShadows**: `<ContactShadows opacity={0.4} blur={2} />` for grounded feel
- **PerspectiveCamera**: `<PerspectiveCamera makeDefault position={[0,0,6]} fov={45} />`
- **Sparkles / Stars**: `<Sparkles count={80} scale={6} size={0.4} />` low count

**Performance**: `Float` uses `useFrame` cheap; `Sparkles` keep <100.

**When not**: simple primitive → no Drei needed.

Docs: https://github.com/pmndrs/drei
