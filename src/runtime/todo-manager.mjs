/**
 * Structured TODO state — data, not text inside a model response.
 * Each task: id, description, status, priority, dependencies, skills, files,
 * completionCondition. The model proposes them (fromModel), the runtime
 * validates, adds the mandatory QA/responsive tasks (ensureRequired), enforces
 * dependency order and checks file conditions before a task may complete.
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
   * Create tasks from plain items.
   * @param {Array} items - array of { id?, description/title, skills?, dependencies?, priority?, completionCondition?, files? }
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
        note: item.note ?? '',
        startedAt: undefined,
        completedAt: undefined,
      };
    });
    this.events.push({ type: 'created', count: this.todos.length, at: new Date().toISOString() });
    return this.todos;
  }

  /**
   * Create from design spec iterations (deterministic engine path).
   */
  createFromSpec(spec, plan) {
    const iterations = spec?.plan?.iterations ?? [];
    const steps = plan?.steps ?? [];
    const source = iterations.length ? iterations : steps;
    const skillMap = {
      'i1-structure': ['frontend-master', 'project-architecture', 'layout', 'typography', 'design-tokens', 'visual-design', 'anti-slop'],
      'i2-motion': ['motion', 'animation-principles', 'gsap', 'micro-interactions', 'parallax', 'scroll-storytelling'],
      'i3-creative': ['threejs', 'react-three-fiber', 'webgl', 'shaders', '3d-performance', 'backgrounds'],
      'i4-polish': ['responsive-design', 'accessibility', 'frontend-performance', 'design-review', 'anti-slop'],
    };
    const fallbackMap = {
      structure: ['layout', 'typography', 'design-tokens'],
      motion: ['motion', 'gsap'],
      creative: ['threejs', 'webgl'],
      polish: ['responsive-design', 'accessibility', 'anti-slop'],
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
        if (id === 'i3-creative' && (spec?.tech?.depth ?? 'css') === 'css') skills = [];
      }
      const deps = i > 0 ? [source[i - 1].id ?? `phase-${i}`] : [];
      const completion = entry.goal ?? entry.verification?.join('; ') ?? (
        id === 'i1-structure' ? 'HTML semantic structure + typography + composition rendered' :
        id === 'i2-motion' ? 'Motion layers implemented with one easing family + reduced-motion guard' :
        id === 'i3-creative' ? `Creative layer (${spec?.tech?.depth ?? 'css'}) integrated with fallback for mobile/reduced-motion` :
        'Responsive 390/834/1440, anti-generic gate passed, visual QA verdict pass'
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

  /** Validate structured TODOs proposed by the model. Returns { manager, warnings }. */
  static fromModel(items = [], { maxItems = 12 } = {}) {
    const warnings = [];
    const list = Array.isArray(items) ? items : [];
    const used = new Set();
    const cleaned = [];
    list.slice(0, maxItems).forEach((raw, index) => {
      if (!raw || typeof raw !== 'object') { warnings.push(`todo ${index + 1} ignored (not an object)`); return; }
      const description = String(raw.description ?? raw.title ?? raw.goal ?? '').trim().slice(0, 200);
      if (!description) { warnings.push(`todo ${index + 1} ignored (no description)`); return; }
      let id = String(raw.id ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12) || `I${index + 1}`;
      while (used.has(id)) id = `${id}b`;
      used.add(id);
      const priority = ['high', 'medium', 'low'].includes(raw.priority) ? raw.priority : (index === 0 ? PRIORITY.HIGH : PRIORITY.MEDIUM);
      cleaned.push({
        id,
        description,
        priority,
        dependencies: Array.isArray(raw.dependencies) ? raw.dependencies.map(String).slice(0, 6) : [],
        skills: Array.isArray(raw.skills) ? raw.skills.map(String).slice(0, 6) : [],
        files: Array.isArray(raw.files) ? raw.files.map((f) => String(f).replace(/^\.?\//, '')).slice(0, 8) : [],
        completionCondition: String(raw.completionCondition ?? raw.done_when ?? raw.doneWhen ?? '').slice(0, 200),
        status: TODO_STATUS.PENDING,
      });
    });
    const ids = new Set(cleaned.map((t) => t.id));
    for (const todo of cleaned) {
      const bad = todo.dependencies.filter((d) => !ids.has(d) || d === todo.id);
      if (bad.length) {
        warnings.push(`todo ${todo.id}: dropped unknown dependencies ${bad.join(', ')}`);
        todo.dependencies = todo.dependencies.filter((d) => ids.has(d) && d !== todo.id);
      }
    }
    const manager = new TodoManager();
    manager.create(cleaned);
    return { manager, warnings };
  }

  /** Runtime-mandated tasks: visual QA (and responsive refinement on fresh builds) always exist for non-trivial work. */
  ensureRequired({ complexity = 'standard', mode = 'create' } = {}) {
    const added = [];
    const has = (re) => this.todos.some((t) => re.test(t.description) || re.test(t.id));
    const lastId = () => this.todos.at(-1)?.id;
    if (complexity !== 'trivial' && mode !== 'refine' && !has(/responsive|mobile|breakpoint|390/i)) {
      this.todos.push({
        id: 'R1', description: 'Responsive refinement — rethink the layout at 390 / 834 / 1440, no horizontal overflow, tap targets >= 44px',
        status: TODO_STATUS.PENDING, priority: PRIORITY.MEDIUM, dependencies: lastId() ? [lastId()] : [], skills: ['responsive-design'],
        completionCondition: 'renders at all three viewports without overflow; mobile hero readable', files: [], verification: [],
      });
      added.push('R1');
    }
    if (complexity !== 'trivial' && !has(/visual qa|visual-qa|render|screenshot|critique/i)) {
      this.todos.push({
        id: 'QA', description: 'Visual QA — render in the browser, critique hierarchy / composition / typography / spacing / depth / motion, fix the weaknesses',
        status: TODO_STATUS.PENDING, priority: PRIORITY.HIGH, dependencies: lastId() ? [lastId()] : [], skills: ['design-review', 'anti-slop'],
        completionCondition: 'visual QA verdict pass (or remaining issues explicitly reported)', files: [], verification: [],
      });
      added.push('QA');
    }
    if (added.length) this.events.push({ type: 'ensured', ids: added, at: new Date().toISOString() });
    return added;
  }

  /** Files a TODO claims that do not exist yet. */
  missingFiles(id, exists) {
    const todo = this.get(id);
    if (!todo) return [];
    return (todo.files ?? []).filter((file) => !exists(file));
  }

  /** Compact text for prompts and status output. */
  render() {
    if (!this.todos.length) return '(no TODOs)';
    return this.todos.map((t) => {
      const box = t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[>]' : t.status === 'blocked' ? '[!]' : '[ ]';
      const deps = (t.dependencies ?? []).length ? ` after ${t.dependencies.join(',')}` : '';
      const files = (t.files ?? []).length ? ` — files: ${t.files.join(', ')}` : '';
      const done = t.completionCondition ? ` — done when: ${t.completionCondition}` : '';
      return `${box} ${t.id} (${t.priority}${deps}) ${t.description}${files}${done}`;
    }).join('\n');
  }

  list() { return [...this.todos]; }

  get(id) { return this.todos.find((t) => t.id === id); }

  update(id, patch = {}) {
    const todo = this.get(id);
    if (!todo) throw new Error(`todo not found: ${id}`);
    const prev = todo.status;
    if (patch.status !== undefined) {
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
    if (patch.note !== undefined) todo.note = String(patch.note).slice(0, 200);
    this.events.push({ type: 'update', id, from: prev, to: todo.status, at: new Date().toISOString() });
    return todo;
  }

  start(id) { return this.update(id, { status: TODO_STATUS.IN_PROGRESS }); }
  complete(id) { return this.update(id, { status: TODO_STATUS.COMPLETED }); }
  block(id, reason = '') { const t = this.update(id, { status: TODO_STATUS.BLOCKED }); t.blockReason = reason; return t; }

  nextPending() {
    return this.todos.find((t) => t.status === TODO_STATUS.PENDING && (t.dependencies ?? []).every((dep) => this.get(dep)?.status === TODO_STATUS.COMPLETED));
  }

  currentInProgress() {
    return this.todos.find((t) => t.status === TODO_STATUS.IN_PROGRESS);
  }

  allCompleted() {
    return this.todos.length > 0 && this.todos.every((t) => t.status === TODO_STATUS.COMPLETED);
  }

  blocked() { return this.todos.filter((t) => t.status === TODO_STATUS.BLOCKED); }
  pending() { return this.todos.filter((t) => t.status === TODO_STATUS.PENDING); }
  inProgress() { return this.todos.filter((t) => t.status === TODO_STATUS.IN_PROGRESS); }
  completed() { return this.todos.filter((t) => t.status === TODO_STATUS.COMPLETED); }

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
    return this.todos.map((t) => ({ id: t.id, description: t.description, status: t.status, priority: t.priority, dependencies: t.dependencies, skills: t.skills, completionCondition: t.completionCondition, files: t.files, verification: t.verification, note: t.note, blockReason: t.blockReason }));
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
