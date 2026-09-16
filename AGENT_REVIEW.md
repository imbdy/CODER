# Artisan Design Agent — Review

A review of the four things you asked about: **sys_prompt**, **agent calling tools**, **agent using skills**, **agent logic thinking** — plus the model, the skills that were added, and how to use it.

---

## 1. What was actually wrong

The project had **two brains**, and the good one was never plugged in.

| Piece | State before | Consequence |
|---|---|---|
| `src/runtime/session.mjs` → `runTask()` | Deterministic pipeline. The LLM was only asked for JSON (`understand`, `plan`, `direction`, `copy`). Files were produced by templates (`emit-site.mjs`, `emit-css.mjs`). | "Only HTML" — the emitter is HTML-first and can never emit JSX/Next.js. |
| `src/agent/agent.mjs` → `runAgent()` | The real LLM tool-calling loop. **Imported by nothing except a test.** | "The agent doesn't call tools." |
| `src/agent/prompts.mjs` → `buildAgentSystemPrompt()` | A correct prompt, reachable only from the dead `runAgent`. | "sys_prompt does nothing." |
| `router.systemFor('code')` | A second, competing agent prompt that `runTask` never requests. | Two sources of truth for the prompt. |
| `--brain <id>` | Parsed by the CLI, then **silently dropped** by `loadConfig()`. | You could not force a model. |
| `config.envOverrides()` | Wrote `models['openai-compatible']` (kebab) while the router read `models.openaiCompatible` (camel). | The API provider was silently dead. |
| Skill usage | Skills were retrieved, truncated into one `copy` call, then mentioned in an HTML comment. | "The agent doesn't use the skills." |
| `agent.executeTool()` | Called tools as `fn(args)` while the tool context expects positional args (`writeFile(rel, content)`). | Even a live agent would have written a file named `[object Object]`. |

`.forge/memory.json` confirms the symptom: every recorded run lists `"files": ["index.html"]`.

## 2. sys_prompt — what changed

`src/agent/prompts.mjs` is now the single source of truth, and it is stack-aware.

- **Stack decision block**, computed from the workspace inspection:
  - `next` in deps → `app/layout.jsx` + `app/page.jsx` + `app/globals.css` + `components/*.jsx`; `"use client"` only where hooks are used.
  - `react` in deps → `src/main.jsx` + `src/App.jsx` + `src/components/*.jsx` + `src/styles.css`.
  - Vue / Svelte / Astro → framework idioms.
  - **Empty or static → `index.html` + `styles/main.css` + `scripts/main.js` is mandatory**, with the `<link>` and `<script type="module">` tags spelled out. "NEVER write index.html alone. NEVER inline the whole stylesheet."
- **Working method**: THINK → READ SKILLS → INSPECT → PLAN → BUILD → VERIFY → DONE.
- **Quality bar**: real copy, semantic HTML, one `h1`, `:focus-visible`, mobile-first, `prefers-reduced-motion`, one focal point, anti-slop constraints.
- **Existing-project awareness**: kind, framework, build tool, styling, TypeScript, libraries, existing sections, accent colour, palette.

## 3. agent calling tools — what changed

- `runAgent()` is now wired into the chat runtime through a new module, `src/runtime/agent-build.mjs` (`runBuild`), used by both build paths in `src/runtime/interactive.mjs`. `runTask` stays as the automatic fallback when no live model is reachable, so a session never dead-ends.
- **Two write protocols**, because a 7B model cannot reliably JSON-escape a 500-line HTML string:
  1. ` ```file:styles/main.css ... ``` ` fenced blocks — preferred, raw body, no escaping;
  2. ` ```json [{"tool": ...}] ``` ` for everything else (`readFile`, `patchFile`, `readSkill`, `exec`, `done`).
- **Tolerant parsing**: `extractJson` repair chain, single-object responses wrapped into arrays, `args`/`arguments` and `tool`/`name` aliases accepted, and fences anchored to line starts so a *closing* fence cannot swallow the next block (a real bug caught while testing).
- **Argument adapter** (`TOOL_ARG_MAP`) maps named args onto the positional tool signatures — the `[object Object]` fix.
- **`exec` is awaited** (it returns a promise).
- **Context compaction**: an assistant turn is stored as `think + [wrote x.html — 24 KB]` instead of the file body, so a multi-file build fits inside `num_ctx: 16384`.
- Every call emits the normal bus events (`tool.call`, `file.write`, `skills.retrieved`, `thought`), which the chat now prints as `[tool]`, `[edit]`, `[skill]`, `[brain]`.

## 4. agent using skills — what changed

- Two new tools: **`readSkill(id)`** and **`listSkills()`** (`src/tools/context.mjs`), backed by the skill registry.
- The prompt now carries a **skill catalogue** (id + category + description for all 45 skills) and instructs the agent to `readSkill` the 2–3 most relevant ones *before* writing code, then name them in its `done` summary.
- Retrieved skill bodies still arrive automatically (token-budgeted by `retriever`), so skills are both **pushed** and **pull-able**.
- Retrieval was extended (priors + dependency edges) so the new architecture/token skills are actually selected.
- The run result reports `skillsRead`, so you can see in the test report which skills the model chose to open.

## 5. agent logic thinking — what changed

- Thinking is a real model step now: each turn opens with a THINK paragraph, emitted on the bus as `thought` and printed in chat as `[inspect] …`.
- The loop is bounded and observable: `maxSteps` (`runtime.maxAgentSteps`, default 15), a full `transcript` (think → tool calls → results), `stepCount`, `ms`, and a status of `done` / `needs-fix` / `empty`.
- A prose-only turn ends the loop instead of spinning forever; failures are recorded in the transcript.
- A deterministic **structure check** (`src/verify/agent-output.mjs`) validates what the agent produced: if `index.html` links `styles/main.css`, that file must exist, and CSS/JS files must exist — exactly the failure mode you reported.
- **One bounded repair turn**: when the agent declares `done`, the check runs; if it finds structural problems or sloppy signals (undefined CSS variables, `alert()`, no `prefers-reduced-motion` block, no responsive `@media`), the findings are handed straight back to the model as a `VERIFY` message and it gets exactly one more turn to fix them before the run is accepted. Disable with `runtime.agentRepairPass: false`. This is the same verify → fix loop the deterministic pipeline uses, applied to the agent.

## 6. Model — qwen2.5-coder:7b

- Default brain is **`qwen2.5-coder:7b` via Ollama**: `models.order: ['ollama', 'openaiCompatible', 'deterministic']`.
- `--brain ollama` / `--brain deterministic` now actually work, and provider ids are normalised (kebab `openai-compatible` and camel `openaiCompatible` both resolve).
- New env overrides: `ARTISAN_OLLAMA_MODEL`, `ARTISAN_OLLAMA_HOST`.
- The agent loop only runs when `router.hasLiveModel()` is true; otherwise the deterministic engine takes over and the chat says so (`[brain] no live model — deterministic engine`).

## 7. Skills added

| Skill | Why it exists |
|---|---|
| `skills/project-architecture/SKILL.md` | The file-layout law per stack (static / React / Next.js). This is the direct fix for "one giant HTML file". |
| `skills/design-tokens/SKILL.md` | A real `:root` token system (space, type, colour, radius, shadow, motion) so output stops drifting into magic numbers. |
| `skills/forms-and-states/SKILL.md` | Field anatomy, validation timing, and the loading/empty/error/disabled states — the paths that are usually skipped. |

45 skills now load, and retrieval was extended so the new ones are actually selected (task priors + dependency edges).

## 8. How to use it

```powershell
npm run chat -- --workspace ./my-site                          # chat / think / build with the agent
npm run chat -- --workspace ./my-site --brain ollama           # force qwen2.5-coder:7b
npm run chat -- --workspace ./my-site --brain deterministic    # offline engine
npm run doctor                                                 # provider + model health
npm test                                                       # fast unit tests
npm run test:agent                                             # the live multi-file build test
```

Inside the chat: `/help`, `/status`, `/todos`. Describe the idea, refine it, then say **"Build it"**. The agent will think, read skills, write the files and report.

## 9. The test result folder

`npm run test:agent` writes a fresh timestamped folder:

```
agent-test-results/<timestamp>/
  site/             the files the agent actually built (open index.html in a browser)
  sys-prompt.txt    the exact system prompt the agent received
  transcript.md     its thinking + every tool call and result
  run.json          the raw machine-readable run
  REPORT.md         the verdict on sys_prompt / tools / skills / thinking
```

## 10. Known limits

- Design quality is bounded by a 7B local model. It reliably produces a well-structured, dark editorial landing page; complex 3D scenes still benefit from the deterministic engine's scaffolding.
- The agent self-verifies by reading files back and a deterministic structure check; it does not drive a browser. `npm run e2e` and the deterministic pipeline still own screenshot-level verification.
- A multi-file build takes one to a few minutes on a local 7B model — that is the local-model trade-off, not a bug.
- `maxAgentSteps` defaults to 15; a model that only reads skills and never writes will stop there with status `needs-fix`/`empty` rather than loop forever.