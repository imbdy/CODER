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
    // Groq (when key present) → Ollama Qwen → deterministic; user can override via ARTISAN_PROVIDERS
    order: process.env.ARTISAN_API_KEY ? ['openaiCompatible', 'ollama', 'deterministic'] : ['ollama', 'openaiCompatible', 'deterministic'],
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
      // Groq (gsk_*) is OpenAI-compatible at https://api.groq.com/openai/v1
      baseUrl: process.env.ARTISAN_BASE_URL || (process.env.ARTISAN_API_KEY?.startsWith('gsk_') ? 'https://api.groq.com/openai/v1' : ''),
      apiKey: process.env.ARTISAN_API_KEY || '',
      model: process.env.ARTISAN_MODEL || (process.env.ARTISAN_API_KEY?.startsWith('gsk_') ? 'groq/compound' : ''),
      // Undefined lets the provider decide per model: reasoning models default to
      // 'low' so the small token window buys an answer instead of deliberation.
      reasoningEffort: process.env.REASONING_EFFORT || undefined,
      temperature: 0.35,
      timeoutMs: 180000,
    },
    deterministic: {
      // Model-free design engine. Always available, fully reproducible.
      enabled: true,
    },
  },
  runtime: {
    maxPlanSteps: 8,
    maxImproveIterations: 1,
    maxToolCallsPerStep: 2,
    maxRepairAttempts: 1,
    /**
     * Implementation-loop history budget (tokens). A ceiling, not a target: the
     * actual history is whatever is left of one request after the system prompt
     * and the answer are paid for.
     */
    contextBudgetTokens: 24000,
    /** Budget for skill bodies injected into the implementation prompt (tokens). */
    skillBudgetTokens: 22000,
    /** Use the live model executor for builds (falls back to the deterministic engine when no model is reachable). */
    useAgent: true,
    /** Hard cap on implementation turns (includes QA iterations and repair passes). */
    maxAgentSteps: 24,
    /** Bounded repair passes when structure/tests fail after the model says done. */
    agentRepairPass: true,
    maxAgentRepairPasses: 2,
    /** Visual QA rounds per build: undefined = by complexity (trivial 1, standard 2, complex 3). */
    maxQaRounds: 2,
    qwenTools: true,
    /**
     * Per-turn generation limit — an upper bound, rarely the binding one.
     *
     * Measured on Groq: groq/compound accepts at most 8192 completion tokens,
     * while the gpt-oss models accept 65536. Either way the TOKENS-PER-MINUTE
     * window and `maxRequestTokens` below bite first, so raising this number on
     * its own changes nothing. Every model here has a 131k context window;
     * context is not what limits a turn, the rate window is.
     */
    maxTokens: 8192,
    /**
     * Ceiling on a SINGLE request (prompt + completion), independent of the
     * advertised tokens-per-minute. Router models publish the router's window,
     * not the backing model's, so this is what keeps a turn deliverable.
     */
    /*
     * Measured on Groq: every model here has a 131k context window, so context
     * is not the limit — the rate window is. The backing model behind
     * groq/compound allows ~30k tokens a minute, so a 20k request is deliverable
     * and leaves room; anything larger than the window can never succeed at all.
     */
    maxRequestTokens: 20000,
    /** Below this ceiling the system prompt carries the spec instead of skill bodies. */
    leanBelowRequestTokens: 26000,
  },
  skills: {
    roots: ['skills'],
    /** The model picks up to this many; runtime-required skills are added on top. */
    maxSkillsPerTask: 8,
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
    /** Optional explicit browser executable (else Chrome/Edge/Chromium are auto-detected; ARTISAN_BROWSER env also works). */
    browserPath: process.env.ARTISAN_BROWSER || undefined,
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
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Canonical provider ids: 'openai-compatible', 'openaiCompatible' and 'ollama'
 *  all appear in the wild (env vars, CLI flags, older config files). */
export function normalizeProviderId(id) {
  const key = String(id ?? '').trim().toLowerCase().replace(/[-_]/g, '');
  if (key === 'ollama' || key === 'local') return 'ollama';
  if (key === 'openaicompatible' || key === 'openai' || key === 'api') return 'openai-compatible';
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
  // Reasoning effort belongs to the provider that sends it, not to the runtime:
  // it was parsed into runtime.reasoningEffort, where nothing ever read it.
  if (env.REASONING_EFFORT) { patch.runtime.reasoningEffort = env.REASONING_EFFORT; apiPatch({ reasoningEffort: env.REASONING_EFFORT }); }
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