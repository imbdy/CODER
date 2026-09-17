/** Generator: rebuild conversation.mjs cleanly. */
import fs from 'node:fs';
const P = 'src/runtime/conversation.mjs';
const L = [];
const add = (s) => L.push(String(s));

add('/** ONE continuous agent session: DISCUSS -> DECIDE -> EXECUTE -> REPORT -> DISCUSS. */');
add('');
add("import { createRouter } from '../model/router.mjs';");
add("import { loadConfig } from '../core/config.mjs';");
add("import { runBuild } from './agent-build.mjs';");
add("import { parseToolCalls } from '../agent/agent.mjs';");
add("import { EventBus } from '../core/events.mjs';");
add("import { applyAgreedToRequest } from './agreed_context.mjs';");
add('');

// regex constants
add("const SHORT_TRIGGER_RE = /^(build it|go build it|go ahead|do it|make it|start|start working on it|finish it|finish the idea|implement this|implement it|go|proceed|yes build it|yea|yes|yeah|ok|okay)(\\s+(it|now|ahead|please))?\\s*[!.]*$/i;");
add("const DIRECT_BUILD_RE = /^(build|create|make|design|generate|scaffold|implement|start building|finish)\\b/i;");

add('export function userIntent(text) {');
add("  const t = String(text ?? '').trim();");
add("  if (SHORT_TRIGGER_RE.test(t)) return 'execute';");
add("  if (DIRECT_BUILD_RE.test(t)) return 'execute';");
add("  return 'discuss';");
add('}');

add('function lastSubstantive(state, current) {');
add("  const msgs = (state.conversation ?? []).map((m) => (m.role === 'user' ? String(m.text ?? '') : '')).filter(Boolean);");
add("  if (current && !SHORT_TRIGGER_RE.test(String(current).trim())) msgs.push(String(current));");
add('  for (let i = msgs.length - 1; i >= 0; i -= 1) {');
add('    if (!SHORT_TRIGGER_RE.test(msgs[i].trim())) return msgs[i];');
add('  }');
add("  return String(current ?? '');");
add('}');

add('function synthesizeRequest(request, state) {');
add('  const anchor = lastSubstantive(state, request);');
add('  const withAgreed = applyAgreedToRequest(anchor, state.agreed);');
// history hint with literal \n — build via String.fromCharCode to avoid template ambiguity
const NL = String.fromCharCode(92) + 'n';
add('  const historyHint = (state.taskHistory ?? []).length');
add("    ? `" + NL + `[session: ' + String(state.taskHistory?.length ?? 0) + " prior build(s); modify the EXISTING implementation, do not restart. Files: " + String((state.activeFiles ?? []).join(', ') || 'see workspace') + '}]`');
add("    : '';");
add('  return withAgreed + historyHint;');
add('}');

add('function discussionSystem(state) {');
add('  const agreed = state.agreed;');
add('  const agreedBlock = agreed ? [');
add("    agreed.product ? `product: " + '${' + "agreed.product" + '}' + "` : '',");
add("    (agreed.visualDirection ?? []).length ? `visual direction so far: " + '${' + "agreed.visualDirection.join(', ')" + '}' + "` : '',");
add("    (agreed.acceptedIdeas ?? []).length ? `accepted: " + '${' + "agreed.acceptedIdeas.slice(-5).join(' | ')" + '}' + "` : '',");
add("    (agreed.rejectedIdeas ?? []).length ? `REJECTED by user (never propose again): " + '${' + "agreed.rejectedIdeas.slice(-5).join(' | ')" + '}' + "` : '',");
add('  ].filter(Boolean).join(' + String.fromCharCode(92, 110) + ');');
add(S('  return [`You are Artisan, a creative frontend engineer talking with the user about what to build.`,');
add(S("    `Discuss the idea naturally: react to what they said, suggest a concrete visual direction, note trade-offs.`,"));
add(S("    `RULES: keep replies short (2-6 sentences). Ask at most ONE question, only when truly blocked. Never write code in chat. Never claim files changed.`,"));
add(S("    `When the user gives an execution command, the runtime handles it — you only discuss.`,"));
add(S('    agreedBlock ? `AGREED SO FAR:\\n${agreedBlock}` : '','));
add(S("    `Workspace: " + '${' + "state.workspaceDir" + '}' + "`,"));
add(S("    `Known files: " + '${' + "(state.activeFiles ?? []).join(', ') || 'none yet'" + '}' + "`,"));
add(S("    `Prior builds: " + '${' + "state.taskHistory ?? []).length" + '}' + "`].filter(Boolean).join('" + String.fromCharCode(92, 110, 92, 110) + "');"));
add('}');

let linesWritten = L.length;

fs.writeFileSync(P, L.join('\n'));
console.log('chunk1 written:', linesWritten, 'lines, file size:', fs.statSync(P).size);

