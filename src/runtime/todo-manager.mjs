/**
 * Structured TODO state — not text inside model response.
 * Each task: id, description, status, priority, dependencies, skills, completionCondition
 * Agent works through tasks iteratively; runtime tracks progress and enforces order.
 */

export const TODO_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
  CANCELLED: 'cancelled',
};

export const PRIORITY = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

export class TodoManager {
  constructor() {
    this.todos = [];
    this.counter = 0;
    this.events = [];
  }

  /**
   * Create tasks from plan + spec.
   * Example:
   * [
   *   { id: "hero", description: "Build cinematic interactive hero", status: "pending", skills: ["landing-page", "motion-design"], priority: "high", dependencies: [], completionCondition: "hero section renders with depth + typography" }
   * ]
   * @param {Array} items - array of { id?, description/title, skills?, dependencies?, priority?, completionCondition? }
   */
  create(items = []) {
    this.todos = items.map((item, idx) => {
      const id = item.id ?? `todo-${++this.counter}`;
      if (this.counter < idx + 1) this.counter = idx + 1;
      return {
        id,
        description: item.description ?? item.title ?? item.goal ?? `Task ${idx + 1}`,
        status: item.status ?? TODO_STATUS.PENDING,
        priority: item.priority ?? PRIORITY.MEDIUM,
        dependencies: item.dependencies ?? [],
        skills: item.skills ?? [],
        completionCondition: item.completionCondition ?? item.goal ?? '',
        files: item.files ?? [],
        verification: item.verification ?? [],
        startedAt: undefined,
        completedAt: undefined,
      };
    });
    this.events.push({ type: 'created', count: this.todos.length, at: new Date().toISOString() });
    return this.todos;
  }

  /**
   * Create from design spec iterations (DESIGN → EXPERIENCE → MOTION → TECH → BUILD → QA)
   */
  createFromSpec(spec, plan) {
    const iterations = spec?.plan?.iterations ?? [];
    const steps = plan?.steps ?? [];
    const source = iterations.length ? iterations : steps;
    // Map iteration id to expected skill set for that phase
    const skillMap = {
      'i1-structure': ['frontend-master','project-architecture','layout','typography','design-tokens','visual-design','anti-slop'],
      'i2-motion': ['motion','animation-principles','gsap','micro-interactions','parallax','scroll-storytelling'],
      'i3-creative': ['threejs','react-three-fiber','webgl','shaders','3d-performance','backgrounds'],
      'i4-polish': ['responsive-design','accessibility','frontend-performance','design-review','anti-slop'],
    };
    const fallbackMap = {
      structure: ['layout','typography','design-tokens'],
      motion: ['motion','gsap'],
      creative: ['threejs','webgl'],
      polish: ['responsive-design','accessibility','anti-slop'],
    };
    const items = source.map((entry, i) => {
      const id = entry.id ?? `phase-${i + 1}`;
      let skills = entry.skills ?? [];
      if (!skills.length) {
        if (skillMap[id]) skills = skillMap[id];
        else if (id.includes('structure')) skills = fallbackMap.structure;
        else if (id.includes('motion')) skills = fallbackMap.motion;
        else if (id.includes('creative')) skills = fallbackMap.creative;
        else if (id.includes('polish')) skills = fallbackMap.polish;
        else skills = [];
        // Filter for cinematic: if spec has non-css depth, keep creative skills; otherwise trim
        if (id === 'i3-creative' && (spec?.tech?.depth ?? 'css') === 'css') skills = [];
      }
      const deps = i > 0 ? [source[i - 1].id ?? `phase-${i}`] : [];
      const completion = entry.goal ?? entry.verification?.join('; ') ?? (
        id === 'i1-structure' ? 'HTML semantic structure + typography + composition rendered' :
        id === 'i2-motion' ? 'Motion layers implemented with one easing family + reduced-motion guard' :
        id === 'i3-creative' ? `Creative layer (${spec?.tech?.depth ?? 'css'}) integrated with fallback for mobile/reduced-motion` :
        'Responsive 390/834/1440, anti-generic gate passed, visual QA score >=78'
      );
      return {
        id,
        description: entry.goal ?? entry.title ?? `Phase ${i + 1}`,
        priority: i === 0 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
        skills,
        files: entry.files ?? [],
        dependencies: deps,
        completionCondition: completion,
        verification: entry.verification ?? [],
        status: TODO_STATUS.PENDING,
      };
    });
    return this.create(items);
  }

  list() { return [...this.todos]; }

  get(id) { return this.todos.find(t => t.id === id); }

  update(id, patch = {}) {
    const todo = this.get(id);
    if (!todo) throw new Error(`todo not found: ${id}`);
    const prev = todo.status;
    if (patch.status !== undefined) {
      // Validate dependencies: cannot start if dependencies pending
      if (patch.status === TODO_STATUS.IN_PROGRESS || patch.status === TODO_STATUS.COMPLETED) {
        for (const dep of todo.dependencies ?? []) {
          const depTodo = this.get(dep);
          if (depTodo && depTodo.status !== TODO_STATUS.COMPLETED) {
            throw new Error(`cannot progress ${id}: dependency ${dep} is ${depTodo.status}`);
          }
        }
      }
      todo.status = patch.status;
      if (patch.status === TODO_STATUS.IN_PROGRESS) todo.startedAt = new Date().toISOString();
      if (patch.status === TODO_STATUS.COMPLETED) todo.completedAt = new Date().toISOString();
    }
    if (patch.description !== undefined) todo.description = patch.description;
    if (patch.completionCondition !== undefined) todo.completionCondition = patch.completionCondition;
    this.events.push({ type: 'update', id, from: prev, to: todo.status, at: new Date().toISOString() });
    return todo;
  }

  start(id) { return this.update(id, { status: TODO_STATUS.IN_PROGRESS }); }
  complete(id) { return this.update(id, { status: TODO_STATUS.COMPLETED }); }
  block(id, reason = '') { const t = this.update(id, { status: TODO_STATUS.BLOCKED }); t.blockReason = reason; return t; }

  nextPending() {
    return this.todos.find(t => t.status === TODO_STATUS.PENDING && (t.dependencies ?? []).every(dep => this.get(dep)?.status === TODO_STATUS.COMPLETED));
  }

  currentInProgress() {
    return this.todos.find(t => t.status === TODO_STATUS.IN_PROGRESS);
  }

  allCompleted() {
    return this.todos.length > 0 && this.todos.every(t => t.status === TODO_STATUS.COMPLETED);
  }

  blocked() { return this.todos.filter(t => t.status === TODO_STATUS.BLOCKED); }

  pending() { return this.todos.filter(t => t.status === TODO_STATUS.PENDING); }

  inProgress() { return this.todos.filter(t => t.status === TODO_STATUS.IN_PROGRESS); }

  completed() { return this.todos.filter(t => t.status === TODO_STATUS.COMPLETED); }

  stats() {
    return {
      total: this.todos.length,
      pending: this.pending().length,
      inProgress: this.inProgress().length,
      completed: this.completed().length,
      blocked: this.blocked().length,
    };
  }

  toBusEvents() {
    // Serialize for event bus persistence — includes all required fields for audit
    return this.todos.map(t => ({ id: t.id, description: t.description, status: t.status, priority: t.priority, dependencies: t.dependencies, skills: t.skills, completionCondition: t.completionCondition, files: t.files, verification: t.verification }));
  }

  static fromPlan(plan, understanding) {
    const m = new TodoManager();
    if (!plan?.steps?.length) {
      const t = understanding?.taskType ?? 'task';
      m.create([{ id: 't1', description: `Execute: ${t}`, priority: PRIORITY.HIGH, completionCondition: String(understanding?.subject ?? '') }]);
    } else {
      m.create(plan.steps.map((s, i) => ({
        id: s.id ?? `todo_${i + 1}`,
        description: s.title ?? s.goal ?? `Step ${i + 1}`,
        skills: s.skills ?? [],
        files: s.files ?? [],
        dependencies: i > 0 ? [plan.steps[i - 1].id ?? `todo_${i}`] : [],
        status: TODO_STATUS.PENDING,
        priority: i === 0 ? PRIORITY.HIGH : PRIORITY.MEDIUM,
        completionCondition: s.verification?.join('; ') ?? s.goal ?? '',
      })));
    }
    return m;
  }
}
