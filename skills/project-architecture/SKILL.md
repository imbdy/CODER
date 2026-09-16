---
name: project-architecture
category: implementation
priority: high
frameworks: [next, react, vite]
libraries: []
triggers: [project structure, file structure, scaffold, architecture, split files, separate files, html css js, multi-file, project setup, next.js app router, folder structure, file layout]
description: Mandatory file layouts per stack — the difference between one HTML blob and a real, maintainable project.
---

# Project Architecture — File Layouts

One giant `index.html` with everything inline is a prototype, not a deliverable. Pick the layout for the detected stack and follow it exactly.

## Decision Table

| Workspace | Write |
|---|---|
| Next.js (next in deps) | `app/layout.jsx` + `app/page.jsx` + `app/globals.css` + `components/*.jsx` |
| React (react in deps, no next) | `src/main.jsx` + `src/App.jsx` + `src/components/*.jsx` + `src/styles.css` |
| Vue / Svelte / Astro | one component file per component, framework idioms, scoped styles |
| Empty or static | `index.html` + `styles/main.css` + `scripts/main.js` |
| Existing page | read it first, then `patchFile` the target section only |

## Static Layout (default when there is no framework)

```
index.html          semantic markup only
styles/main.css     tokens, layout, components, media queries, reduced motion
scripts/main.js     behaviour; null-guard every querySelector
assets/             only when real image/font files exist
```

`index.html` must always contain:

```html
<link rel="stylesheet" href="styles/main.css">
<script type="module" src="scripts/main.js"></script>
```

## React / Next.js Rules

- One component per file; file name matches the component (`PricingCard.jsx` → `export default function PricingCard`).
- `src/main.jsx` is the only entry that mounts; keep it free of layout.
- Next.js App Router: `app/layout.jsx` owns `<html>`, `<body>`, fonts and metadata; `app/page.jsx` is the route; `"use client"` only where hooks are used.
- Styles: Tailwind classes, or a single `styles.css` / `globals.css`. Never a `<style>` tag inside JSX.
- Split any component over ~150 lines, and any static data list over ~5 items into a `const` at the top.

## Rules

- Create the directory structure implicitly by using full relative paths (`styles/main.css`, not `main.css`).
- Reuse what exists: read the current tokens/components before adding parallel ones.
- Never rewrite a file you have not read.
- Keep the entry point thin; put detail in modules.

## Anti-Patterns

- Single HTML file holding the whole page, all CSS and all JS.
- `index.html` alone when CSS/JS were promised.
- Duplicating a stylesheet into a `<style>` block instead of linking it.
- Adding a build tool, framework or dependency the project does not already use.
- Fragments, `...`, `TODO`, or "rest of the code unchanged" inside a written file.
