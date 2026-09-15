---
name: frontend-design-master
category: orchestration
priority: medium
frameworks: [react, vite, next]
libraries: []
triggers: [design master, orchestrate, design system, intelligence, workflow]
description: Master orchestration — 12-step workflow (understand→identify→retrieve→preferences→generate→tech→inspect→implement→run→review→fix→report).
---

# Frontend Design Master — Intelligence Orchestration

This is the master skill that orchestrates all others. It determines **what** to build before **how**.

## 12-Step Workflow (spec §15)

```
1. Understand request (user idea → intent, not just keywords)
2. Identify product/category (lookup .agent/intelligence/design/product-types)
3. Identify visual/emotional direction (audience, platform, emotion, references)
4. Retrieve relevant design knowledge (5-parallel: product→style/color/typography/pattern, plus UX/anti-patterns, via retrieval.py)
5. Check personal design language (.agent/preferences/design-language.md)
6. Generate design strategy (design_system.py → structured JSON: visual/layout/colors/typography/motion/interaction/tech/a11y/perf/anti_patterns)
7. Choose implementation technologies (tech.py decision engine — smallest appropriate)
8. Inspect existing project (list_files, read_file, search)
9. Implement (reusable primitives, staged retrieval — only inject relevant knowledge)
10. Run application/tests (run_command, build)
11. Review implementation (review.py checklist, anti_slop.py scoring)
12. Fix issues (highest-impact first) → Report result
```

## Skill Selection (staged retrieval)

Do NOT load every skill. Select via loader:

```
"Build animated landing" → visual-design + layout + typography + patterns + motion + performance + a11y
If request contains 3D → + threejs + r3f + drei + 3d-performance
If scroll storytelling → + storytelling + scroll + gsap
If dashboard → + ui-ux + shadcn-ui + density
If generic → + anti-slop + design-review
```

Heuristic: query tokens → product classification → style/color/pattern/typography via reasoning rules.

## Design System Stage

Before code, generate:

```json
{
  "visual_direction": {"product_type": "developer-tool", "style": "dark-mode-oled", "emotion": "premium"},
  "layout": {"pattern": "dashboard-command", "grid": "12-col"},
  "colors": {"palette": "ink-amber", "system": "60-30-10"},
  "typography": {"pairing": "space-grotesk/inter"},
  "motion": {"language": "spring 340/26"},
  "technology": {"stack": "React+Tailwind+Motion"},
  "accessibility": {"requirements": ["contrast 4.5:1"]},
  "anti_patterns": ["purple-pink-gradient", "default-bento"]
}
```

Inject **markdown** (1200 chars) + top 3 skills (4500 chars) + prefs (1200) — total <7k, lean for 7B.

## Creative Intelligence

If request open-ended (e.g., "make hero more impressive"), propose 2-3 directions via `creative.py`:

- Direction A: Spatial Operating System
- Direction B: Editorial Machine
- Direction C: Technical Observatory

Each with visual/layout/typography/motion/interaction/tech, then pick one.

## Anti-Slop Gate

After implement, run `anti_slop.py` scoring: if score ≥3.0 → fix top issue (e.g., remove purple gradient, replace bento with editorial split). Prefer `composition > decoration`.

## Learning

On user feedback "looks generic" → `learning.py` saves lesson: `{"problem":"generic centered hero","lesson":"editorial split beats centered stack"}`. Retrieved next time via `get_relevant_lessons(query)`.

## References

If `.agent/references/` contains `urls.md` with "like Linear", derive principles via `references.py` (typography/composition/motion) and reinterpret, not copy.

## Performance

- Retrieval: in-memory scan <500 items, <5ms, cached
- No vector DB, no heavy deps
- Only relevant knowledge injected, staged
- Cache design knowledge at startup

## Extension Points (future-ready)

- visual screenshot analysis, browser inspection, Figma, component indexing, React Bits/Aceternity/shadcn/Motion/GSAP/R3F/WebGL/shader knowledge, site analysis — all can be added as new `backend/app/intelligence/*` modules and `.agent/intelligence/*` datasets without touching AgentRunner core.

## Checklist

- [ ] Product identified?
- [ ] Design system generated and injected?
- [ ] Technology chosen is smallest appropriate?
- [ ] Existing project inspected before code?
- [ ] Build/tests run and fixed?
- [ ] Design review passed (score ≥7/10)?
- [ ] Anti-slop not violated?
- [ ] Preferences respected?
