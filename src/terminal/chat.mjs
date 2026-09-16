/** Interactive chat REPL — `artisan chat` / `artisan --chat` */
import readline from 'node:readline';
import path from 'node:path';
import { createInteractiveState, executeTurn, handleCommand, statusText, todoText } from '../runtime/interactive.mjs';
import { loadConfig } from '../core/config.mjs';
import { createSession } from '../runtime/facade.mjs';

// concise professional progress — matches spec output style
const C = { reset: '\x1b[0m', dim: '\x1b[2m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', magenta: '\x1b[35m', bold: '\x1b[1m' };
function paint(code, text, useColor) { return useColor ? `${code}${text}${C.reset}` : text; }

function progressPrinter({ color }) {
  return (ev) => {
    switch (ev.type) {
      case 'understand': console.log(paint(C.dim, `[understand] ${ev.text}`, color)); break;
      case 'inspect': console.log(paint(C.dim, `[inspect] ${ev.text}`, color)); break;
      case 'skill': console.log(paint(C.cyan, `[skill] ${ev.text}`, color)); break;
      case 'tool': console.log(paint(C.dim, `[tool] ${ev.text}`, color)); break;
      case 'brain': console.log(paint(C.magenta, `[brain] ${ev.text}`, color)); break;
      case 'todo': {
        const t = String(ev.text);
        if (t.startsWith('✓')) console.log(paint(C.green, `[todo] ${t}`, color));
        else if (t.startsWith('→')) console.log(paint(C.yellow, `[todo] ${t}`, color));
        else console.log(paint(C.dim, `[todo] ${t}`, color));
        break;
      }
      case 'edit': console.log(paint(C.green, `[edit] ${ev.text}`, color)); break;
      case 'verify': console.log(paint(ev.text?.includes('PASS') || ev.text?.includes('0 issue') ? C.green : C.yellow, `[verify] ${ev.text}`, color)); break;
      case 'done': console.log(paint(ev.text === 'done' ? C.green : C.yellow, `[done] ${ev.text}`, color)); break;
      default: break;
    }
  };
}

export async function runChat({ workspaceDir, config, flags = {} } = {}) {
  const color = flags['no-color'] ? false : true;
  const dir = path.resolve(String(workspaceDir ?? flags.workspace ?? process.cwd()));
  const cfg = config ?? loadConfig({ workspaceDir: dir, brain: flags.brain ?? 'auto', verbose: Boolean(flags.verbose) });
  if (flags.verbose) cfg.runtime = { ...cfg.runtime, verbose: true };

  // Ensure facade exists (creates router/registry side effects if needed)
  // We use interactive state directly, but createSession for doctor parity
  createSession({ workspaceDir: dir, config: cfg });

  const state = createInteractiveState({ workspaceDir: dir, config: cfg });
  const onProgress = progressPrinter({ color });

  console.log(paint(C.bold, '\n  artisan — interactive session', color));
  console.log(paint(C.dim, `  workspace: ${dir}  (type /help for commands, /exit to quit)\n`, color));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: paint(C.cyan, 'Agent> ', color),
    terminal: Boolean(process.stdin.isTTY),
    historySize: 200,
  });

  // Graceful Ctrl+C: first press interrupts current task, second exits
  let running = false;
  let sigintCount = 0;
  const onSigint = () => {
    if (!running) {
      sigintCount += 1;
      if (sigintCount === 1) {
        console.log(paint(C.yellow, '\n(press Ctrl+C again to exit, or type /exit)', color));
        rl.prompt();
        setTimeout(() => { sigintCount = 0; }, 2000);
        return;
      }
      console.log(paint(C.dim, '\nGoodbye.', color));
      rl.close();
      process.exit(0);
    } else {
      console.log(paint(C.yellow, '\n[interrupt] stopping current task...', color));
      // runTask is sync-async but not abortable mid-flight; we just note interruption
      // Next turn will preserve state
      running = false;
    }
  };
  process.on('SIGINT', onSigint);

  rl.prompt();

  for await (const line of rl) {
    const raw = String(line ?? '').trim();
    if (!raw) { rl.prompt(); continue; }

    // slash commands
    if (raw.startsWith('/')) {
      const res = handleCommand(raw, state);
      if (res.exit) {
        console.log(paint(C.dim, 'Goodbye.', color));
        break;
      }
      if (res.clear) process.stdout.write(res.text);
      else if (res.text) console.log(res.text);
      rl.prompt();
      continue;
    }

    // plain "exit"/"quit"
    if (/^(exit|quit|bye)\s*$/i.test(raw)) {
      console.log(paint(C.dim, 'Goodbye.', color));
      break;
    }

    running = true;
    try {
      const result = await executeTurn(raw, state, { onProgress, onToken: (text) => process.stdout.write(text) });

      if (result.kind === 'answer') {
        if (result.streamed) console.log();
        else console.log(result.text);
      } else if (result.kind === 'discuss') {
        console.log(result.text);
      } else if (result.kind === 'task') {
        // concise completion + TODO snapshot
        const todos = state.todoItems;
        if (todos.length) {
          console.log(paint(C.dim, `\nTODO:`, color));
          for (const t of todos) {
            const box = t.status === 'completed' ? '[x]' : t.status === 'blocked' ? '[!]' : '[ ]';
            const line = `${box} ${t.title}`;
            console.log(paint(t.status === 'completed' ? C.green : C.dim, line, color));
          }
        }
        const writes = result.run?.writes ?? [];
        if (writes.length) console.log(paint(C.dim, `files: ${writes.map((w) => w.rel).join(', ')}`, color));
        // keep output concise — no raw tool payloads, no giant model dump
      } else if (result.kind === 'stop') {
        console.log(paint(C.yellow, result.text, color));
      } else if (result.kind === 'exit') {
        console.log(paint(C.dim, 'Goodbye.', color));
        break;
      } else if (result.kind === 'error') {
        console.log(paint(C.red, `error: ${result.error}`, color));
      } else if (result.kind === 'empty') {
        // no-op
      } else if (result.text) {
        console.log(result.text);
      }
    } catch (e) {
      console.log(paint(C.red, `error: ${String(e?.message ?? e)}`, color));
    } finally {
      running = false;
      if (!rl.closed) rl.prompt();
    }
  }

  process.off('SIGINT', onSigint);
  rl.close();
  return 0;
}
