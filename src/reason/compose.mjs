/** Compose reasoning — page plan without touching the model. */
import { composePage } from '../design/compose.mjs';
export function reasonCompose(payload = {}) {
  const page = composePage({ request: payload.request ?? '', taskType: payload.taskType ?? 'create-page', projectKind: payload.projectKind ?? 'landing-page', direction: payload.direction, subject: payload.subject ?? {}, wants: payload.wants ?? [] });
  return { kind: page.kind, sections: page.sections.map((s) => ({ type: s.type, layout: s.layout, id: s.id })), notes: page.notes };
}
