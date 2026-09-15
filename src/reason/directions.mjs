/** Direction reasoning — thin wrapper over the ranked library. */
import { rankDirections } from '../design/directions.mjs';
export function reasonDirections(payload = {}) {
  const ranked = rankDirections({ request: payload.request ?? '', taskType: payload.taskType ?? 'create-page', inspection: payload.inspection, limit: 3 });
  const top = ranked[0];
  return { id: top?.direction?.id ?? 'soft-product', why: (top?.reasons ?? []).join('; '), candidates: ranked.map((r) => r.direction.id) };
}
