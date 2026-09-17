/** Session facade expected by the CLI: createSession + run + doctor/skills. */
import { loadConfig } from '../core/config.mjs';
import { EventBus } from '../core/events.mjs';
import { createLogger } from '../core/logger.mjs';
import { runTask } from './session.mjs';
import { runBuild } from './agent-build.mjs';
import { createRouter } from '../model/router.mjs';
import { createSkillRegistry } from '../skills/registry.mjs';
export function createSession({ workspaceDir = process.cwd(), config, verbose = false } = {}) {
  const resolved = config ?? loadConfig({ workspaceDir });
  if (verbose) resolved.ui = { ...(resolved.ui ?? {}), verbose: true };
  const events = new EventBus();
  const logger = createLogger({ level: resolved.ui?.verbose ? 'debug' : 'info' });
  const router = createRouter({ config: resolved, logger, bus: events });
  const registry = createSkillRegistry({ skills: resolved.skills, logger });
  const session = {
    config: resolved,
    events,
    logger,
    router,
    skills: registry,
    async run(request, options = {}) {
      // Prefer agent (Groq/Qwen) when live model available, fallback to deterministic
      try {
        if (resolved.runtime?.useAgent !== false && await router.hasLiveModel()) {
          const built = await runBuild(String(request ?? ''), { workspaceDir, config: resolved, bus: events });
          const summary = `${built.run.status} — ${built.run.understanding?.taskType ?? 'task'} (${(built.run.writes ?? []).map(w=>w.rel).join(', ') || 'no files'}) score ${built.run.critique?.overall ?? built.run.verification?.summary ?? ''}`;
          return { ...built.run, html: undefined, css: undefined, summary, bus: events };
        }
      } catch (e) {
        logger.debug('agent build failed, falling back to deterministic', { error: String(e?.message ?? e) });
      }
      const outcome = await runTask(String(request ?? ''), {
        workspaceDir,
        config: resolved,
        overrides: {
          dryRun: Boolean(options.dryRun),
          noMemory: Boolean(options.noMemory),
          maxIterations: options.maxIterations ?? 2,
        },
      });
      const summary = summarize(outcome);
      return { ...outcome.run, html: outcome.html, css: outcome.css, summary, bus: outcome.bus };
    },
    async doctor() { return router.describe({ probe: true }); },
  };
  return { session, events, config: resolved, router, registry };
}
function summarize(outcome) {
  if (outcome.error) return `failed: ${outcome.error}`;
  const writes = (outcome.run.writes ?? []).map((w) => w.rel).join(', ');
  return `${outcome.run.status} — ${outcome.run.understanding?.taskType ?? 'task'} (${writes || 'no files'}) score ${outcome.run.critique?.overall ?? 'n/a'}`;
}
