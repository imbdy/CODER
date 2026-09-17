---
name: threejs
category: 3d
priority: high
frameworks: [react]
libraries: [three]
triggers: [three.js, threejs, three js, scene, camera, mesh, geometry, material, lights, shadows, textures, 3d scene, webgl, "3d", depth, immersive, spatial, "3d depth"]
description: Three.js fundamentals — scene/camera/mesh/material/lights, when to use vs CSS.
---

# Three.js

Official: https://threejs.org

## When to Use (cost question)

Ask: does 3D improve story?

Use when: product viz, hero depth, spatial storytelling, immersive transition → yes.
Avoid when CSS/Motion solves cleaner (e.g., card hover) → CSS.

## Core

- **Scene, Camera, Renderer**: `scene = new THREE.Scene()`, `camera = PerspectiveCamera(55, w/h, 0.1, 100)`, renderer `antialias, alpha, powerPreference:"high-performance"`
- **Mesh**: `Mesh(geometry, material)` — geometry low poly for hero (<20k verts)
- **Materials**: `MeshStandardMaterial` (PBR, needs lights), `MeshBasicMaterial` (unlit), `ShaderMaterial` advanced
- **Lights**: `DirectionalLight` + `AmbientLight` (0.5) + `HDRI` via `Environment`; shadows `castShadow` cost → enable only if needed
- **Textures**: 1k max for background, 2k product; `texture.flipY=false`, `encoding sRGB`
- **Animation**: `gsap` or `mixer = new AnimationMixer(gltf.scene)` per frame

## Performance

- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8))`
- Shadows `2048` max, `PCFSoft`
- Dispose on unmount: `geometry.dispose(); material.dispose(); texture.dispose()`

## React Context

In React projects prefer R3F wrapper; raw Three only when no React.

## Checklist

- Does 3D justify cost vs CSS depth?
- Triangle count <100k hero?
- Lights minimal?
- Mobile fallback static?
