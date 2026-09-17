---
name: shaders
category: 3d
priority: medium
frameworks: [vanilla, react]
libraries: [three]
triggers: [shader, glsl, fragment shader, vertex shader, custom material, noise, fresnel, dissolve, distortion, iridescent, rim light, displacement, raymarch, gradient mesh]
description: Working GLSL for the effects that actually earn a shader — fresnel rim, curl-noise displacement, particle fields, scanlines and grain — with the Three.js wiring around them.
---

# Shaders

Write a shader when no combination of standard materials gets the look: a rim that survives any
lighting, a surface that breathes, a field of a hundred thousand points, a dissolve. Not for a
gradient — CSS does gradients.

## Wiring

```js
const uniforms = {
  uTime:     { value: 0 },
  uProgress: { value: 0 },        // your scroll p — drive the look with it
  uColorA:   { value: new THREE.Color(0x0d1016) },
  uColorB:   { value: new THREE.Color(0xa7c4ff) },
  uRes:      { value: new THREE.Vector2(innerWidth, innerHeight) },
};
const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true });
// in the loop: uniforms.uTime.value = t; uniforms.uProgress.value = p;
```

To keep Three's lighting and only change part of it, patch the standard material instead of
replacing it:

```js
mat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = uniforms.uTime;
  shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\n transformed.y += sin(position.x * 3.0 + uTime) * 0.05;',
  );
};
```

## Fresnel rim — the highest value per line

Edges catch light. This one uniform makes a dark object read as a solid form instead of a silhouette.

```glsl
// vertex
varying vec3 vNormal; varying vec3 vView;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vView   = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
```

```glsl
// fragment
uniform vec3 uColorA; uniform vec3 uColorB; uniform float uProgress;
varying vec3 vNormal; varying vec3 vView;
void main() {
  float f = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), 3.0);
  vec3 col = mix(uColorA, uColorB, f * (0.4 + 0.6 * uProgress));
  gl_FragColor = vec4(col, 0.35 + 0.65 * f);
}
```

## Noise

Cheap 3D simplex-ish gradient noise. Use for displacement, dissolve masks, flow fields.

```glsl
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)), dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                 mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
             mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                 mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}
float fbm(vec3 p) {   // layered noise — this is what stops it looking like TV static
  float a = 0.5, v = 0.0;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
```

**Membrane that breathes** — displace along the normal in the vertex shader:

```glsl
float n = fbm(position * 1.8 + vec3(0.0, 0.0, uTime * 0.15));
transformed += normal * n * 0.18 * uProgress;
```

## Particle field with real depth

One `Points` object, per-point size and fade computed on the GPU.

```glsl
// vertex
uniform float uTime; uniform float uProgress; attribute float aSeed;
varying float vFade;
void main() {
  vec3 p = position;
  p.y += sin(uTime * 0.3 + aSeed * 6.28) * 0.15;      // drift, not orbit
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  vFade = smoothstep(60.0, 6.0, dist) * uProgress;     // fade into the fog
  gl_PointSize = (12.0 * aSeed + 2.0) * (1.0 / max(0.001, dist)) * 30.0;
  gl_Position = projectionMatrix * mv;
}
```

```glsl
// fragment — round, soft, no texture needed
uniform vec3 uColorB; varying float vFade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColorB, smoothstep(0.5, 0.0, d) * vFade);
}
```

Material: `transparent: true, depthWrite: false, blending: THREE.AdditiveBlending`.

## Screen-space grain and scanlines

A fullscreen quad (or a post pass) at 2–4% opacity is the difference between "3D render" and "shot".

```glsl
float grain = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
col += (grain - 0.5) * 0.035;
float scan = sin(gl_FragCoord.y * 1.2) * 0.008;
col -= scan;
```

## Dissolve keyed to scroll

```glsl
float mask = fbm(vPos * 2.5);
if (mask > uProgress * 1.4 - 0.2) discard;
float edge = smoothstep(0.0, 0.08, abs(mask - (uProgress * 1.4 - 0.2)));
col = mix(uColorB * 3.0, col, edge);   // hot rim on the dissolving edge
```

## Rules

- Everything animated takes **uProgress**, not only uTime — the look must scrub.
- `precision mediump float;` on mobile; `highp` only where banding shows.
- `discard` is expensive on tiled GPUs — prefer alpha where you can.
- Never branch on a uniform inside a hot loop; compute both and `mix()`.
- Shaders fail silently to black: check `renderer.info`, and always have a non-shader fallback.

## Checklist

- Does this need a shader, or is it a gradient with extra steps?
- Is it driven by scroll progress as well as time?
- Additive layers `depthWrite: false`?
- Does it degrade to a standard material when quality drops?
- Tested at `devicePixelRatio` 1 and 2?
