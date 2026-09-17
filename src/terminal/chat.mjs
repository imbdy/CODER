/** Interactive chat REPL — `artisan chat` / `artisan --chat` */
import readline from 'node:readline';
import path from 'node:path';
import { createInteractiveState, executeTurn, handleCommand, statusText, todoText } from '../runtime/interactive.mjs';
import { loadConfig } from '../core/config.mjs';
import { createSession } from '../runtime/facade.mjs';

// concise professional progress — hidden by default, thinking animation only
const C = { reset: '\x1b[0m', dim: '\x1b[2m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', magenta: '\x1b[35m', bold: '\x1b[1m' };
function paint(code, text, useColor) { return useColor ? `${code}${text}${C.reset}` : text; }

// thinking animation — replaces verbose [brain]/[inspect]/TODO logs
function createThinker({ color }) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let timer = null;
  let active = false;
  return {
    start() {
      if (active) return;
      active = true;
      if (!process.stdout.isTTY) {
        process.stdout.write(paint(C.dim, 'Thinking...\n', color));
        return;
      }
      timer = setInterval(() => {
        const frame = frames[i = (i + 1) % frames.length];
        process.stdout.write(`\r${paint(C.dim, `${frame} Thinking...`, color)}`);
      }, 80);
    },
    stop() {
      if (!active) return;
      active = false;
      if (timer) clearInterval(timer);
      timer = null;
      if (process.stdout.isTTY) process.stdout.write('\r\x1b[K');
    },
  };
}

// silent progress — we hide internal steps, only thinking animation is visible
function progressPrinter({ color, thinker }) {
  return (ev) => {
    // intentionally silent — user asked not to see internal logs
    // we only keep thinker alive; no console.log for understand/inspect/skill/tool/todo/edit/verify
    // errors still surface via final result, not live logs
    if (ev.type === 'error') {
      // don't spam, but keep for debug if verbose
    }
  };
}

function extractWorkspacePath(text) {
  const t = String(text ?? '');
  // match Windows absolute path like C:\Projects or C:/Projects or D:\foo\bar, also quoted
  const win = t.match(/([A-Za-z]:\\[^\s"'`]+)/);
  if (win) return win[1].replace(/[,.;]+$/, '');
  const win2 = t.match(/([A-Za-z]:\/[^\s"'`]+)/);
  if (win2) return win2[1].replace(/[,.;]+$/, '');
  // quoted path "C:\Projects"
  const quoted = t.match(/["']([A-Za-z]:\\[^"']+)["']/);
  if (quoted) return quoted[1];
  // in folder X / put work in this folder X
  const m = t.match(/(?:in folder|in this folder|to folder|path|workspace)\s+([A-Za-z]:\\[^\s]+)/i);
  if (m) return m[1].replace(/[,.;]+$/, '');
  return null;
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
  const thinker = createThinker({ color });
  const onProgress = progressPrinter({ color, thinker });

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
    // maybe user specified a new workspace path like C:\Projects — handle it before turn (and remember for next "go ahead")
    {
      const fs = await import('node:fs');
      let target = extractWorkspacePath(raw);
      if (target) {
        // remember for follow-up "yea go ahead" without path
        state.pendingWorkspacePath = target;
      } else if (state.pendingWorkspacePath) {
        // reuse last requested path if current message is a build trigger but has no path
        const isGo = /^(yea|yes|go ahead|start|build it|ok|okay|proceed)/i.test(raw.trim());
        if (isGo) target = state.pendingWorkspacePath;
      }
      if (target) {
        try {
          const resolved = path.resolve(target);
          fs.mkdirSync(resolved, { recursive: true });
          if (resolved !== state.workspaceDir) {
            state.workspaceDir = resolved;
            state.workspacePath = resolved;
            try { state.config = loadConfig({ workspaceDir: resolved, brain: flags.brain ?? 'auto' }); } catch {}
            if (raw.toLowerCase().includes(target.toLowerCase())) {
              console.log(paint(C.dim, `  → workspace switched to ${resolved}`, color));
            }
          }
          // if we used pending path, clear it after successful switch for next build
          if (target === state.pendingWorkspacePath && !raw.includes(target)) {
            // keep it — user may want next build also there, so don't clear yet
          }
        } catch (e) {
          console.log(paint(C.yellow, `  ! could not switch to ${target}: ${String(e?.message ?? e).slice(0,120)}`, color));
        }
      }
    }
    thinker.start();
    let streamed = false;
    const onToken = (text) => {
      if (!streamed) { thinker.stop(); streamed = true; }
      process.stdout.write(text);
    };
    try {
      const result = await executeTurn(raw, state, { onProgress, onToken });

      if (result.kind === 'answer') {
        if (result.streamed) console.log();
        else console.log(result.text);
      } else if (result.kind === 'discuss') {
        console.log(result.text);
      } else if (result.kind === 'task') {
        // hidden — user asked not to see internal TODO/files, just a clean done + path
        const writes = result.run?.writes ?? [];
        const where = state.workspaceDir;
        if (result.run?.status === 'done') {
          console.log(paint(C.green, `\n✓ Built ${writes.length} files in ${where}`, color));
          if (writes.length) console.log(paint(C.dim, `  ${writes.map((w) => w.rel).join(', ')}`, color));
        } else {
          console.log(paint(C.yellow, `\n→ ${result.run?.status ?? 'done'} — ${writes.length} files in ${where}`, color));
          if (writes.length) console.log(paint(C.dim, `  ${writes.map((w) => w.rel).join(', ')}`, color));
        }
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
      thinker.stop();
      running = false;
      if (!rl.closed) rl.prompt();
    }
  }

  process.off('SIGINT', onSigint);
  rl.close();
  return 0;
}
