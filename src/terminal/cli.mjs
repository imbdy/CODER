/** Canonical CLI: `artisan "<request>" --workspace DIR` | doctor | skills | demo. */
import path from 'node:path';
import fs from 'node:fs';
import { loadConfig } from '../core/config.mjs';
import { createSession } from '../runtime/facade.mjs';
import { createRenderer } from './render.mjs';
import { parseCliArgs } from './args.mjs';
import { printBanner, printHelp } from './banners.mjs';

const DEMO_REQUESTS = {
  'red-button': 'Build me a simple red button',
  login: 'Build me a premium login screen',
  landing: 'Build me a landing page for a developer tool called Northwind',
};

export async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const flags = args.flags;
  if (flags.help || args.requestText === 'help') { printHelp(); return 0; }
  // chat is a first-class entry — `artisan chat` or `npm run artisan -- chat`
  // also supports --chat flag
  const rawFirst = String(args.request[0] ?? '').toLowerCase();
  const wantsChat = rawFirst === 'chat' || Boolean(flags.chat);
  if (wantsChat) {
    // `artisan chat --help` should still show help, not enter REPL
    if (flags.help) { printHelp(); return 0; }
    const ws = path.resolve(String(flags.workspace ?? process.cwd()));
    const { runChat } = await import('./chat.mjs');
    return runChat({ workspaceDir: ws, flags });
  }
  if (!args.requestText) { printBanner(); printHelp(); return 0; }

  const firstWord = args.requestText.split(/\s+/)[0].toLowerCase();
  const isVerb = ['doctor', 'skills', 'demo'].includes(firstWord);
  const workspaceDir = path.resolve(String(flags.workspace ?? process.cwd()));

  const config = loadConfig({
    workspaceDir,
    brain: flags.brain ?? 'auto',
    verbose: Boolean(flags.verbose),
  });
  if (flags.verbose) config.runtime = { ...config.runtime, verbose: true };

  const { session, events, registry, router } = createSession({ workspaceDir, config });
  createRenderer({ bus: events, color: !flags['no-color'], verbose: Boolean(flags.verbose) });

  if (firstWord === 'doctor') {
    const report = await router.describe({ probe: true });
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  if (firstWord === 'skills') {
    const skills = registry.list();
    console.log(`${skills.length} skill(s) loaded:`);
    for (const skill of skills) console.log(`  - ${skill.id} [${skill.category}] ${skill.description.slice(0, 90)}`);
    return 0;
  }

  let request = args.requestText;
  if (firstWord === 'demo') {
    const kind = args.request.slice(1)[0] ?? 'login';
    request = DEMO_REQUESTS[kind] ?? DEMO_REQUESTS.login;
    fs.mkdirSync(workspaceDir, { recursive: true });
    console.log(`demo "${kind}" → workspace ${workspaceDir}`);
  }

  const outcome = await session.run(request, {
    dryRun: Boolean(flags['no-write']),
    maxIterations: Number(flags['max-iters'] ?? 2),
  });
  if (flags.json) {
    console.log(JSON.stringify({
      id: outcome.id, status: outcome.status, taskType: outcome.understanding?.taskType,
      direction: outcome.direction, score: outcome.critique?.overall,
      verification: outcome.verification?.summary, files: (outcome.writes ?? []).map((w) => w.rel),
    }, null, 2));
  } else {
    console.log(outcome.summary);
  }
  return outcome.status === 'done' ? 0 : 1;
}

