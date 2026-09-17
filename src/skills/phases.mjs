/** Phase → skill map. Phase-gated retrieval: load ONLY what the phase needs.
 * Single source of truth (retriever.mjs re-exports this). */
export const PHASE_SKILLS = {
  structure: ['art-direction', 'hero-composition', 'landing-narrative', 'type-pairing', 'color-systems', 'micro-typography', 'materiality', 'copywriting', 'frontend-master', 'project-architecture', 'layout', 'typography', 'design-tokens', 'visual-design', 'component-composition', 'ui-ux', 'css', 'tailwind', 'nextjs', 'react', 'anti-slop'],
  creative: ['svg-craft', 'materiality', 'threejs', 'react-three-fiber', 'drei', 'webgl', 'shaders', 'distortion', 'particles', '3d-performance', 'backgrounds', 'background-systems', 'image-media', 'library-selection'],
  motion: ['scroll-choreography', 'motion', 'animation-principles', 'gsap', 'vanilla-motion', 'scroll-storytelling', 'parallax', 'page-transitions', 'micro-interactions', 'cursor-interactions', 'text-effects', 'floating-elements', 'aceternity', 'react-bits'],
  polish: ['performance-budget', 'micro-typography', 'design-review', 'responsive-design', 'accessibility', 'frontend-performance', 'forms-and-states', 'design-review', 'anti-slop', 'visual-design'],
};
export function skillsForPhases(phases = []) {
  const out = [];
  for (const p of phases) for (const s of PHASE_SKILLS[p] ?? []) if (!out.includes(s)) out.push(s);
  return out;
}
