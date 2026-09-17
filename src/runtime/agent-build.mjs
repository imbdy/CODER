/**
 * Build entry point for the interactive runtime.
 *
 * Prefers the real tool-calling agent (qwen2.5-coder:7b via Ollama): it thinks,
 * reads skills, writes real files and verifies them. When no live model is
 * available it falls back to the deterministic design engine (`runTask`) so a
 * session never dead-ends.
 *
 * Returns the same shape as `runTask` ({ run, bus, agent? }) so every caller can
 * stay unchanged.
 */

import { runTask } from './session.mjs';
import { runAgent } from '../agent/agent.mjs';
import { createRouter } from '../model/router.mjs';
import { readWorkspaceFile } from '../workspace/writer.mjs';
import { makeId } from '../core/util.mjs';
import { checkStructure as verifyStructure } from '../verify/agent-output.mjs';

export async function runBuild(request, { workspaceDir, config, bus, overrides = {}, progress, history = [] } = {}) {
  const useAgent = config?.runtime?.useAgent !== false;
  if (useAgent) {
    try {
      const router = createRouter({ config, bus });
      if (await router.hasLiveModel()) {
        const brain = await router.activeBrain();
        progress?.({ type: 'brain', text: `${brain?.label ?? 'model'} ${brain?.model ?? ''}`.trim() });
        const agent = await runAgent(request, {
          workspaceDir,
          config,
          bus,
          router,
          history,
          maxSteps: config?.runtime?.maxAgentSteps ?? 15,
          dryRun: Boolean(overrides.dryRun),
        });
        return { run: agentToRun(agent, request, workspaceDir), bus, agent };
      }
      progress?.({ type: 'brain', text: 'no live model — deterministic engine' });
    } catch (error) {
      throw error; // Never overwrite a partial agent build with the offline template.
    }
  }
  const outcome = await runTask(request, { workspaceDir, config, overrides, bus });
  return outcome;
}

/** Shape the agent result like a deterministic run so the runtime can reuse it. */
function agentToRun(agent, request, workspaceDir) {
  const writes = agent.writes ?? [];
  const files = [...new Map([...(agent.inspection?.files ?? []), ...writes].map((file) => [file.rel, file])).values()];
  const verification = verifyStructure(workspaceDir, files, agent);
  // Prefer agent's own done flag + state machine completion over simple verification
  const agentDone = agent.done === true;
  const stateCompleted = agent.state?.current === 'COMPLETED';
  const status = writes.length === 0 ? 'failed' : ( (agentDone || stateCompleted) && verification.ok && !verification.warnings?.length ? 'done' : (agentDone ? 'done' : 'needs-fix') );
  const skills = [...new Set([...(agent.skills?.ids ?? []), ...(agent.skillsRead ?? [])])];
  // Prefer structured todos from agent if available
  const todos = agent.todos ?? agent.todoStats ?? null;
  const planSteps = todos ? todos.map(t=> ({ id: t.id, title: t.description ?? t.title, goal: t.completionCondition ?? t.description, files: t.files ?? [], skills: t.skills ?? [] })) : stepsFromAgent(agent);
  return {
    id: makeId('agent'),
    request,
    status,
    agent: true,
    startedAt: new Date(Date.now() - (agent.ms ?? 0)).toISOString(),
    endedAt: new Date().toISOString(),
    understanding: { taskType: agent.taskType, summary: agent.summary },
    plan: { steps: planSteps },
    skills: { ids: skills, summary: agent.skills?.summary },
    todos: agent.todos ?? undefined,
    todoStats: agent.todoStats ?? undefined,
    state: agent.state ?? undefined,
    spec: agent.spec ?? undefined,
    visualQa: agent.visualQaDone ? { done: true } : undefined,
    complexity: agent.state?.complexity ?? undefined,
    radius: undefined,
    writes,
    verification,
    summary: agent.summary,
    model: { provider: agent.provider, model: agent.model, steps: agent.stepCount, ms: agent.ms },
    skillsRead: agent.skillsRead ?? [],
  };
}

/** One TODO per milestone so the chat TODO list reflects what the agent did. */
function stepsFromAgent(agent) {
  const steps = [
    { id: 'think', title: 'Think + read skills', goal: agent.summary ?? '', files: [], skills: agent.skillsRead ?? [] },
  ];
  for (const write of agent.writes ?? []) {
    steps.push({ id: `write-${write.rel}`, title: `Write ${write.rel}`, goal: `${write.bytes} bytes`, files: [write.rel], skills: [] });
  }
  steps.push({ id: 'verify', title: 'Verify output', goal: 'read back + structure check', files: [], skills: [] });
  return steps;
}

/**
 * Deterministic sanity check of what the agent produced.
 *
 * The guard against the original failure mode (a single HTML file with
 * everything inline): if the markup links a stylesheet or a script, those files
 * must actually exist.
 *
 * Implementation lives in ../verify/agent-output.mjs and is re-exported here
 * because both the agent loop (repair turn) and the test harness use it.
 */
export { checkStructure } from '../verify/agent-output.mjs';

