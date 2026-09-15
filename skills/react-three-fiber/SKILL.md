---
name: react-three-fiber
category: 3d
priority: medium
frameworks: [react]
libraries: [react-three-fiber, "@react-three/fiber"]
triggers: [react three fiber, r3f, Canvas, useFrame, react-three-fiber, fiber, r3f canvas]
description: R3F — Canvas, useFrame, declarative Three in React, when to choose over raw Three.
---

# React Three Fiber

Docs: https://r3f.docs.pmnd.rs

## When

React project + need 3D scene → R3F (declarative), not raw `new THREE.Scene` imperative.

## Essentials

```jsx
import { Canvas, useFrame } from "@react-three/fiber"
import { Environment, OrbitControls } from "@react-three/drei"

function Scene() {
  const ref = useRef()
  useFrame((state, delta) => {
    ref.current.rotation.y += delta * 0.15
    // mouse parallax
    ref.current.position.x = state.pointer.x * 0.2
  })
  return <mesh ref={ref}><torusKnotGeometry args={[1,0.3,128,32]} /><meshStandardMaterial color="#FF7A1A" /></mesh>
}

<Canvas camera={{ position:[0,0,5], fov:45 }} dpr={[1,1.8]} gl={{ antialias:true, alpha:true }}>
  <Scene />
  <Environment preset="studio" />
  <directionalLight position={[4,4,2]} intensity={1.2} />
</Canvas>
```

## State

- `state.camera`, `state.pointer`, `state.clock` via `useFrame`
- `useThree()` for `viewport`, `size`, `gl`
- Refs for imperative, props for declarative

## Performance

- `frameloop="demand"` if static (render only on change)
- `<Suspense>` for GLTF lazy
- `dpr` capped, `shadows` only if needed

## Cleanup

- `useEffect(() => () => { /* dispose */ }, [])` but R3F auto-disposes on unmount; still dispose custom `ShaderMaterial`

## Checklist

- Is Canvas behind content via `position:absolute inset-0 -z-10` not covering UI?
- Is pointer interaction subtle?
- Mobile fallback `<Canvas>` hidden + static image?
