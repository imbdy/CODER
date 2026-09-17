/** Interactive chat REPL — `artisan chat` / `artisan --chat` */
import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import { createInteractiveState, executeTurn, handleCommand } from '../runtime/interactive.mjs';
import { loadConfig } from '../core/config.mjs';
import { createSession } from '../runtime/facade.mjs';
import { isExplicitTrigger } from '../runtime/triggers.mjs';

const C = { reset: '\x1b[0m', dim: '\x1b[2m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', magenta: '\x1b[35m', bold: '\x1b[1m' };
function paint(code, text, useColor) { return useColor ? `${code}${text}${C.reset}` : text; }

function createThinker({ color }) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let timer = null;
  let active = false;
  let label = 'Thinking...';
  return {
    start(text) {
      if (text) label = text;
      if (active) return;
      active = true;
      if (!process.stdout.isTTY) return;
      timer = setInterval(() => {
        const frame = frames[i = (i + 1) % frames.length];
        process.stdout.write(`\r\x1b[K${paint(C.dim, `${frame} ${label}`, color)}`);
      }, 80);
    },
    stop() {
      if (!active) return;
      active = false;
      if (timer) clearInterval(timer);
      timer = null;
      if (process.stdout.isTTY) process.stdout.write('\r\x1b[K');
    },
    get active() { return active; },
  };
}

/** Concise, visible progress for the build phase — one line per meaningful event. */
function progressPrinter({ color, thinker, quiet }) {
  const seen = new Set();
  return (ev) => {
    if (quiet) return;
    const key = `${ev.type}:${ev.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    let line;
    switch (ev.type) {
      case 'brain': line = paint(C.dim, `  ▸ brain: ${ev.text}`, color); break;
      case 'phase': line = paint(C.cyan, `  ▸ ${ev.text}`, color); thinker.start(`${ev.text}...`); break;
      case 'skill': line = paint(C.dim, `    skills ${ev.text}`, color); break;
      case 'todo': line = paint(C.dim, `    plan: ${ev.text}`, color); break;
      case 'edit': line = paint(C.green, `    + ${ev.text}`, color); break;
      case 'qa': line = paint(C.magenta, `    visual QA ${ev.text}`, color); break;
      case 'iterate': line = paint(C.yellow, `    iterate: ${ev.text}`, color); break;
      case 'verify': line = paint(C.dim, `    ${ev.text}`, color); break;
      case 'error': line = paint(C.red, `    ! ${ev.text}`, color); break;
      default: return;
    }
    const wasActive = thinker.active;
    thinker.stop();
    console.log(line);
    if (wasActive) thinker.start();
  };
}

function extractWorkspacePath(text) {
  const t = String(text ?? '');
  const win = t.match(/([A-Za-z]:\\[^\s"'`]+)/) ?? t.match(/([A-Za-z]:\/[^\s"'`]+)/);
  if (win) return win[1].replace(/[,.;]+$/, '');
  const quoted = t.match(/["']([A-Za-z]:\\[^"']+)["']/);
  if (quoted) return quoted[1];
  const m = t.match(/(?:in folder|in this folder|to folder|path|workspace)\s+([A-Za-z]:\\[^\s]+)/i);
  if (m) return m[1].replace(/[,.;]+$/, '');
  return null;
}

export async function runChat({ workspaceDir, config, flags = {} } = {}) {
  const color = flags['no-color'] ? false : true;
  const quiet = Boolean(flags.quiet);
  const dir = path.resolve(String(workspaceDir ?? flags.workspace ?? process.cwd()));
  const cfg = config ?? loadConfig({ workspaceDir: dir, brain: flags.brain ?? 'auto', verbose: Boolean(flags.verbose) });
  if (flags.verbose) cfg.runtime = { ...cfg.runtime, verbose: true };

  const { router } = createSession({ workspaceDir: dir, config: cfg });
  const state = createInteractiveState({ workspaceDir: dir, config: cfg });
  const thinker = createThinker({ color });
  const onProgress = progressPrinter({ color, thinker, quiet });

  console.log(paint(C.bold, '\n  artisan — creative frontend engineer', color));
  console.log(paint(C.dim, `  workspace: ${dir}`, color));
  try {
    const brain = await router.activeBrain();
    console.log(paint(C.dim, `  brain: ${brain?.offline ? 'no live model — deterministic engine (start Ollama or set ARTISAN_API_KEY for real conversation)' : `${brain?.label ?? ''} ${brain?.model ?? ''}`.trim()}`, color));
  } catch { /* banner only */ }
  console.log(paint(C.dim, '  talk about the idea, then say "build it" — /help for commands, /exit to quit\n', color));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: paint(C.cyan, 'you> ', color),
    terminal: Boolean(process.stdin.isTTY),
    historySize: 200,
  });

  let running = false;
  let sigintCount = 0;
  let inputClosed = false;
  rl.on('close', () => { inputClosed = true; });
  const safePrompt = () => { if (!inputClosed) { try { rl.prompt(); } catch { /* input ended */ } } };
  const onSigint = () => {
    if (!running) {
      sigintCount += 1;
      if (sigintCount === 1) {
        console.log(paint(C.yellow, '\n(press Ctrl+C again to exit, or type /exit)', color));
        safePrompt();
        setTimeout(() => { sigintCount = 0; }, 2000);
        return;
      }
      console.log(paint(C.dim, '\nGoodbye.', color));
      rl.close();
      process.exit(0);
    } else {
      console.log(paint(C.yellow, '\n[interrupt] the current build will finish its step; session state is preserved', color));
    }
  };
  process.on('SIGINT', onSigint);
  safePrompt();

  for await (const line of rl) {
    const raw = String(line ?? '').trim();
    if (!raw) { safePrompt(); continue; }

    if (raw.startsWith('/')) {
      const res = handleCommand(raw, state);
      if (res.exit) { console.log(paint(C.dim, 'Goodbye.', color)); break; }
      if (res.clear) process.stdout.write(res.text);
      else if (res.text) console.log(res.text);
      safePrompt();
      continue;
    }
    if (/^(exit|quit|bye)\s*$/i.test(raw)) { console.log(paint(C.dim, 'Goodbye.', color)); break; }

    running = true;
    // Workspace switching from the message ("put it in C:\Projects\site").
    {
      let target = extractWorkspacePath(raw);
      if (target) state.pendingWorkspacePath = target;
      else if (state.pendingWorkspacePath && isExplicitTrigger(raw)) target = state.pendingWorkspacePath;
      if (target) {
        try {
          const resolved = path.resolve(target);
          fs.mkdirSync(resolved, { recursive: true });
          if (resolved !== state.workspaceDir) {
            state.workspaceDir = resolved;
            state.workspacePath = resolved;
            try { state.config = loadConfig({ workspaceDir: resolved, brain: flags.brain ?? 'auto' }); } catch {}
            console.log(paint(C.dim, `  → workspace switched to ${resolved}`, color));
          }
        } catch (e) {
          console.log(paint(C.yellow, `  ! could not switch to ${target}: ${String(e?.message ?? e).slice(0, 120)}`, color));
        }
      }
    }

    thinker.start('Thinking...');
    let streamedAny = false;
    let lineBroken = false;
    const onToken = (text) => {
      if (!streamedAny) { thinker.stop(); process.stdout.write(paint(C.bold, 'artisan> ', color)); streamedAny = true; lineBroken = false; }
      process.stdout.write(text);
    };
    const progress = (ev) => {
      if (streamedAny && !lineBroken) { process.stdout.write('\n'); lineBroken = true; }
      onProgress(ev);
    };
    try {
      const result = await executeTurn(raw, state, { onProgress: progress, onToken });
      thinker.stop();
      if (result.kind === 'answer') {
        if (streamedAny) console.log();
        else console.log(`${paint(C.bold, 'artisan> ', color)}${result.text}`);
      } else if (result.kind === 'task') {
        if (streamedAny && !lineBroken) console.log();
        const run = result.run;
        const tone = run?.status === 'done' ? C.green : run?.status === 'failed' ? C.red : C.yellow;
        const lines = String(result.summary ?? '').split('\n');
        console.log(paint(tone, `\n${paint(C.bold, 'artisan> ', color)}${lines[0]}`, color));
        for (const l of lines.slice(1)) console.log(paint(C.dim, `  ${l}`, color));
        console.log();
      } else if (result.kind === 'exit') {
        console.log(paint(C.dim, 'Goodbye.', color));
        break;
      } else if (result.kind === 'error') {
        if (streamedAny) console.log();
        console.log(paint(C.red, `error: ${result.error}`, color));
      } else if (result.text) {
        console.log(result.text);
      }
    } catch (e) {
      thinker.stop();
      console.log(paint(C.red, `error: ${String(e?.message ?? e)}`, color));
    } finally {
      thinker.stop();
      running = false;
      safePrompt();
    }
  }

  process.off('SIGINT', onSigint);
  rl.close();
  return 0;
}
