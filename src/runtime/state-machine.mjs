/**
 * Agent State Machine — explicit, enforceable workflow.
 *
 * Intended flow for substantial tasks:
 *   UNDERSTANDING → INSPECTION → SKILL_SELECTION → PLANNING → DESIGN_SPEC
 *   → IMPLEMENTATION → VISUAL_QA → ITERATION → TESTING → COMPLETED
 *
 * Simple tasks may short-circuit: UNDERSTANDING → INSPECTION → IMPLEMENTATION → TESTING → COMPLETED
 * Complexity detection decides which path to enforce.
 *
 * The machine is the runtime's body; the model is the reasoning engine.
 * Transitions are validated — skipping is a hard error, not a suggestion.
 */

export const STATES = {
  UNDERSTANDING: 'UNDERSTANDING',
  INSPECTION: 'INSPECTION',
  SKILL_SELECTION: 'SKILL_SELECTION',
  PLANNING: 'PLANNING',
  DESIGN_SPEC: 'DESIGN_SPEC',
  IMPLEMENTATION: 'IMPLEMENTATION',
  VISUAL_QA: 'VISUAL_QA',
  ITERATION: 'ITERATION',
  TESTING: 'TESTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

// Full workflow for complex tasks (cinematic landing, 3D, multi-section)
export const FULL_WORKFLOW = [
  STATES.UNDERSTANDING,
  STATES.INSPECTION,
  STATES.SKILL_SELECTION,
  STATES.PLANNING,
  STATES.DESIGN_SPEC,
  STATES.IMPLEMENTATION,
  STATES.VISUAL_QA,
  STATES.ITERATION,
  STATES.TESTING,
  STATES.COMPLETED,
];

// Short workflow for trivial tasks ("change button text")
export const SHORT_WORKFLOW = [
  STATES.UNDERSTANDING,
  STATES.INSPECTION,
  STATES.IMPLEMENTATION,
  STATES.TESTING,
  STATES.COMPLETED,
];

// Which states are mandatory before IMPLEMENTATION?
const REQUIRES_PLANNING = new Set([STATES.PLANNING, STATES.DESIGN_SPEC]);
const REQUIRES_SKILLS = new Set([STATES.SKILL_SELECTION]);

export function detectComplexity(request, understanding, inspection) {
  const text = String(request ?? '').toLowerCase();
  const taskType = understanding?.taskType ?? '';
  // Simple task signals
  const trivialPatterns = [
    /change (button )?text/i,
    /fix typo/i,
    /update (the )?color/i,
    /^\s*make (it|the) (red|blue|smaller|bigger)\s*$/i,
    /change.*to\s+red/i,
  ];
  if (trivialPatterns.some(re => re.test(text)) && text.length < 80) return 'trivial';

  // Complex signals — require full workflow
  const complexSignals = [
    /landing|cinematic|premium|futuristic|immersive|3d|three\.?js|webgl|parallax|gsap|scroll/i,
    /multiple sections|hero.*features.*footer/i,
    /build.*(landing|page|site|app)/i,
  ];
  if (complexSignals.some(re => re.test(text))) return 'complex';
  if (['create-page', 'create-app', 'redesign', '3d', 'motion'].includes(taskType)) return 'complex';
  if ((inspection?.fileCount ?? 0) === 0 && text.length > 60) return 'complex';
  return 'standard';
}

export class AgentStateMachine {
  constructor({ request, understanding, inspection } = {}) {
    this.request = request;
    this.understanding = understanding;
    this.inspection = inspection;
    this.complexity = detectComplexity(request, understanding, inspection);
    // Keep full workflow for reliable state tracking; complexity only determines which gates are enforced.
    // Short workflow is kept for reporting but transitions always allow full path to avoid 'unknown state' failures.
    this.workflow = FULL_WORKFLOW;
    this.reportedWorkflow = this.complexity === 'trivial' ? SHORT_WORKFLOW : FULL_WORKFLOW;
    this.currentIndex = 0;
    this.current = this.workflow[0];
    this.history = [{ state: this.current, at: new Date().toISOString(), reason: 'init' }];
    this.data = {}; // per-state artifacts: spec, todos, verification, critique, etc.
    this.skipped = [];
    this.forced = false;
  }

  getState() { return this.current; }
  getWorkflow() { return [...this.workflow]; }
  getComplexity() { return this.complexity; }

  canTransition(to) {
    const idx = this.workflow.indexOf(to);
    if (idx === -1) return { ok: false, reason: `unknown state ${to}` };
    if (idx === this.currentIndex) return { ok: true, reason: 'same state' };
    if (idx === this.currentIndex + 1) return { ok: true, reason: 'next in workflow' };
    // Allow jumping forward only if skipping is permitted for trivial?
    if (idx > this.currentIndex + 1) {
      // For full workflow, cannot skip PLANNING/SPEC etc before IMPLEMENTATION
      const skippedStates = this.workflow.slice(this.currentIndex + 1, idx);
      const mandatory = skippedStates.filter(s => [STATES.PLANNING, STATES.DESIGN_SPEC, STATES.SKILL_SELECTION].includes(s));
      if (this.complexity === 'complex' && mandatory.length) {
        return { ok: false, reason: `cannot skip mandatory states: ${mandatory.join(', ')}` };
      }
      return { ok: true, reason: `skip allowed for ${this.complexity}` };
    }
    // Backward transitions allowed only to ITERATION/IMPLEMENTATION cycle
    if (idx < this.currentIndex) {
      if ([STATES.ITERATION, STATES.IMPLEMENTATION, STATES.VISUAL_QA].includes(to)) return { ok: true, reason: 'iteration backtrack' };
      return { ok: false, reason: 'backward transition not allowed except for iteration' };
    }
    return { ok: false, reason: 'invalid transition' };
  }

  transition(to, { reason = 'advance', data = {} } = {}) {
    const check = this.canTransition(to);
    if (!check.ok) {
      throw new Error(`State transition denied: ${this.current} -> ${to}: ${check.reason}`);
    }
    const from = this.current;
    this.currentIndex = this.workflow.indexOf(to);
    this.current = to;
    this.history.push({ from, to, at: new Date().toISOString(), reason });
    if (data && typeof data === 'object') this.data[to] = { ... (this.data[to] ?? {}), ...data };
    return { from, to, reason };
  }

  // Force without validation — only for error/failed states
  force(to, reason = 'forced') {
    const from = this.current;
    this.current = to;
    this.history.push({ from, to, at: new Date().toISOString(), reason });
    this.forced = true;
    return { from, to, reason };
  }

  // Record artifact without transitioning
  record(state, payload) {
    this.data[state] = { ... (this.data[state] ?? {}), ...payload };
  }

  // Check if mandatory phases have been completed before allowing COMPLETED
  canComplete({ hasVisualQa = false, hasTesting = false, verificationOk = false } = {}) {
    if (this.current !== STATES.TESTING && this.current !== STATES.VISUAL_QA && this.current !== STATES.ITERATION) {
      return { ok: false, reason: `cannot complete from ${this.current}, must be in TESTING/VISUAL_QA/ITERATION` };
    }
    if (this.complexity === 'complex') {
      if (!hasVisualQa) return { ok: false, reason: 'VISUAL_QA required for complex tasks before COMPLETED' };
      if (!hasTesting) return { ok: false, reason: 'TESTING required before COMPLETED' };
      if (!verificationOk) return { ok: false, reason: 'verification not passing, needs iteration' };
    }
    const actualVisited = new Set([this.workflow[0], ...this.history.map(h => h.to).filter(Boolean), this.current]);
    if (this.complexity !== 'trivial') {
      for (const need of [STATES.SKILL_SELECTION, STATES.PLANNING, STATES.DESIGN_SPEC]) {
        if (this.workflow.includes(need) && !actualVisited.has(need)) {
          return { ok: false, reason: `mandatory phase ${need} not visited` };
        }
      }
    }
    return { ok: true, reason: 'all mandatory phases completed' };
  }

  snapshot() {
    return {
      current: this.current,
      complexity: this.complexity,
      workflow: [...this.workflow],
      history: [...this.history],
      dataKeys: Object.keys(this.data),
    };
  }
}
