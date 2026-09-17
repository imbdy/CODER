---
name: threejs
category: 3d
priority: high
frameworks: [vanilla, react]
libraries: [three]
triggers: [three.js, threejs, three js, scene, camera, mesh, geometry, material, lights, shadows, textures, 3d scene, webgl, "3d", depth, immersive, spatial, "3d depth"]
description: A correct Three.js scaffold — colour management, tone mapping, resize, disposal, procedural environment — and the material recipes that look expensive without loading a single asset.
---

# Three.js

Official: https://threejs.org · For a scroll-driven page read **webgl-scroll-journey** first; this
skill is the scene underneath it.

## The scaffold that is actually correct

Most Three.js pages look cheap because of four missing lines, not because of the geometry.

```js
import * as THREE from 'three';

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;      // without this everything is washed out
renderer.toneMapping = THREE.ACESFilmicToneMapping;    // filmic highlights instead of clipped white
renderer.toneMappingExposure = 1.15;                   // animate this per chapter

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x06070a, 0.022);        // depth cue; match your substrate colour
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 200);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
}, { passive: true });
```

**A narrow fov (30–36) reads as cinematic. 50+ reads as a video game.**

## Light without loading an HDRI

A reflective material needs something to reflect. Generate the environment instead of shipping a
2 MB `.hdr`:

```js
// a few emissive planes in a tiny scene, baked into a cubemap once
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const glow = (color, intensity, pos, scale) => {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
  );
  m.material.color.multiplyScalar(intensity);
  m.position.set(...pos); m.scale.setScalar(scale); m.lookAt(0, 0, 0);
  envScene.add(m);
};
glow(0xa7c4ff, 3.0, [ 4,  3,  2], 6);   // key, cool
glow(0xffe9cf, 1.4, [-5,  1, -3], 5);   // fill, warm — never the same hue as the key
glow(0xffffff, 0.6, [ 0, -4,  0], 8);   // bounce from below
scene.environment = pmrem.fromScene(envScene, 0.04).texture;
pmrem.dispose();
```

Two lights of *different temperature* is the whole trick: a cool key and a warm fill separate the
form. One white light from the front is why a render looks flat.

## Materials that look expensive

```js
// liquid metal / polished instrument
new THREE.MeshStandardMaterial({ color: 0x0d1016, metalness: 1.0, roughness: 0.18, envMapIntensity: 1.4 });

// smoked glass — transmission is the expensive one; first to drop under load
new THREE.MeshPhysicalMaterial({
  transmission: 1, thickness: 1.2, roughness: 0.08, ior: 1.45,
  metalness: 0, transparent: true, attenuationColor: new THREE.Color(0x8fb3ff), attenuationDistance: 2.5,
});

// graphite, for mass that should not sparkle
new THREE.MeshStandardMaterial({ color: 0x14171d, metalness: 0.2, roughness: 0.75 });

// additive field — particles, filaments, halos. Never lit, never depth-written.
new THREE.PointsMaterial({ size: 0.012, color: 0xa7c4ff, transparent: true, opacity: 0.7,
  blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
```

`depthWrite: false` on every additive layer, or they punch holes in each other.

## Geometry: instance, don't loop

A thousand `Mesh`es is a thousand draw calls. One `InstancedMesh` is one.

```js
const field = new THREE.InstancedMesh(geo, mat, 800);
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
for (let i = 0; i < 800; i++) {
  m.compose(randomPointInShell(2, 9), q.setFromEuler(randomEuler()), s);
  field.setMatrixAt(i, m);
}
field.instanceMatrix.needsUpdate = true;
```

For pure points use `BufferGeometry` + `Float32Array` positions and a `Points` object — cheapest
possible density.

## Disposal

Every `geometry`, `material` and `texture` is a GPU allocation the GC will not free.

```js
function dispose(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [o.material].flat().filter(Boolean)) {
      for (const k in m) if (m[k]?.isTexture) m[k].dispose();
      m.dispose();
    }
  });
  renderer.dispose();
}
```

## Loading three on a static page

No bundler exists on a plain HTML page — use an import map:

```html
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" } }
</script>
<script type="module" src="scripts/main.js"></script>
```

In React, use **react-three-fiber** instead of raw Three — see that skill.

## Checklist

- `outputColorSpace`, `toneMapping`, `setPixelRatio(min(dpr, 2))` all set?
- Two lights of different temperature, or a generated environment map?
- fov ≤ 36 for a cinematic read?
- Instanced or `Points` for anything above ~50 repeats?
- Additive layers have `depthWrite: false`?
- rAF cancelled when the tab is hidden, everything disposed on teardown?
- Is the subject worth a canvas at all, or would CSS do it better?
