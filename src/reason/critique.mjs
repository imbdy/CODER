/** Critique + repair + generic fallbacks for the deterministic brain. */
export function reasonCritique(payload = {}) {
  const sections = payload.sections ?? [];
  const dims = ['typography', 'spacing', 'hierarchy', 'interaction', 'responsive', 'accessibility'];
  const scores = Object.fromEntries(dims.map((d) => [d, sections.length ? 80 : 62]));
  const fixes = [];
  if (!sections.length) fixes.push({ area: 'composition', fix: 'Add a real page skeleton instead of an empty shell' });
  fixes.push({ area: 'typography', fix: 'Tighten display tracking and cap measure at 62ch' });
  fixes.push({ area: 'accessibility', fix: 'Verify focus-visible rings and contrast AA on every control' });
  const overall = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / dims.length);
  const blended = Number.isFinite(payload.verification?.score)
    ? Math.round((overall + payload.verification.score) / 2)
    : overall;
  return { overall: blended, scores, fixes, pass: blended >= 78 };
}
export function reasonRepair(payload = {}) {
  return { patches: [], note: 'No automatic repair available for: ' + String(payload.error ?? 'unknown error').slice(0, 120) };
}
export function reasonGeneric(payload = {}) {
  return { ok: true, echo: String(payload.prompt ?? payload.request ?? '').slice(0, 200) };
}
