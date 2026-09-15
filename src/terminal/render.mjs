/** Terminal renderer: streams run events as human-readable progress. */
const C = { reset: '\x1b[0m', dim: '\x1b[2m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', bold: '\x1b[1m' };
export function createRenderer({ bus, color = true, verbose = false } = {}) {
  const paint = (code, text) => (color ? `${code}${text}${C.reset}` : String(text));
  const off = bus.on((event) => {
    switch (event.type) {
      case 'run.start': console.log(paint(C.bold, `\n◆ artisan: ${event.request}`)); break;
      case 'phase': console.log(paint(C.cyan, `  ▸ ${event.phase}`)); break;
      case 'thought': if (verbose) console.log(paint(C.dim, `    ${String(event.text ?? '').slice(0, 220)}`)); break;
      case 'decision': console.log(paint(C.dim, `    decision: ${event.kind} → ${event.choice}`)); break;
      case 'skills.retrieved': console.log(paint(C.dim, `    skills: ${(event.ids ?? []).join(', ')}`)); break;
      case 'plan.created': console.log(paint(C.dim, `    plan: ${event.steps} steps`)); break;
      case 'file.write': console.log(paint(C.green, `    + ${event.rel} (${event.mode}, ${(event.bytes ?? 0)} B)`)); break;
      case 'verify.result': console.log(event.ok ? paint(C.green, `    verify: PASS (${event.summary})`) : paint(C.yellow, `    verify: CHECK (${event.summary})`)); break;
      case 'critique.result': console.log(paint(C.dim, `    critique: ${event.overall}/100`)); break;
      case 'improve.iteration': console.log(paint(C.cyan, `    fix #${event.iteration}: ${(event.applied ?? []).join(', ')}`)); break;
      case 'warn': console.log(paint(C.yellow, `    ! ${event.message}`)); break;
      case 'error': console.log(paint(C.red, `    ✖ ${event.message}`)); break;
      case 'run.end': console.log(paint(event.status === 'done' ? C.green : C.yellow, `  ■ ${event.status} (score ${event.score ?? 'n/a'})\n`)); break;
      default: break;
    }
  });
  return { detach: off };
}
