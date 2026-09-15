/** Planning — ordered step list from understanding + inspection. Deterministic. */
function step(id, title, goal, files = [], skills = [], verification = []) {
  return { id, title, goal, files, skills, verification };
}
function layoutFiles(inspection, styling) {
  if (!inspection || ['unknown', 'static-html'].includes(inspection.framework)) {
    return ['index.html', 'styles/main.css', 'scripts/main.js'];
  }
  if (styling === 'tailwind') return ['src/app/page.tsx', 'src/app/globals.css'];
  return ['src/App.tsx', 'src/index.css'];
}
export function planStepsFor({ understanding, inspection }) {
  const taskType = understanding?.taskType ?? 'create-page';
  const scope = understanding?.scope ?? 'page';
  const styling = inspection?.styling ?? 'plain-css';
  if (taskType === 'create-component' || scope === 'component') {
    return [
      step('s1-tokens', 'Fix component tokens', 'Accent, type, radius, motion from direction', ['styles/tokens.css'], ['anti-slop'], ['tokens render']),
      step('s2-build', 'Build the component', 'Semantic markup, full states', ['index.html'], ['micro-interactions', 'accessibility'], ['keyboard operable']),
      step('s3-verify', 'Verify', 'Static + visual checks', [], ['design-review'], ['no placeholders']),
    ];
  }
  if (taskType === 'responsive') {
    return [
      step('s1-audit', 'Audit breakpoints', 'Sections overflowing below 640px', [], ['responsive-design'], ['inventory done']),
      step('s2-fluid', 'Fluid layout', 'Clamp type, collapse grids, fix nav', layoutFiles(inspection), ['responsive-design'], ['no scroll at 390px']),
      step('s3-verify', 'Verify responsive', 'Check 390/834/1440', [], ['design-review'], ['3 screenshots']),
    ];
  }
  if (taskType === 'motion') {
    return [
      step('s1-system', 'Motion language', 'Durations, easings, reduced-motion guard', ['styles/motion.css'], ['motion'], ['one easing family']),
      step('s2-add', 'Add interactions', 'Reveal, hover lift, press settle', layoutFiles(inspection), ['micro-interactions'], ['reduced-motion ok']),
      step('s3-verify', 'Verify motion', 'No jank or CLS', [], ['design-review'], ['60fps']),
    ];
  }
  if (taskType === '3d') {
    return [
      step('s1-depth', 'Depth layer', 'One GPU-friendly effect', ['styles/depth.css'], ['threejs'], ['single effect']),
      step('s2-integrate', 'Integrate', 'Scrim text above effect', layoutFiles(inspection), ['visual-design'], ['AA contrast']),
    ];
  }
  if (taskType === 'redesign') {
    return [
      step('s1-preserve', 'Brand inventory', 'Accent, fonts, sections to keep', [], ['design-review'], ['inventory written']),
      step('s2-direction', 'New direction', 'Distinct but anchored', [], ['frontend-master'], ['direction chosen']),
      step('s3-rebuild', 'Rebuild', 'New composition, preserved tokens', layoutFiles(inspection), ['layout'], ['renders']),
      step('s4-verify', 'Verify', 'Brand kept, bar met', [], ['anti-slop'], ['score >= 78']),
    ];
  }
  if (taskType === 'enhance') {
    return [
      step('s1-critique', 'Critique', 'Score dimensions', [], ['design-review'], ['weakest found']),
      step('s2-refine', 'Refine', 'Type, space, interactions', layoutFiles(inspection), ['visual-design'], ['improved']),
      step('s3-verify', 'Verify', 'No regressions', [], ['anti-slop'], ['score up']),
    ];
  }
  const files = layoutFiles(inspection, styling);
  return [
    step('s1-direction', 'Art direction', 'Rank + pick direction', [], ['frontend-master'], ['direction recorded']),
    step('s2-tokens', 'Token system', 'Palette, type, space, motion', ['styles/tokens.css'], ['visual-design'], ['tokens compile']),
    step('s3-compose', 'Compose page', 'Sections + layouts + copy', [], ['layout'], ['purpose per section']),
    step('s4-build', 'Build sections', 'HTML + CSS + JS', files, ['frontend-master'], ['renders with real copy']),
    step('s5-verify', 'Verify + critique', 'Checks + responsive + a11y', [], ['design-review'], ['score >= 78']),
  ];
}
/** @param {{understanding?: object, inspection?: object, request?: string}} payload */
export function reasonPlan(payload = {}) {
  const understanding = payload.understanding ?? { taskType: 'create-page', intent: 'create', subject: String(payload.request ?? '').slice(0, 80), scope: 'page' };
  const steps = planStepsFor({ understanding, inspection: payload.inspection });
  return { goal: understanding.summary ?? understanding.subject ?? 'Build frontend', steps, stepCount: steps.length };
}
