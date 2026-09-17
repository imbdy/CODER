/** Rebuild conversation.mjs cleanly avoiding shell escaping. */
import fs from 'node:fs';

const P = 'src/runtime/conversation.mjs';

const WS = String.raw`\s`;
const DQ = String.raw`"`;
const SQ = String.raw`'`;
const BS = String.raw`\`;

const lines = [];
function L(s) { lines.push(String(s)); }
function TT(text) { L('    ' + BS + text + BS); } // template
function DQT(text) { L('    "' + text + '"'); }

L('/** ONE continuous agent session: DISCUSS -> DECIDE -> EXECUTE -> REPORT -> DISCUSS. */');
L('import { createRouter } from '../model/router.mjs';');
L('import { loadConfig } from '../core/config.mjs';');
L('import { runBuild } from './agent-build.mjs';');
L("import { parseToolCalls } from '../agent/agent.mjs';");
L('import { EventBus } from '../core/events.mjs';');
L("import { applyAgreedToRequest } from './agreed_context.mjs';"); // NOTE: verify filename
L('');

// SHORT_TRIGGER_RE / DIRECT_BUILD_RE with raw strings
L("const SHORT_TRIGGER_RE = /^(build it|go build it|go ahead|do it|make it|start|start working on it|finish it|finish the idea|implement this|implement it|go|proceed|yes build it|yea|yes|yeah|ok|okay)(\\s+(it|now|ahead|please))?\\s*[!.]*$/i;");
L("const DIRECT_BUILD_RE = /^(build|create|make|design|generate|scaffold|implement|start building|finish)\\b/i;");
lines.push('');
lines.push('export function userIntent(text) {');
lines.push("  const t = String(text ?? '').trim();");
lines.push("  if (SHORT_TRIGGER_RE.test(t)) return 'execute';");
lines.push("  if (DIRECT_BUILD_RE.test(t)) return 'execute';");
lines.push("  return 'discuss';");
lines.push('}');
lines.push('');

// lastSubstantive
lines.push('function lastSubstantive(state, current) {');
lines.push("  const msgs = (state.conversation ?? []).map((m) => (m.role === 'user' ? String(m.text ?? '') : '')).filter(Boolean);");
lines.push("  if (current && !SHORT_TRIGGER_RE.test(String(current).trim())) msgs.push(String(current));");
lines.push('  for (let i = msgs.length - 1; i >= 0; i -= 1) {');
lines.push('    if (!SHORT_TRIGGER_RE.test(msgs[i].trim())) return msgs[i];');
lines.push('  }');
lines.push("  return String(current ?? '');");
lines.push('}');
lines.push('');

// synthesizeRequest
lines.push('function synthesizeRequest(request, state) {');
lines.push('  const anchor = lastSubstantive(state, request);');
lines.push('  const withAgreed = applyAgreedToRequest(anchor, state.agreed);');
lines.push('  const historyHint = (state.taskHistory ?? []).length');
lines.push('    ? `\\n[session: ' + '${state.taskHistory.length} prior build(s); modify the EXISTING implementation, do not restart. Files: ' + '${state.activeFiles.join(', ') || \'see workspace\'}]`');
lines.push('    : \'\';');
lines.push('  return `${withAgreed}${historyHint}`;');
lines.push('}');
lines.push('');

fs.writeFileSync(P, lines.join('\n'));
console.log('chunk1 ok lines:', lines.length, 'file bytes:', fs.statSync(P).size, 'first:', lines[0]);

