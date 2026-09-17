/**
 * Interactive session state + the single entry the terminal calls every turn.
 *
 * There is ONE agent. Internal phases (conversation → understanding →
 * inspection → skills → planning → spec → implementation → visual QA →
 * iteration → testing → completed) live inside converse()/runAgent(); the user
 * only ever talks to this one session.
 */

import { converse, ensureConversationState, statusReport } from './conversation.mjs';
import { makeId, nowIso } from '../core/util.mjs';
import { createAgreedContext, renderAgreedContext } from './agreed-context.mjs';

export function createInteractiveState({ workspaceDir, config } = {}) {
  return {
    id: makeId('chat'),
    workspaceDir: workspaceDir ?? process.cwd(),
    workspacePath: workspaceDir ?? process.cwd(),
    config,
    createdAt: nowIso(),
    phase: 'discuss',            // discuss | build (internal; the user never switches modes)
    currentTask: null,
    taskHistory: [],             // { request, mode, engine, taskType, status, files, score, at }
    todoItems: [],               // structured TODOs of the last build
    activeFiles: [],             // files written so far
    skillsUsed: [],              // skills actually loaded/read by builds
    unresolvedIssues: [],
    conversation: [],            // { role, text, turn }
    turnCount: 0,
    agreed: createAgreedContext(),
    lastBuildTurn: -1,
    lastRun: null,
    lastInspection: undefined,
    pendingWorkspacePath: undefined,
  };
}

export function todoText(state) {
  const todos = state.todoItems ?? [];
  if (!todos.length) return '(no active TODOs)';
  return todos.map((t) => {
    const box = t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[>]' : t.status === 'blocked' ? '[!]' : '[ ]';
    return `${box} ${t.id ? `${t.id} ` : ''}${t.title ?? t.description}`;
  }).join('\n');
}

export function statusText(state) {
  return statusReport(state);
}

export function contextText(state) {
  return renderAgreedContext(state.agreed) || '(nothing agreed yet)';
}

/** Every user turn enters here. */
export async function executeTurn(rawRequest, state, { bus, onProgress, onToken } = {}) {
  const input = String(rawRequest ?? '').trim();
  if (!input) return { kind: 'empty' };
  ensureConversationState(state);
  if (input.startsWith('/')) {
    const command = handleCommand(input, state);
    return { kind: command.exit ? 'exit' : 'answer', text: command.text, state };
  }
  return converse(input, state, { bus, onProgress, onToken });
}

/* ---------------------------------------------------------- slash commands ---- */

export function handleCommand(line, state) {
  const cmd = String(line ?? '').trim().toLowerCase();
  if (cmd === '/help' || cmd === '/h' || cmd === 'help') {
    return {
      text: [
        'Commands:',
        '  /help      — this help',
        '  /status    — session status: agreed context digest, last build, TODOs',
        '  /context   — the full agreed design context',
        '  /todo      — structured TODOs of the last build',
        '  /skills    — skills actually loaded by builds this session',
        '  /clear     — clear screen (keeps the session)',
        '  /exit      — quit',
        '',
        'Talk naturally. Discuss the idea, then say "build it". After a build, describe changes and say "do it".',
      ].join('\n'),
    };
  }
  if (cmd === '/status') return { text: statusText(state) };
  if (cmd === '/context' || cmd === '/agreed') return { text: contextText(state) };
  if (cmd === '/todo' || cmd === '/todos') return { text: `TODO:\n${todoText(state)}` };
  if (cmd === '/skills') {
    const s = [...new Set(state.skillsUsed ?? [])];
    return { text: s.length ? `Skills loaded this session: ${s.join(', ')}` : 'No skills loaded yet (they load during a build).' };
  }
  if (cmd === '/clear') return { text: '\x1b[2J\x1b[H', clear: true };
  if (cmd === '/exit' || cmd === '/quit' || cmd === '/q') return { exit: true };
  if (cmd === '/stop') return { text: 'No build running. Use Ctrl+C to interrupt a running build.', stop: true };
  return { text: `Unknown command: ${line}. Try /help` };
}
