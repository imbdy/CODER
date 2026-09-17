# Artisan — architecture

One agent, one conversation. You talk about a frontend idea, the agent discusses and remembers the decisions, and when you say **"build it"** it implements the agreed design inside your workspace, renders it in a headless browser, critiques it, iterates, tests, and reports. Then the same conversation continues.

```
TALK → DISCUSS → REFINE → AGREE → "build it" → EXECUTE → VISUAL QA → ITERATE → TEST → DONE → TALK AGAIN
```

## Runtime path (what actually runs)

`bin/artisan.mjs` → `src/terminal/cli.mjs` → `src/terminal/chat.mjs` (REPL) → `src/runtime/interactive.mjs#executeTurn` → `src/runtime/conversation.mjs#converse`

### Conversation turn (`conversation.mjs`)
1. Session-meta that is purely factual (`/status`, "which folder…") is answered locally.
2. With a live model: one call with the design-partner prompt (`prompts.mjs#buildConversationSystemPrompt`). The reply is streamed to the terminal; a trailing ```json control block carries `{intent, ready, missing, context}`. The runtime merges `context` into the **agreed context** (`agreed-context.mjs`). The block never reaches the user.
3. Without a live model: deterministic extraction (`extractContextHeuristically`) and an honest, labelled reply. Provider failures are surfaced with their root cause instead of being hidden.
4. **Execution gate (runtime-owned, `triggers.mjs`)**: a turn executes only if it is an explicit command ("build it", "go ahead", "do it"…) or the model declared `intent: build` *and* the message carries an execution verb. "what if / maybe / don't build yet" always stays discussion. "ok", "yes", "that's exactly what I want" never execute.
5. **Readiness gate (`contextReadiness`)**: execution needs an object (project/product/summary) plus at least one design signal; after a build it needs pending change requests. Otherwise the agent says *"I can build it, but we haven't decided what we're building yet."* and writes nothing. There is no default landing page.

### Agreed context (`agreed-context.mjs`)
A compact structured record: project, product, audience, visual direction, composition, layout, hero, typography, color, motion, 3D/depth, interaction, tech, accepted, rejected, constraints, change requests, summary, build record. It is the only thing handed from discussion to execution and it flows into: skill selection → spec/plan → implementation prompt → visual QA (e.g. "purple rejected" becomes a render check) → refinements.

### Execution (`agent/agent.mjs#runAgent`) — phases enforced by `runtime/state-machine.mjs`
| Phase | Who | What |
|---|---|---|
| UNDERSTANDING | code | mode (create/refine), task type, complexity |
| INSPECTION | code | workspace scan + outline of the existing build (`workspace/scanner.mjs`) |
| SKILL_SELECTION | model + code | model picks from the 46-skill catalogue and the tech tier (css / threejs / r3f / shader; css / vanilla / gsap); runtime validates ids, adds required skills for the chosen tech, loads bodies within a token budget, records exactly what was loaded (`skills/select.mjs`) |
| PLANNING + DESIGN_SPEC | model + code | one JSON call → design spec (hierarchy, composition, typography, color, hero, motion, depth, interaction, responsive, performance, copy) + structured TODOs; runtime validates and appends the mandatory QA/responsive tasks (`runtime/todo-manager.mjs`) |
| IMPLEMENTATION | model | tool loop: fenced `file:` blocks + JSON tools (`read_file`, `write_file`, `edit_file`, `list_directory`, `run_bash`, `list_skills`, `read_skill`, `update_todo`, `run_qa`, `done`) |
| VISUAL_QA | code + model | `verify/browser.mjs` renders the page over localhost in headless Chrome/Edge at 1440/834/390: screenshots (top + full page), measured metrics (overflow, contrast, fonts, sections, tap targets, decor, reduced-motion), console errors, failed requests. `verify/visual-qa.mjs` turns measurements into findings (blocker/major/minor) and asks the model to critique as a design director (with screenshots when the model is vision-capable, otherwise from the measured digest — and it says which). |
| ITERATION | model | findings are handed back; the model fixes; QA re-runs (bounded by complexity: 1/2/3 rounds) |
| TESTING | code | workspace-wide structure check, static checks, JS syntax (`node --check`), anti-generic flags, `npm run build` when available |
| COMPLETED | code | only after structure, QA, tests and TODO gates; otherwise `needs-fix` with the reasons |

Every build returns `run.engine` (`agent` or `deterministic`), the skills actually loaded, structured TODOs with statuses, the spec, QA rounds with scores/verdicts/screenshots, and test results. Nothing is reported that did not happen.

### Offline fallback (`runtime/session.mjs#runTask`)
The model-free design engine still produces a page from the agreed context (it honours rejected hues), runs the same browser QA, and labels itself `deterministic` in the summary. Design-level weaknesses it cannot fix are reported, not hidden.

## Skills
`skills/*/SKILL.md` (46). Discovery = catalogue lines (id, category, description). Selection = model choice validated by the runtime + required skills implied by the tech tier + always-include policy. Loading = full bodies into the implementation prompt within `runtime.skillBudgetTokens`. `read_skill` loads more on demand. `run.skills.loaded` / `state.skillsUsed` list only what was actually injected or read.

## Providers (`model/`)
`router.mjs` chains Ollama → OpenAI-compatible → deterministic. `hasLiveModel()` decides between live conversation/execution and the deterministic engine. `supportsVision()` (model-name inference or `models.<provider>.vision: true`) decides whether screenshots are sent to the critique. Discussion and execution use `liveOnly: true` so the heuristic engine never impersonates a model.

## Configuration
`.forge/config.json` / `artisan.config.json` / `ARTISAN_*` env. Notable keys: `runtime.maxAgentSteps` (24), `runtime.maxQaRounds` (by complexity), `runtime.skillBudgetTokens`, `verification.minQualityScore` (78), `verification.browserPath` / `ARTISAN_BROWSER`, `verification.runVisual`.

## Tests
- `npm test` — unit: context/triggers/TODOs, visual-QA findings, real browser render (skips if no browser), design engine.
- `npm run test:flow` — the required end-to-end conversation against a scripted model (`tests/helpers/mock-model.mjs`): greeting, capability question, five discussion turns with context accumulation, refusal of "build it" without context, "go build it" through skills → spec → TODOs → implementation → real browser QA (a deliberate mobile overflow is caught and fixed in a second round) → tests → completion, then "Make the hero more immersive." (discussed, no writes) and "Do it." (in-place refinement).
- `tests/agent/terminal-flow.test.mjs` — the same session through the actual REPL.
- `npm run test:agent` — a live run against Ollama (skips without a model).
