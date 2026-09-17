# Artisan

A frontend design agent that discusses an idea with you, agrees on a direction, then builds it —
writing real files, rendering them in a headless browser, critiquing what it sees, and iterating
until the page holds up.

It is not a code generator with a chat box on top. The conversation is where the design is decided;
the build is a separate, gated phase that implements what was agreed.

```
discuss → agree → plan → build → render → critique → iterate → done
```

## Install and run

Requires Node 22+ and a Chromium-based browser (Chrome or Edge) for the visual QA pass.

```bash
npm run chat                      # the design conversation (main entry)
npm run artisan -- "<brief>" --workspace ./site
npm run artisan -- doctor         # which model brains are reachable
npm run skills                    # list the loaded skill catalogue
npm run serve -- ./site           # preview a build at localhost:4173
```

### Connecting a model

Artisan runs on any OpenAI-compatible endpoint, on a local Ollama model, or with no model at all.

Put your credentials in a `.env` file in the project root — copy `.env.example` and fill it in:

```ini
MODEL_API_KEY=sk-...
MODEL_NAME=muse-spark-1.2-contributor-free
MODEL_BASE_URL=https://opencode.ai/zen/v1
```

`.env` is gitignored. It is read at startup with no dependency, and **a variable already exported in
your shell always wins**, so you can override any single value for one command:

```bash
MODEL_NAME=deepseek-v4-flash-free npm run artisan -- "<brief>" --workspace ./site
```

Exporting instead of using the file works too:

```bash
export ARTISAN_API_KEY=...        # a gsk_ key selects Groq's base URL automatically
export ARTISAN_MODEL=groq/compound
```

| Variable | Meaning |
|---|---|
| `ARTISAN_API_KEY` | API key. A `gsk_` prefix points the base URL at Groq. |
| `ARTISAN_BASE_URL` | Override the endpoint for any other OpenAI-compatible provider. |
| `ARTISAN_MODEL` | Model id. |
| `REASONING_EFFORT` | `low` / `medium` / `high`. Reasoning models default to `low` so a small token window buys an answer rather than deliberation. |
| `ARTISAN_PROVIDERS` | Provider order, e.g. `openai-compatible,ollama,deterministic`. |
| `OLLAMA_HOST`, `ARTISAN_OLLAMA_MODEL` | Local brain. |
| `ARTISAN_BROWSER` | Explicit browser binary if auto-detection misses. |

Per-project settings live in `.forge/config.json` inside the workspace you are building, and
override the defaults.

### Token budget — the thing that decides output size

Two separate limits matter, and they are often confused:

- **Tokens per minute (TPM)** — how much you may spend in a rolling minute. It decides how many turns
  the agent gets, not how big one turn can be.
- **The per-request ceiling** — how large a single prompt-plus-completion may be. `maxRequestTokens`
  (default 12000) caps this on its own, because a **router model advertises the router's window, not
  the backing model's**. `groq/compound` reports 70,000 TPM and then dispatches to a smaller model;
  sizing turns from the header alone produced requests that were rejected on arrival.

Measured on Groq's free tier: `groq/compound` 70,000 TPM (routes to other models, 200k tokens/day),
`openai/gpt-oss-20b`, `openai/gpt-oss-120b` and `qwen/qwen3.8-27b` 8,000 TPM each.

The agent sizes each turn from the ceiling, measures its own system prompt, and gives the larger
share of what remains to the answer — a turn that cannot finish a file wastes the whole request. A
bigger window buys **more turns per minute**, which is where the throughput actually comes from.

## The two engines

Artisan always produces something. Which engine answers depends on what is reachable:

- **Agent (the real path).** A live model runs the implementation loop: it reads and writes files
  through a tool protocol, marks off structured TODOs, calls for a browser render whenever it wants
  one, and reacts to the critique it gets back.
- **Deterministic (the floor).** A model-free design engine composes the page from an art direction,
  a section plan and a token system. Fully reproducible, always available, and the fallback when no
  model is reachable. Force it with `--brain deterministic`.

Every run records which engine produced it, so nothing can be mistaken for model output that was not.

## How a build is decided

**Art direction before markup.** One identity is chosen up front — substrate, type voice, palette
temperature, compositional bias, and a signature move — and every later decision is checked against
it. This is what stops each build collapsing into the same centred hero.

**The brief is split into what it wants and what it rules out.** "Absolutely no AI-SaaS look, no
purple, no glass" is a set of rejections, not a request. Rejections steer domain detection, accent
choice, section planning and the emitted CSS, so a brief that rejects glass does not get a frosted
nav.

**The page plan follows the brief's own structure.** A brief that enumerates its sections gets those
sections and not the template's defaults — pricing and FAQ are dropped when nothing asked for them.

**Skills carry the expertise.** `skills/` holds a catalogue of design and engineering practice
(typography, colour systems, motion, WebGL, scroll choreography, accessibility, anti-slop). The model
selects what a task needs; the runtime loads the bodies into the planning prompt, and the agent can
pull more on demand with `read_skill`.

## Ambition register

Most briefs want restraint, and restraint is the default: a decoration budget, the cheapest
technology tier that delivers the design, no canvas unless it earns one.

A brief that asks for **cinematic, immersive, spatial or scroll-driven** work switches register. The
budgets lift and the bar gets harder rather than softer: the page must be one continuous experience
driven by a single scroll progress value, the canvas must have a nameable subject, depth must be
earned with two light sources of different colour temperature and a generated environment map, and a
coarse pointer or `prefers-reduced-motion` gets a designed composition rather than a blank frame.

In that register the runtime forces the journey skills to load (`webgl-scroll-journey`, `threejs`,
`shaders`, `3d-performance`, `scroll-choreography`) and the deterministic engine emits a real
scroll-driven scene: one instanced structure the camera studies, lit by a generated environment,
with an additive depth field and adaptive quality that degrades in ordered steps.

Three spheres drifting on a gradient is the canvas form of three identical cards, and the engine
treats it as the same failure.

## Verification

A build is not done when the model says so. Before `done` is accepted the runtime:

- renders the page in a real headless browser at 1440, 834 and 390,
- measures the live DOM — contrast ratios, paragraph measure, overflow, font sizes, tap targets,
  card repetition, gradients, motion, console errors,
- checks the brief's own requirements against what rendered (a brief that asked for a specification
  table and a quote fails if the page shipped only one),
- and feeds the findings back as work to do.

The model critique scores five weighted categories rather than one blended number — typography 25%,
composition 25%, motion 20%, colour 15%, craft 15% — because a page can average its way to a pass
while its typography never had an idea. Any category below 7/10 fails the round and is named as the
weakness to fix.

## Layout

```
bin/artisan.mjs        CLI entry
src/agent/             the implementation loop and its prompts
src/runtime/           conversation, session, state machine, agreed context, TODOs
src/model/             provider chain, routing, rate-limit pacing, JSON repair
src/design/            art direction, tokens, colour, composition, HTML and CSS emitters
src/verify/            headless browser, measured metrics, visual QA, brief coverage
src/skills/            skill registry, retrieval and selection
src/workspace/         inspection, file writes, memory
skills/                the skill catalogue (markdown with frontmatter)
examples/              a reference build with its screenshots
```

## What it is not

It does not scaffold from a template, and it does not treat "it renders without errors" as finished.
It also will not invent a project: ask it to build with nothing agreed and it will say so rather than
guess.
