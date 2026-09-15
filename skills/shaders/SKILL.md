---
name: shaders
category: 3d
priority: high
frameworks: [react]
libraries: [three, glsl]
triggers: [shader, glsl, fragment shader, vertex shader, noise, distortion, waves, dithering, chromatic aberration, liquid, displacement, post-processing]
description: GLSL shaders — advanced tool, use only when materially improves, not by default.
---

# Shaders

Fragment/vertex GLSL — powerful but heavy.

## Basics

- **Vertex**: deforms geometry `position`
- **Fragment**: colors pixels `gl_FragColor`

Example subtle wave plane:
```glsl
// vertex
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
// fragment
uniform float uTime;
varying vec2 vUv;
void main() {
  float wave = sin(vUv.x * 10.0 + uTime) * 0.02;
  vec3 color = vec3(0.05, 0.05, 0.06) + wave;
  gl_FragColor = vec4(color, 1.0);
}
```
Use via `shaderMaterial` in R3F.

## Common Effects

- **Noise**: `snoise` via glsl-noise
- **Waves**: `sin(uv.x*10 + time)`
- **Chromatic**: offset `r/g/b` channels 0.002
- **Dithering**: Bayer matrix for retro

## Guidance

- **Don't**: shader everywhere for "cool" — cost high, readability low.
- **Do**: one shader background behind hero, or product displacement on hover, with static fallback.
- **Performance**: `precision mediump float`, limit uniforms, throttle `uTime` to 60fps, pause when offscreen.

## Checklist

- Is shader story-driven (liquid product = brand)?
- Is there static image fallback for mobile/low-power?
- Is it `mediump` and not 4K texture?
