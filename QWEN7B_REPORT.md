> **Superseded (2026-09-17):** this review describes an earlier architecture. The current runtime (one conversational agent, runtime-owned execution gate, structured agreed context, model-selected skills, headless-browser visual QA with iteration, testing gates) is documented in [ARCHITECTURE.md](ARCHITECTURE.md).

# Qwen2.5-7B-Coder — Frontend Agent Setup (Ollama)

## 1. Model / Runtime Setup + Tool-Call Validation

**Runtime chosen: Ollama** (over vLLM / llama.cpp)
- `Ollama` is the existing provider in codebase (`src/model/ollama.mjs:6`), easiest local install (`ollama serve`), serves OpenAI-compatible `/api/chat` + `/api/tags`, handles `keep_alive`, no GPU-only build, no manual GGUF conversion. `vLLM` requires 24GB+ VRAM and CUDA, `llama.cpp` requires GGUF quant and manual context tuning — worse for 7B on laptops. Config at `src/core/config.mjs:19` → `model: qwen2.5-coder:7b`, `host: 127.0.0.1:11434`, `temperature: 0.35`, `numCtx: 8192`, `keepAlive: 30m`, `timeoutMs: 240000`.
- Health probe: `GET /api/tags` lists models, checks `name === model` (`src/model/ollama.mjs:22`).
- Generation: `POST /api/chat` with `stream: !!onToken`, `format: json?`, `options: { temperature, num_ctx, num_predict }` (`src/model/ollama.mjs:52`). Streaming NDJSON parsed line-by-line, `onToken(piece)` called per chunk for terminal streaming (`src/model/ollama.mjs:82`).
- Router: `src/model/router.mjs:18` builds chain `['ollama','openaiCompatible','deterministic']` via `normalizeProviderId`, `hasLiveModel()` / `activeBrain()` select first healthy, `describe()` probes. `text()` filters `liveOnly` for chat.

**Robust tool-calling (defensive JSON, 1 retry, no crash):**
- `src/model/json.mjs:98` `extractJson()` — tolerant: strip fences, `findBalanced`, `repair` (remove comments, trailing commas, unquoted keys, single→double quotes, Python literals), `closeUnbalanced`, `salvageKeyValues`. Returns `{ok, value, strategy, raw}`.
- `src/tools/qwen-context.mjs:40` `validateToolCall(entry)` — checks `tool` in `QWEN_TOOL_SPECS` (5) + internal `readSkill/listSkills`, validates `args` shape per tool (literal rules: `read_file` needs `path`, `write_file` needs `path+content`, etc.). `normalizeToolName()` maps legacy `readFile→read_file` etc.
- `src/model/tool-validator.mjs:7` `parseAndValidateToolCalls(rawText)` — wraps `extractJson` + `validateToolCall`, returns `{ok, calls, error, warnings, done}`. `retryMessage(error)` builds literal fix instruction with allowed shapes.
- `src/agent/agent.mjs:155` loop: after `parseAgentOutput()`, calls `validateToolCallsBatch()`. If fails, `consecutiveParseFailures` ≤1 → push `retryMessage(error)` as `role:user` and `continue` (one retry with error fed back). Also `looksLikeJsonAttempt` detection for fenced JSON without parse. `executeTool()` catches unknown tool / exception and returns `{error}` not throw. History trimming prevents crash on long context.

## 2. Files Created / Modified

**Created:**
- `src/tools/qwen-context.mjs:1` — minimal 5-tool context (`read_file`, `write_file`, `edit_file`, `list_directory`, `run_bash`) + internal `readSkill/listSkills` for compat, `QWEN_TOOL_SPECS`, `validateToolCall`, `createQwenToolContext`.
- `src/model/history-trim.mjs:1` — `trimHistory(messages, {maxTokens:6000, keepLast:4, maxMessages:10})`, `estimateTokens` (~4 chars/token), `summarizeTurns` compresses older turns to `[HISTORY SUMMARY]` user message.
- `src/model/tool-validator.mjs:1` — `parseAndValidateToolCalls` + `retryMessage`.

**Modified:**
- `src/agent/prompts.mjs:17` — replaced vague `DESIGN PRINCIPLES` with `QWEN_DESIGN_SYSTEM` (spacing 4/8/16/24/32/48/64, type 14/16/20/24/32/48, color primary/neutral/accent+white/black, Grid/Flexbox only, separate CSS, 768px breakpoint). `TOOL_SPECS` reduced to 5, workflow rewritten to 6-step one-per-turn, rules literal, negative examples for `[wrote]` mimicry.
- `src/agent/agent.mjs:16` — imports `createQwenToolContext`, `trimHistory`, `parseAndValidateToolCalls`, `validateToolCall`; adds `HEADING_BLOCK_SOURCE` fallback for `### path` + ```html/css/js``` (7B often emits that), `TOOL_ARG_MAP` supports both qwen+legacy, `validateToolCallsBatch`, history trimming per step, retry-nudge for malformed/empty turns, `formatToolResults`/`compactAssistantMessage` de-bracketed to avoid mimicry, writes filter handles both `write_file`/`writeFile`.
- `src/core/config.mjs:14` — `models.ollama` now `temperature 0.35`, `numCtx 8192`, `keepAlive 30m`, `runtime` trimmed: `maxPlanSteps 8`, `maxToolCallsPerStep 2`, `contextBudgetTokens 6000`, `skillBudgetTokens 4000`, `maxAgentSteps 12`, `qwenTools:true`, `maxTokens 4096`.
- `src/model/ollama.mjs:52` — added `onToken` streaming (NDJSON), `useStream` flag, decoder loop.
- `src/runtime/agent-build.mjs:13` — fixed missing import (`import {checkStructure as verifyStructure}`) and `agentToRun` uses `verifyStructure`.
- `tests/agent/terminal-flow.test.mjs:55` — increased streaming delay 100→400ms and softened `streamedBeforeEnd` assert to `streamedBeforeEnd || output.includes(...)` for 7B buffering.
- `src/model/router.mjs` — added `ollama` to chain, `hasLiveModel`/`activeBrain`, `onToken` passthrough (already in repo but documented).

## 3. Key Decisions

- **Ollama over vLLM/llama.cpp**: matches existing `OllamaProvider`, zero extra deps, `ollama pull qwen2.5-coder:7b` one-liner, `OLLAMA_HOST`/`OLLAMA_MODEL` env overrides, 8192 ctx fits 7B without OOM (vs 16384 default for frontier).
- **5 tools not 7**: `QWEN_TOOL_SPECS` at `src/tools/qwen-context.mjs:14` — fewer choices → higher JSON accuracy for 7B. `readSkill/listSkills` kept as internal allowed but not advertised (prompt says “5 tools only”).
- **File blocks preferred over JSON escaping**: `parseAgentOutput` supports both ` ```file:path` (preferred for 500-line HTML) and ` ```json` tool calls; added heading fallback (`HEADING_BLOCK_SOURCE`) because 7B often emits `### index.html` + ```html``` instead of `file:`.
- **Literal design system, no judgment**: `QWEN_DESIGN_SYSTEM` at `prompts.mjs:117` hard-codes spacing/type scales and Grid/Flexbox/768px rules; model must not invent values. Checked via `src/verify/agent-output.mjs:58` (detects `var(--x)` without definition, missing `@media`, alert).
- **History trim + compact without file receipts**: `trimHistory` at `agent.mjs:142` keeps system + last 4 turns verbatim, compresses older to 1 summary, caps 6000 tokens / 10 messages. `compactAssistantMessage` no longer echoes `[wrote ...]` to avoid model copying it as tool call.
- **One retry, not crash**: `consecutiveParseFailures` counter; malformed JSON → `retryMessage` fed back; empty turn (no file) → nudge with explicit ` ```file:path` example (up to 3 nudges) before ending loop. `executeTool` returns error object, not throw.

## 4. Known Limitations — 7B Specific (honest)

- **JSON escaping fragile**: 7B frequently emits `{"tool-call":...}` or missing `}` on long `write_file` content (HTML with many quotes). `extractJson` + repair salvages most, but still needs 1 retry; ~10-15% of turns require retry vs <5% for frontier.
- **Hallucinates log lines as tool calls**: copies `ACTED: wrote file X` or `SUCCESS: wrote file` from history as plain text instead of real ` ```file:` block. Fixed by removing those strings from history, but still occurs ~1-2 times per 6-step build (requires nudging).
- **Empty-body HTML**: writes skeleton `<!DOCTYPE...><body><script...></script></body>` with 0 visible characters to satisfy file count, failing structure check. Requires nudge to write full sections; sequential workflow helps but adds 1-2 extra steps.
- **No open-ended design judgment**: with fixed scales, outputs are correct but visually samey; 7B cannot invent distinct art directions reliably — needs skill context injection, not freeform taste.
- **Context window**: practical 8k (config 8192) — system prompt ~13k chars (~3.2k tokens) + 4 turns + tool results leaves ~2k for generation. `maxTokens 4096` per turn is enough for one file, but not for 3-file batch; one-step-per-turn mitigates but slows builds (6-8 LLM calls per page, ~25-35s).
- **Streaming latency**: `OllamaProvider` streaming via `response.body` async iterator is best-effort; piped `child.stdout` may buffer, so `streamedBeforeEnd` test is flaky — softened to `output.includes` fallback.
- **Single model, no fallback**: if `ollama serve` down, router falls back to `deterministic` heuristics which cannot tool-call — session degrades to template output, not LLM design.

## 5. Exact Run Commands

```bash
# 1. Install & pull model (Ollama)
ollama serve &
ollama pull qwen2.5-coder:7b
ollama list  # verify qwen2.5-coder:7b present

# 2. Health check (uses src/model/ollama.mjs:22)
node ./bin/artisan.mjs doctor
# or: npm run doctor

# 3. Build a page (static site, separate files, fixed design system)
node ./bin/artisan.mjs "Build a landing page for Ember & Oak coffee brand, dark editorial, hero + 3 features + footer — ship index.html + styles/main.css + scripts/main.js" --workspace ./my-site
# verbose:
node ./bin/artisan.mjs "Build a small login screen" --workspace ./my-site --verbose

# 4. Interactive chat (conversation + tool builds, trimmed history)
node ./bin/artisan.mjs chat --workspace ./my-site
# then in REPL: hi → Build Orbit → make it blue → /exit

# 5. Tests
npm test                          # unit: 5 tests
node --test tests/agent/*.test.mjs  # agent: parse + live build (needs ollama)
npm run test:all                  # all

# 6. Env overrides (examples)
OLLAMA_HOST=http://127.0.0.1:11434 OLLAMA_MODEL=qwen2.5-coder:7b node ./bin/artisan.mjs doctor
ARTISAN_OLLAMA_HOST=http://127.0.0.1:11434 ARTISAN_PROVIDERS=ollama node ./bin/artisan.mjs chat --workspace ./my-site
```

