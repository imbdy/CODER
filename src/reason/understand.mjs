/**
 * Task understanding — classifies the raw request into a structured task.
 *
 * Deterministic heuristics so the agent works offline. When an LLM is
 * available the router may refine this, but this output is always valid.
 *
 * Precedence: explicit capability asks (responsive/3d/motion) beat enhancement
 * cues; enhancement cues (only when nothing is being built from scratch) beat
 * creation; auth and component nouns then decide page vs component scope.
 */

const COMPONENT_NOUNS = /\b(button|card|badge|modal|navbar|nav bar|footer|header|input|checkbox|toggle|tag|chip|tooltip|dropdown|hero|pricing table|pricing|testimonial|faq|form field|search bar|sidebar)\b/i;
const AUTH_NOUNS = /\b(login|log in|sign in|sign-?in|sign up|sign-?up|register|registration|auth|passkey)\b/i;
const ENHANCE_CUES = /\b(feel more|look more|more premium|more modern|more elegant|more polished|polish|refine|improve|nicer|better feel|better look|fancier)\b/i;
const CREATE_VERB = /\b(build|create|design|generate|scaffold)\b/i;

export function classifyTaskType(request = '') {
  const text = String(request);
  const t = text.toLowerCase();
  const creating = CREATE_VERB.test(t);

  // 0. Page creation with explicit build intent takes precedence over generic capability asks.
  // This ensures "Build a landing page with subtle motion and 3D" is treated as a page build,
  // not as a standalone motion/3d/responsive task, while "Add subtle motion" (no page, no build verb) stays as motion.
  if (creating && /\b(landing|marketing site|homepage|home page|website|web ?site|site|page|screen|login|log in|sign in|sign up|auth)\b/i.test(t)) {
    return 'create-page';
  }

  // 1. Explicit capability asks ("add subtle motion", "make it responsive").
  if (/\bresponsive|mobile[- ]friendly|works? on mobile|tablet\b/i.test(t)) return 'responsive';
  if (/\b3d\b|three\.?js|webgl|floating 3d|parallax depth|immersive depth/i.test(t)) return '3d';
  if (/\bmotion|animat|transition|parallax|micro-?interaction/i.test(t)) return 'motion';

  // 2. Enhancement: reworking something that already exists (never when building from scratch).
  if (ENHANCE_CUES.test(t) && !creating) return 'enhance';

  // 3. Explicit redesign / fix / review.
  if (/\bredesign|overhaul|reimagine|refresh the (look|design)\b/i.test(t)) return 'redesign';
  if (/\bfix|repair|broken|bug\b|not working|isn'?t working/i.test(t)) return 'fix';
  if (/\breview|audit|critique|check my\b/i.test(t)) return 'review';

  // 4. Auth flows are pages by definition.
  if (AUTH_NOUNS.test(t)) return 'create-page';

  // 5. Component nouns (checked before generic page words like "screen").
  if (COMPONENT_NOUNS.test(t) && !/\b(page|screen|site|landing)\b/i.test(t)) return 'create-component';

  // 6. Page-level artifacts.
  if (/\b(landing|marketing site|homepage|home page|website|web ?site|site|page|screen)\b/i.test(t) && creating) return 'create-page';

  // 7. App-scale artifacts.
  if (/\b(dashboard|admin panel|\bapp\b|saas|platform)\b/i.test(t) && creating) return 'create-app';

  // 8. Non-functional asks.
  if (/\bperformant|performance|lighthouse|faster loads?\b/i.test(t)) return 'performance';
  if (/\baccessib|a11y|keyboard nav|screen reader\b/i.test(t)) return 'accessibility';

  return creating ? 'create-component' : 'create-page';
}

const INTENT_PATTERNS = [
  { re: /redesign|rebuild.*design|while preserving/i, intent: 'redesign' },
  { re: /responsive|mobile|breakpoint/i, intent: 'responsive' },
  { re: /motion|animat|float|parallax/i, intent: 'motion' },
  { re: /\b3d\b|depth|immersive/i, intent: '3d' },
  { re: ENHANCE_CUES, intent: 'enhance' },
  { re: /\bfix|repair\b/i, intent: 'enhance' },
];

export function classifyIntent(request = '') {
  const text = String(request);
  for (const { re, intent } of INTENT_PATTERNS) {
    if (re.test(text)) return intent;
  }
  if (/preserve.*brand|keep.*brand|existing brand/i.test(text)) return 'redesign';
  return 'create';
}

export function extractSubject(request = '') {
  const text = String(request);
  const m = text.match(/(?:build|create|make|design|redesign)\s+(?:me\s+)?(?:an?\s+|the\s+|this\s+)?([^.,;!?]{2,60})/i);
  if (m) return m[1].trim().replace(/\s+/g, ' ');
  return text.slice(0, 80).trim();
}

export function extractConstraints(request = '') {
  const text = String(request).toLowerCase();
  const constraints = [];
  if (/preserv/.test(text)) constraints.push('preserve-brand');
  if (/responsive|mobile/.test(text)) constraints.push('responsive');
  if (/accessible|a11y/.test(text)) constraints.push('accessible');
  if (/no framework|vanilla|plain html|static/.test(text)) constraints.push('static-html');
  if (/dark/.test(text)) constraints.push('dark-theme');
  if (/\blight\b/.test(text)) constraints.push('light-theme');
  if (/premium|luxury|high-end/.test(text)) constraints.push('premium-feel');
  if (/subtle|minimal|quiet/.test(text)) constraints.push('restraint');
  if (/3d|depth|floating/.test(text)) constraints.push('depth');
  return constraints;
}

/**
 * @param {{request: string, inspection?: object}} payload
 */
export function reasonUnderstand(payload = {}) {
  const request = String(payload.request ?? '');
  const taskType = classifyTaskType(request);
  const intent = classifyIntent(request);
  const subject = extractSubject(request);
  const constraints = extractConstraints(request);
  const inspection = payload.inspection;
  const projectKind = inspection?.projectKind
    ?? (AUTH_NOUNS.test(request) ? 'auth-flow'
      : COMPONENT_NOUNS.test(request) ? 'component-demo'
        : 'landing-page');
  return {
    taskType,
    intent,
    subject,
    constraints,
    projectKind,
    scope: taskType === 'create-component' ? 'component' : 'page',
    summary: `${taskType}: ${subject}`,
    confidence: 0.82,
  };
}

export function reasonGeneric(payload = {}) {
  return { ok: true, echo: String(payload.prompt ?? payload.request ?? '').slice(0, 200) };
}

