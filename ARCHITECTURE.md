# Artisan — architecture

One agent, one conversation. You talk about a frontend idea, the agent discusses and remembers the decisions, and when you say **"build it"** it implements the agreed design inside your workspace, renders it in a headless browser, critiques it, iterates, tests, and reports. Then the same conversation continues.

```
TALK → DISCUSS → REFINE → AGREE → "build it" → EXECUTE → VISUAL QA → ITERATE → TEST → DONE → TALK AGAIN
```

## Runtime path (what actually runs)

`bin/artisan.mjs` → `src/terminal/cli.mjs` → `src/terminal/chat.mjs` (REPL) → `src/runtime/interactive.mjs#executeTurn` → `src/runtime/conversation.mjs#converse`

## A brief is an instruction

You should not have to ask twice. A message that (a) asks for something to exist, (b) names a buildable object and (c) carries real direction **executes immediately** — no "build it" required (`triggers.mjs#isBuildBrief`). A bare wish ("I want a landing page") still gets a question, exploration ("what if…", "maybe…") never builds, and once a build exists a new brief is discussed rather than silently overwriting the live design.

## The taste layer

`design/art-direction.mjs` turns a brief into ONE specific identity before any markup: substrate, type pairing, palette, hero composition, decoration budget, signature move and a justified risk. Eight named identities (Midnight Editorial, Cinema Noir, Archival Technical, Atelier Quiet, Press Brutal, Instrument Precision, Kinetic Syne, Library Serif), each with real Google Fonts, a contrast-checked palette and its own composition. Rules it enforces:

- No commodity identity face (Inter/Roboto/Open Sans/Lato/Arial) and no centred-stack hero with two pill buttons — neither exists in the table.
- Muted and faint text are raised until they clear 4.5:1 against the background **and every raised surface**; nothing readable ships below 12.8px.
- Decoration has a budget of two layers, each named; rejections remove layers; a WebGL canvas is only earned when 3D is actually wanted (one canvas, DPR ≤ 1.75, paused offscreen, hidden below 60rem, CSS fallback).
- Negation is respected everywhere: "no dark mode" cannot select a dark identity, and the rendered context block's own `REJECTED:` lines count as avoid-signal, never as wants.
- The identity is recorded on first build and reused for every refinement, so "do it" never swaps a dark editorial page for a light archival one.

`design/copy.mjs` writes the words. Copy is composed from the brand (taken from the brief when stated, coined deterministically otherwise), a domain lexicon (real nouns, actors, artifacts, figures), a domain family (`tech` = a system you operate, `craft` = a practice you experience) and the identity's voice (editorial | severe | technical | warm | direct). The specificity test is enforced by test: no "Everything you need", no "Powerful yet simple", no lorem.

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
The model-free design engine builds from the same taste layer: it chooses an art direction, applies it to the tokens, composes the hero with that identity's composition, writes domain-specific copy, renders in the real browser, then runs a **mechanical repair pass** — every measured defect (an element wider than the viewport, text under 4.5:1, a reveal stuck at opacity 0, sub-14px body text, prose past 85ch, tap targets under 44px) has one correct fix, applied by selector and re-rendered (`verify/visual-qa.mjs#deterministicRepairCss`). It labels itself `deterministic`, and design-level weaknesses it cannot fix are reported, not hidden.

Reveals are fail-safe by construction: `[data-reveal]` is hidden only under `html[data-js]`, which an inline head script sets, so a broken script can never leave the page blank — and a 1.2s safety net reveals anything the observer missed.

## Brief coverage: delivered, not just correct

A page can pass every structural, contrast and responsive check and still be the wrong page, because the brief asked for "the mechanism in three moves, a specification table, one quote and a single closing action" and the build shipped three of the four. `verify/requirements.mjs` turns the brief's own nouns into requirements and checks each against the **rendered DOM**: a spec table needs a real `<table>` or `<dl>`, a quote needs a `<blockquote>`, a stepped explanation needs an `<ol>` or a matching heading. A missing requirement is a `major` finding and **forces another iteration**, whatever the score says.

The same pass measures copy on the rendered page: filler phrases ("everything you need", "supercharge"), stock action labels ("Get Started", "Request a Demo") and a page too thin to answer the brief. The model critique is handed the requirement list and the visible copy, with the specificity test spelled out.

## Metered providers

`models.openaiCompatible` reads the standard `x-ratelimit-*` headers, so the router paces against the provider's real token window instead of discovering it with a 429 (`awaitBudget` waits only for the shortfall to refill, not a whole minute). Rate limits are retried up to `runtime.providerAttempts` (4) with the server's own suggested delay, because on a metered endpoint a 429 is the expected signal, not a failure.

Below `runtime.tightContextBelowTpm` (12k tokens/minute) the executor switches to a lean shape, and the governing rule is that **every call must be small enough that several fit inside one window**. A single call sized at 60% of the minute cannot be retried, and one failure drops the whole build to the deterministic builder — so the budget is spent per call, not per phase:

| Call | Prompt | Output | Lean measure |
|---|---|---|---|
| skill selection | shortlist of 24 catalogue lines, not all 57 | 700 | the retriever pre-scores; the model still chooses |
| planning | spec only, skills trimmed to 2.6k chars | 1500 | TODOs are derived from the returned spec |
| implementation turn | spec + art direction, no skill bodies; history 12% of the window | 28% of the window (max 2200) | skills inform planning only |
| critique | measured digest + requirements | 700 | |

The plan call asks for the design spec **alone** on a metered tier. Asking for spec *and* TODOs in one JSON object needed 3.2k output tokens, which exhausted an 8k/minute bucket and threw `no provider produced text for "plan"` — so the model’s design thinking was lost to a budget error, not a reasoning one. Deriving the TODOs from the spec in code costs nothing and cannot truncate.

If the implementation loop ends without a done signal — a provider failure, an exhausted step budget — visual QA and the tests still run on whatever was written. A broken run reports a rendered verdict, not silence.

## Skills
`skills/*/SKILL.md` (57, ~29k tokens if they were all dumped — they are not). Discovery = catalogue lines (id, category, description, ~1.4k tokens; narrowed to the top 24 candidates on a metered tier). Selection = model choice validated by the runtime + required skills implied by the tech tier and the brief + always-include policy. Loading = full bodies into the implementation prompt within `runtime.skillBudgetTokens` (22k). `read_skill` loads more on demand. `run.skills.loaded` / `state.skillsUsed` list only what was actually injected or read.

The taste layer is **mandatory** for any non-trivial page: `art-direction`, `color-systems`, `type-pairing`, `anti-slop`, `visual-design`, plus `hero-composition`, `landing-narrative` and `copywriting` for page-like work, `micro-typography` and `materiality` for complex work, `scroll-choreography` when motion is scroll-linked, `performance-budget` when a canvas or GSAP is in play, `svg-craft` when custom vector work is asked for, `design-review` on refinements.

Eleven skills were added for this (each ~870 tokens, concrete values not platitudes): `art-direction`, `type-pairing`, `color-systems`, `micro-typography`, `materiality`, `copywriting`, `landing-narrative`, `hero-composition`, `svg-craft`, `scroll-choreography`, `performance-budget`.

## Providers (`model/`)
`router.mjs` chains Ollama → OpenAI-compatible → deterministic. `hasLiveModel()` decides between live conversation/execution and the deterministic engine. `supportsVision()` (model-name inference or `models.<provider>.vision: true`) decides whether screenshots are sent to the critique. Discussion and execution use `liveOnly: true` so the heuristic engine never impersonates a model.

## Configuration
`.forge/config.json` / `artisan.config.json` / `ARTISAN_*` env. Notable keys: `runtime.maxAgentSteps` (24), `runtime.maxQaRounds` (by complexity), `runtime.skillBudgetTokens`, `verification.minQualityScore` (78), `verification.browserPath` / `ARTISAN_BROWSER`, `verification.runVisual`.

## Tests
- `npm test` — unit: context/triggers/TODOs, art direction + copy (identity completeness, contrast on every surface, one-h1/one-CTA hero markup, no-filler copy across 7 domains × 5 voices, brief-is-an-instruction), visual-QA findings, real browser render (skips if no browser), design engine.
- `npm run test:flow` — the required end-to-end conversation against a scripted model (`tests/helpers/mock-model.mjs`): greeting, capability question, five discussion turns with context accumulation, refusal of "build it" without context, "go build it" through skills → spec → TODOs → implementation → real browser QA (a deliberate mobile overflow is caught and fixed in a second round) → tests → completion, then "Make the hero more immersive." (discussed, no writes) and "Do it." (in-place refinement).
- `tests/agent/terminal-flow.test.mjs` — the same session through the actual REPL.
- `npm run test:agent` — a live run against Ollama (skips without a model).
