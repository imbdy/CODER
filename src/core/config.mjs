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
    order: ['openai-compatible', 'deterministic'],
    ollama: {
      host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
      model: 'qwen2.5-coder:7b',
      temperature: 0.5,
      numCtx: 16384,
      timeoutMs: 240000,
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
    maxPlanSteps: 14,
    maxImproveIterations: 2,
    maxToolCallsPerStep: 12,
    maxRepairAttempts: 2,
    contextBudgetTokens: 24000,
    skillBudgetTokens: 9000,
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

function envOverrides() {
  const env = process.env;
  const patch = { models: {}, runtime: {}, policy: {}, verification: {}, ui: {}, skills: {} };
  if (env.ARTISAN_MODEL) patch.models['openai-compatible'] = { ...(patch.models['openai-compatible'] ?? {}), model: env.ARTISAN_MODEL };
  if (env.ARTISAN_BASE_URL) patch.models['openai-compatible'] = { ...(patch.models['openai-compatible'] ?? {}), baseUrl: env.ARTISAN_BASE_URL };
  if (env.ARTISAN_API_KEY) patch.models['openai-compatible'] = { ...(patch.models['openai-compatible'] ?? {}), apiKey: env.ARTISAN_API_KEY };
  if (env.ARTISAN_PROVIDERS) patch.models.order = parseList(env.ARTISAN_PROVIDERS);
  if (env.MODEL_NAME) patch.models['openai-compatible'] = { ...(patch.models['openai-compatible'] ?? {}), model: env.MODEL_NAME };
  if (env.MODEL_BASE_URL) patch.models['openai-compatible'] = { ...(patch.models['openai-compatible'] ?? {}), baseUrl: env.MODEL_BASE_URL };
  if (env.MODEL_API_KEY) patch.models['openai-compatible'] = { ...(patch.models['openai-compatible'] ?? {}), apiKey: env.MODEL_API_KEY };
  const hasOllama = Boolean(env.ARTISAN_OLLAMA_MODEL || env.ARTISAN_OLLAMA_HOST || env.OLLAMA_HOST);
  if (hasOllama) patch.models.order = (patch.models.order ?? ['openai-compatible', 'deterministic']).includes('ollama') ? patch.models.order : [...(patch.models.order ?? ['openai-compatible', 'deterministic']), 'ollama'];
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

export function loadConfig({ workspaceDir = process.cwd(), overrides = {}, agentRoot = undefined } = {}) {
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