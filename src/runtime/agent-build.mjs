/**
 * Build entry point shared by the conversation runtime, the CLI facade and tests.
 *
 * Routes a BRIEF to one of two clearly labelled engines:
 *   - agent          : the live model executor (runAgent) — the real product path
 *   - deterministic  : the model-free design engine (runTask) — offline fallback
 *
 * The returned run always says which engine produced it (`run.engine`) and
 * carries the agreed context it consumed, so nothing can be mistaken for
 * model output that was not.
 */

import { runTask } from './session.mjs';
import { runAgent, normalizeBrief, briefText } from '../agent/agent.mjs';
import { createRouter } from '../model/router.mjs';
import { makeId } from '../core/util.mjs';
import { checkStructure as verifyStructure } from '../verify/agent-output.mjs';
import { snapshotAgreed as snapshotContext, directivesFromContext } from './agreed-context.mjs';

export async function runBuild(input, { workspaceDir, config, bus, overrides = {}, progress, history = [], agreed = undefined, registry, qaOutDir } = {}) {
  const brief = normalizeBrief(typeof input === 'string' ? { request: input, agreed, mode: agreed?.build ? 'refine' : 'create' } : { ...input, agreed: input.agreed ?? agreed });
  const useAgent = config?.runtime?.useAgent !== false;
  const router = createRouter({ config, bus });
  let liveReason = 'agent disabled in config';
  if (useAgent) {
    const live = await router.hasLiveModel().catch(() => false);
    if (live) {
      const brain = await router.activeBrain();
      progress?.({ type: 'brain', text: `${brain?.label ?? 'model'} ${brain?.model ?? ''}`.trim() });
      const agent = await runAgent(brief, {
        workspaceDir, config, bus, router, registry, qaOutDir,
        maxSteps: overrides.maxSteps ?? config?.runtime?.maxAgentSteps ?? 24,
        dryRun: Boolean(overrides.dryRun),
      });
      // The live agent owns the result whenever it produced work or an honest
      // failure. Only a provider failure with zero output falls through to the
      // deterministic engine (and says so) — a session must never dead-end.
      if ((agent.writes ?? []).length > 0 || agent.done || !agent.lastError) {
        const run = agentToRun(agent, brief, workspaceDir);
        return { run, bus, agent };
      }
      liveReason = `live model failed before producing anything: ${agent.lastError}`;
      progress?.({ type: 'brain', text: `${liveReason} — falling back to the deterministic engine` });
    } else {
      liveReason = 'no live model reachable';
      progress?.({ type: 'brain', text: 'no live model — deterministic design engine' });
    }
  }
  const outcome = await runTask(briefText(brief), { workspaceDir, config, overrides, bus, // The directives carry what to avoid and emphasise; the BUILD RECORD carries
  // what this project already decided (its identity, its section plan). A
  // refinement needs both, or it re-derives the page from a "Do it." and
  // silently restores the sections the first pass deliberately dropped.
  agreed: brief.agreed ? { ...directivesFromContext(brief.agreed), build: brief.agreed.build } : undefined,
    mode: brief.mode,
  });
  outcome.run.engine = 'deterministic';
  outcome.run.engineReason = liveReason;
  outcome.run.mode = brief.mode;
  if (brief.agreed) outcome.run.agreedSnapshot = snapshotContext(brief.agreed);
  return outcome;
}

/** Compact, inspectable record of the agreed context consumed by a build. */
export function snapshotAgreed(agreed) { return snapshotContext(agreed); }

/** Shape the agent result like a deterministic run so every caller can reuse it. */
function agentToRun(agent, brief, workspaceDir) {
  const writes = agent.writes ?? [];
  const files = [...new Map([...(agent.inspection?.files ?? []).filter((f) => !f.rel.startsWith('.forge')), ...writes].map((file) => [file.rel, file])).values()];
  const verification = writes.length ? verifyStructure(workspaceDir, files, agent) : { ok: false, summary: 'no files written', issues: ['no files written'], warnings: [] };
  const qa = agent.visualQa?.final;
  return {
    id: makeId('agent'),
    engine: 'agent',
    request: brief.request,
    mode: brief.mode,
    status: agent.status,
    agent: true,
    startedAt: new Date(Date.now() - (agent.ms ?? 0)).toISOString(),
    endedAt: new Date().toISOString(),
    understanding: { taskType: agent.taskType, summary: agent.summary, mode: brief.mode },
    complexity: agent.complexity,
    plan: { source: agent.planSource, steps: (agent.todos ?? []).map((t) => ({ id: t.id, title: t.description, goal: t.completionCondition, files: t.files ?? [], skills: t.skills ?? [], status: t.status })) },
    todos: agent.todos,
    todoStats: agent.todoStats,
    skills: { ids: agent.skills?.ids ?? [], loaded: (agent.skills?.loaded ?? []).map((l) => l.id), method: agent.skills?.method, required: agent.skills?.required, tech: agent.skills?.tech, summary: agent.skills?.summary },
    skillsRead: agent.skillsRead ?? [],
    spec: agent.spec,
    state: agent.state,
    visualQa: qa ? { rendered: qa.rendered, method: qa.method, score: qa.score, verdict: qa.verdict, findings: qa.findings, screenshots: qa.screenshots, rounds: agent.visualQa.rounds.length, reason: qa.reason_unrendered, coverage: qa.coverage } : { rendered: false, rounds: 0, reason: 'visual QA did not run' },
    testing: agent.testing,
    writes,
    verification,
    summary: agent.summary,
    report: agent.report,
    model: { provider: agent.provider, model: agent.model, steps: agent.stepCount, ms: agent.ms },
    agreedSnapshot: brief.agreed ? snapshotContext(brief.agreed) : undefined,
    lastError: agent.lastError,
  };
}

export { checkStructure } from '../verify/agent-output.mjs';
