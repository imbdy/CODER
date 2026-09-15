/* run-bottom-task.mjs
   Quiet, reliable end-to-end run for the "awesome bottom section" test.
   Do not run through artisan runTask flow if artisan hooks cause instability.
   Use minimal wrapper: load config, router, session helper, run task inline.
*/
import { createEventBus, createLogger, createRenderer } from './src/core/events.mjs';
import { createFileSink, createMemorySink } from './src/core/logger.mjs';
import { loadConfig } from './src/core/config.mjs';
import { createSkillRegistry } from './src/skills/registry.mjs';
import { createRetriever } from './src/skills/retriever.mjs';
import { createRouter } from './src/model/router.mjs';
import { runTask } from './src/runtime/session.mjs';

const task = `Build the bottom section of this landing page.

Make it look **fucking amazing** — premium, futuristic, playful, and polished.

I want to test your visual design ability, so **don't play it safe**. Create a memorable final CTA/footer with strong composition, interesting micro-interactions, subtle animations, and excellent typography.

It should feel like a real high-end developer tool website, not a generic SaaS template.

Use the existing design system and match the rest of the page.

Keep the implementation clean and responsive.

**Only modify the bottom section. Do not touch unrelated parts of the page.**`;

const workspace = 'C:/Users/abood/artisan-live-test';

const config = loadConfig({ workspaceDir: workspace });
const bus = createEventBus();
const logger = createLogger({ level: 'info', sinks: [createMemorySink({})] });
const renderer = createRenderer({ bus, color: true, verbose: false });
const registry = createSkillRegistry({ logger }, { skillsRoots: config.skills.roots });
const retriever = createRetriever({ registry, config, logger });
const router = createRouter({ config, bus, logger });

const r = await runTask({
  request: task,
  workspaceDir: workspace,
  config,
  bus,
  logger,
  router,
  retriever,
  quiet: false,
});

process.stdout.write(`STATUS: ${r.status ?? 'n/a'}\n`);
process.stdout.write(`SCORE: ${r.critique?.overall ?? 'n/a'}\n`);
process.stdout.write(`WRITES: ${(r.writes ?? []).length}\n`);
process.stdout.write(`EDITS: ${r.edits?.length ?? 0}\n`);
process.stdout.write(`USED_PROVIDER: ${r.model?.provider ?? 'n/a'}\n`);
