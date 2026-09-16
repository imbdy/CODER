/**
 * Configuration resolution order (lowest -> highest priority):
 *   1. built-in defaults
 *   2. ./.forge/config.json inside the target workspace
 *   3. ./artisan.config.json inside the target workspace
 *   4. ARTISAN_* environment variables
 *   5. explicit CLI overrides
 */

import fs from 'node:fs';
import path from 'node:path';
import { deepMerge, parseList } from './util.mjs';

export const DEFAULT_CONFIG = {
  /** Which model brains are available, in fallback order. */
  models: {
    order: ['ollama', 'openaiCompatible', 'deterministic'],
    ollama: {
      host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
      // Qwen2.5-7B-Coder via Ollama — chosen over vLLM/llama.cpp for local 7B (see REPORT)
      model: process.env.OLLAMA_MODEL || process.env.ARTISAN_OLLAMA_MODEL || 'qwen2.5-coder:7b',
      temperature: 0.35, // 7B: lower temp = less tool-JSON drift
      numCtx: 8192, // 7B practical: 8192 keeps latency low; 16384 opt-in via OLLAMA_NUM_CTX
      timeoutMs: 240000,
      keepAlive: '30m',
    },
    openaiCompatible: {
      baseUrl: process.env.ARTISAN_BASE_URL || '',
      apiKey: process.env.ARTISAN_API_KEY || '',
      model: process.env.ARTISAN_MODEL || '',
      temperature: 0.5,
      timeoutMs: 180000,
    },
    deterministic: {
      // Model-free design engine. Always available, fully reproducible.
      enabled: true,
    },
  },
  runtime: {
    maxPlanSteps: 8, // 7B: shorter plans, less branching
    maxImproveIterations: 1, // 7B: one polish pass only
    maxToolCallsPerStep: 2, // 7B: max 2 tools per turn (prefer 1) — fewer parallel calls = higher success
    maxRepairAttempts: 1,
    contextBudgetTokens: 6000, // 7B: trimmed history budget (was 24000 for frontier)
    skillBudgetTokens: 4000, // 7B: fewer tokens, only essential skills
    /** Use the LLM tool-calling agent for builds (falls back to the deterministic engine). */
    useAgent: true,
    /** Hard cap on agent steps so a stuck local model cannot loop forever. 7B workflow is 6 steps but needs buffer. */
    maxAgentSteps: 12,
    /** Allow extra turns that fix verification findings (undefined tokens, alert(), missing media queries). */
    agentRepairPass: true,
    maxAgentRepairPasses: 1,
    /** Qwen-7B specific: enforce minimal 5-tool set and trimmed history */
    qwenTools: true,
    maxTokens: 4096, // per-turn generation limit for 7B
  },
  skills: {
    roots: ['skills'],
    maxSkillsPerTask: 7,
    alwaysInclude: ['anti-slop'],
  },
  workspace: {
    ignore: [
      'node_modules', '.git', 'dist', 'build', '.next', '.turbo', '.cache',
      'coverage', '.venv', '__pycache__', '.forge', 'out', '.output', '.vite',
    ],
    maxScanFiles: 4000,
    maxFileBytes: 400000,
    memoryFile: '.forge/memory.json',
  },
  verification: {
    runBuild: true,
    runDevServerProbe: true,
    runVisual: true,
    runResponsive: true,
    runA11y: true,
    runAntiSlop: true,
    visualViewports: [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'tablet', width: 834, height: 1112 },
      { name: 'mobile', width: 390, height: 844 },
    ],
    devServerTimeoutMs: 90000,
    screenshotTimeoutMs: 60000,
    minQualityScore: 78,
  },
  policy: {
    allowShell: true,
    allowNetwork: true,
    allowDestructiveCommands: false,
    commandTimeoutMs: 300000,
    maxWritesPerRun: 400,
  },
  ui: {
    color: true,
    verbose: false,
    stream: true,
  },
};

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Canonical provider ids: 'openai-compatible', 'openaiCompatible' and 'ollama'
 *  all appear in the wild (env vars, CLI flags, older config files). */
export function normalizeProviderId(id) {
  const key = String(id ?? '').trim().toLowerCase().replace(/[-_]/g, '');
  if (key === 'ollama' || key === 'local') return 'ollama';
  if (key === 'openaicompatible' || key === 'openai' || key === 'api') return 'openaiCompatible';
  if (key === 'deterministic' || key === 'offline' || key === 'heuristic') return 'deterministic';
  return String(id ?? '').trim();
}

/** Rewrite `patch.models.order` (and any kebab-case model blocks) to canonical ids. */
function normalizeOrder(patch) {
  const models = patch?.models;
  if (!models) return;
  if (Array.isArray(models.order)) models.order = [...new Set(models.order.map(normalizeProviderId))];
  if (models['openai-compatible']) {
    models.openaiCompatible = { ...(models['openai-compatible'] ?? {}), ...(models.openaiCompatible ?? {}) };
    delete models['openai-compatible'];
  }
}

function envOverrides() {
  const env = process.env;
  const patch = { models: {}, runtime: {}, policy: {}, verification: {}, ui: {}, skills: {} };
  const apiPatch = (value) => { patch.models.openaiCompatible = { ...(patch.models.openaiCompatible ?? {}), ...value }; };
  if (env.ARTISAN_MODEL) apiPatch({ model: env.ARTISAN_MODEL });
  if (env.ARTISAN_BASE_URL) apiPatch({ baseUrl: env.ARTISAN_BASE_URL });
  if (env.ARTISAN_API_KEY) apiPatch({ apiKey: env.ARTISAN_API_KEY });
  if (env.ARTISAN_PROVIDERS) patch.models.order = parseList(env.ARTISAN_PROVIDERS);
  if (env.MODEL_NAME) apiPatch({ model: env.MODEL_NAME });
  if (env.MODEL_BASE_URL) apiPatch({ baseUrl: env.MODEL_BASE_URL });
  if (env.MODEL_API_KEY) apiPatch({ apiKey: env.MODEL_API_KEY });
  // Local brain (default): qwen2.5-coder via Ollama. These env vars let you point
  // at another host or model without editing code.
  if (env.ARTISAN_OLLAMA_MODEL || env.ARTISAN_OLLAMA_HOST || env.OLLAMA_HOST) {
    patch.models.ollama = {
      ...(patch.models.ollama ?? {}),
      ...(env.ARTISAN_OLLAMA_MODEL ? { model: env.ARTISAN_OLLAMA_MODEL } : {}),
      ...(env.ARTISAN_OLLAMA_HOST || env.OLLAMA_HOST ? { host: env.ARTISAN_OLLAMA_HOST || env.OLLAMA_HOST } : {}),
    };
  }
  normalizeOrder(patch);
  if (env.REASONING_EFFORT) patch.runtime.reasoningEffort = env.REASONING_EFFORT;
  if (env.ARTISAN_MAX_IMPROVEMENTS) patch.runtime.maxImproveIterations = Number(env.ARTISAN_MAX_IMPROVEMENTS);
  if (env.ARTISAN_MAX_STEPS) patch.runtime.maxPlanSteps = Number(env.ARTISAN_MAX_STEPS);
  if (env.ARTISAN_CONTEXT_BUDGET) patch.runtime.contextBudgetTokens = Number(env.ARTISAN_CONTEXT_BUDGET);
  if (env.ARTISAN_ALLOW_SHELL !== undefined) patch.policy.allowShell = env.ARTISAN_ALLOW_SHELL !== '0';
  if (env.ARTISAN_NO_COLOR) patch.ui.color = false;
  if (env.NO_COLOR) patch.ui.color = false;
  if (env.ARTISAN_VERBOSE) patch.ui.verbose = true;
  if (env.ARTISAN_MIN_SCORE) patch.verification.minQualityScore = Number(env.ARTISAN_MIN_SCORE);
  if (env.ARTISAN_SKILL_ROOTS) patch.skills.roots = parseList(env.ARTISAN_SKILL_ROOTS);
  return patch;
}

export function loadConfig({ workspaceDir = process.cwd(), overrides = {}, agentRoot = undefined, brain = undefined } = {}) {
  const candidates = [
    path.join(workspaceDir, '.forge', 'config.json'),
    path.join(workspaceDir, 'artisan.config.json'),
  ];
  let config = DEFAULT_CONFIG;
  for (const candidate of candidates) {
    const fileConfig = readJsonIfExists(candidate);
    if (fileConfig) config = deepMerge(config, fileConfig);
  }
  config = deepMerge(config, envOverrides());
  config = deepMerge(config, overrides);
  // `--brain <id>` / `{ brain }` forces a single provider in the chain. Without
  // this the flag was parsed by the CLI and then silently dropped.
  if (brain && String(brain).toLowerCase() !== 'auto') {
    config.models = { ...config.models, order: [normalizeProviderId(brain)] };
  } else {
    normalizeOrder(config);
  }
  config.agentRoot = agentRoot ?? path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
  config.workspaceDir = path.resolve(workspaceDir);
  config.skills.roots = config.skills.roots.map((root) => (path.isAbsolute(root) ? root : path.resolve(config.agentRoot, root)));
  return config;
}

export function initWorkspaceConfig(workspaceDir) {
  const dir = path.join(workspaceDir, '.forge');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'config.json');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `${JSON.stringify({
      models: { order: DEFAULT_CONFIG.models.order, ollama: { model: DEFAULT_CONFIG.models.ollama.model } },
      runtime: { maxImproveIterations: DEFAULT_CONFIG.runtime.maxImproveIterations },
      verification: { minQualityScore: DEFAULT_CONFIG.verification.minQualityScore },
    }, null, 2)}\n`);
  }
  const ignoreFile = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignoreFile)) fs.writeFileSync(ignoreFile, 'runs/\nmemory.json\n');
  return file;
}