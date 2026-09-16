/** Runtime session: inspect > understand > plan > skills > direction > tokens > compose > build > verify > critique > improve > memory. */
import path from 'node:path';
import { EventBus, EVENT } from '../core/events.mjs';
import { silentLogger } from '../core/logger.mjs';
import { inspectWorkspace, summarizeInspection } from '../workspace/scanner.mjs';
import { createSkillRegistry } from '../skills/registry.mjs';
import { createRetriever } from '../skills/retriever.mjs';
import { createRouter } from '../model/router.mjs';
import { chooseDirection } from '../design/directions.mjs';
import { buildTokens } from '../design/tokens.mjs';
import { composePage, deriveSubject } from '../design/compose.mjs';
import { emitSiteCss, emitMotionCss } from '../design/emit-css.mjs';
import { createToolContext } from '../tools/context.mjs';
import { verifyStatic } from '../verify/static.mjs';
import { reasonCode } from '../reason/code.mjs';
import { reasonCritique } from '../reason/critique.mjs';
import { recordRun } from '../workspace/memory.mjs';
import { makeId } from '../core/util.mjs';
export async function runTask(request, { workspaceDir, config, overrides = {}, bus: externalBus } = {}) {
  const bus = externalBus ?? new EventBus();
  const logger = config?.logger ?? silentLogger;
  const run = { id: makeId('run'), request, status: 'running', startedAt: new Date().toISOString(), decisions: [], writes: [] };
  bus.emit(EVENT.RUN_START, { id: run.id, request });
  try {
    bus.emit(EVENT.PHASE, { phase: 'inspect' });
    const inspection = inspectWorkspace(workspaceDir, config);
    run.inspection = { summary: summarizeInspection(inspection), kind: inspection.projectKind, framework: inspection.framework };
    bus.emit(EVENT.THOUGHT, { phase: 'inspect', text: run.inspection.summary });
    const router = createRouter({ config, bus, logger });
    bus.emit(EVENT.PHASE, { phase: 'understand' });
    const understanding = (await router.json(request, { kind: 'understand', payload: { request, inspection }, phase: 'understand', validate: (v) => !!v?.taskType })).value;
    run.understanding = understanding;
    bus.emit(EVENT.PHASE, { phase: 'plan' });
    const plan = (await router.json(request, { kind: 'plan', payload: { request, understanding, inspection }, phase: 'plan', validate: (v) => Array.isArray(v?.steps) })).value;
    run.plan = plan;
    bus.emit(EVENT.PLAN, { steps: plan.steps?.length ?? 0 });
    const registry = createSkillRegistry({ skills: config.skills, logger });
    const retriever = createRetriever({ registry, config, logger });
    const skills = retriever.retrieve({ request, taskType: understanding.taskType, workspace: inspection });
    run.skills = { ids: skills.ids, summary: skills.summary };
    bus.emit(EVENT.SKILLS, { ids: skills.ids });
    const { chosen: direction, method } = await chooseDirection({ request, taskType: understanding.taskType, inspection, router, bus, logger });
    run.direction = { name: direction.name, id: direction.id, method };
    run.decisions.push({ kind: 'direction', choice: direction.id, why: method });
    const tokens = buildTokens({ direction, existing: inspection.design, intent: understanding.intent, request });
    run.tokens = { accent: tokens.accent, theme: tokens.theme, direction: tokens.direction };
    const subject = deriveSubject(request);
    const brandFromRequest = request.match(/called\s+([A-Za-z][A-Za-z0-9&' -]{1,30}?)(?=[,.;]|$)/i);
    if (brandFromRequest) subject.subject = brandFromRequest[1].trim();
    const page = composePage({ request, taskType: understanding.taskType, projectKind: inspection.projectKind, direction, subject, wants: [] });
    run.page = { sections: page.sections.map((s) => s.type + ':' + s.layout) };
    const tools = createToolContext({ workspaceDir, config, bus, dryRun: !!overrides.dryRun });

    // Enhancement tasks: inject only the targeted layer into the existing page.
    const ENHANCE_TYPES = ['enhance', 'motion', 'responsive', '3d'];
    let code;
    if (ENHANCE_TYPES.includes(understanding.taskType)) {
      const existingRel = tools.listFiles().find((rel) => /^index\.html?$/i.test(rel));
      if (existingRel) {
        // pass raw request so enhancement can apply targeted tweaks (color, sizing)
        code = await enhanceExistingFile({ existingRel, taskType: understanding.taskType, tokens, direction, tools, request });
      }
    }
    if (!code) {
      const title = page.kind === 'component-demo'
        ? `${page.component.charAt(0).toUpperCase() + page.component.slice(1)} — demo`
        : (page.title ?? 'Artisan site');
      code = await reasonCode({ direction, plan: page, tokens, inspection, title, skills: { ids: skills.ids, contextBlock: skills.contextBlock }, router });
    }
    run.codeNotes = code.notes;
    for (const file of code.files) {
      const res = tools.writeFile(file.rel, file.content);
      run.writes.push(res);
    }
    const html = code.files.find((f) => f.rel.endsWith('.html'))?.content ?? '';
    const cssMatch = html.match(/<style>\n([\s\S]*?)\n<\/style>/);
    const css = cssMatch ? cssMatch[1] : emitSiteCss(tokens, { direction, plan: page });
    let verification = verifyStatic({ html, css, plan: page });
    // Repair loop: deterministic fixes from verification issues, then re-verify.
    let iterations = 0;
    const maxIterations = overrides.maxIterations ?? 2;
    while (!verification.ok && iterations < maxIterations) {
      iterations += 1;
      const repaired = repairHtml({ html, issues: verification.issues, tokens, direction, page });
      if (!repaired) break;
      const res = tools.writeFile('index.html', repaired);
      run.writes.push(res);
      const newCssMatch = repaired.match(/<style>\n([\s\S]*?)\n<\/style>/);
      verification = verifyStatic({ html: repaired, css: newCssMatch ? newCssMatch[1] : css, plan: page });
      bus.emit(EVENT.IMPROVE, { iteration: iterations, issues: verification.issues.length });
    }
    run.improvements = iterations;
    run.verification = verification;
    run.verification = verification;
    bus.emit(EVENT.VERIFY, verification);
    const critique = reasonCritique({ sections: page.sections, verification });
    run.critique = critique;
    bus.emit(EVENT.CRITIQUE, { overall: critique.overall });
    run.status = verification.ok ? 'done' : 'needs-fix';
    run.endedAt = new Date().toISOString();
    if (!overrides.noMemory) recordRun(workspaceDir, config, run);
    bus.emit(EVENT.RUN_END, { id: run.id, status: run.status, score: critique.overall });
    return { run, bus, inspection, direction, tokens, page, html: run.status === 'failed' ? undefined : html, css };
  } catch (error) {
    run.status = 'failed';
    run.error = String(error?.message ?? error);
    bus.emit(EVENT.ERROR, { message: run.error });
    bus.emit(EVENT.RUN_END, { id: run.id, status: 'failed' });
    return { run, bus, error };
  }
}

/* ---------------------------------------------------- enhancement passes ---- */

/**
 * Inject a targeted layer into an existing page without touching its markup.
 * Returns the same shape as reasonCode: { files, notes }.
 */
async function enhanceExistingFile({ existingRel, taskType, tokens, direction, tools, request = '' }) {
  const source = tools.readFile(existingRel);
  const notes = [];
  const injections = [];
  const rawRequest = String(request ?? '');

  if (taskType === 'motion' || taskType === 'enhance') {
    injections.push('/* ---- artisan motion layer ---- */\n' + emitMotionCss());
    notes.push('motion layer injected (durations, easings, reveal, reduced-motion)');
  }
  if (taskType === 'responsive' || taskType === 'enhance') {
    injections.push(`/* ---- artisan responsive layer ---- */
@media (max-width: 60rem) {
  .container { padding-inline: var(--space-5); }
  [class*='__inner'], .grid { grid-template-columns: 1fr !important; }
}
@media (max-width: 40rem) {
  body { font-size: var(--text-base); }
  .section, section { padding-block: var(--space-12); }
}`);
    notes.push('responsive layer injected (tablet + mobile breakpoints)');
  }
  // Targeted tweaks for follow-ups like "make the card smaller", "make button red", "change background"
  // Only inspect the primary request part before session context, to avoid prior context polluting tweaks
  const primary = String(rawRequest).split('[session context:')[0].toLowerCase();
  const t = primary;
  if (/\b(red)\b/.test(t)) {
    injections.push('/* tweak: red accent */\n:root { --color-accent: #d43a2f !important; --color-accent-hover: #b62f25 !important; } .btn--primary{ background: var(--color-accent) !important; }');
    notes.push('accent tweaked to red per request');
  } else if (/\b(blue)\b/.test(t)) {
    injections.push('/* tweak: blue accent */\n:root { --color-accent: #2f5dd4 !important; --color-accent-hover: #244ab0 !important; }');
    notes.push('accent tweaked to blue per request');
  }
  if (/\b(smaller|compact|narrow)\b/.test(t) && /\b(card|auth)\b/.test(t)) {
    injections.push('/* tweak: smaller card */\n.auth__card, .card { max-width: 26rem !important; padding: var(--space-6) !important; }');
    notes.push('card sizing tweaked (smaller) per request');
  } else if (/\b(smaller|compact)\b/.test(t)) {
    injections.push('/* tweak: compact sizing */\n.container { max-width: 56rem !important; }');
    notes.push('compact sizing tweak per request');
  }
  if (/\b(background|bg)\b/.test(t) && /\b(change|dark|light|blue|red|premium)\b/.test(t)) {
    injections.push('/* tweak: background */\nbody { background: var(--color-surface-alt) !important; }');
    notes.push('background tweak per request');
  }

  // Premium 3D + scroll handling — detect intent from primary request
  const wants3D = /\b(3d|three\.?js|webgl|depth|immersive)\b/i.test(primary) || taskType === '3d';
  const wantsScroll = /\b(scroll|pin|scrub|parallax|horizontal|gsap|cinematic|storytelling|glassmorphism)\b/i.test(primary) || taskType === 'motion' || taskType === 'enhance';
  const wantsPremium = wants3D || wantsScroll || /\b(premium|cinematic|high.?end)\b/i.test(primary);

  if (wants3D || taskType === '3d') {
    // Upgrade from simple perspective to real WebGL when premium, else keep lightweight
    if (wantsPremium && !source.includes('hero-webgl')) {
      injections.push(`/* ---- artisan premium 3D ---- */
.hero--premium { position: relative; overflow: clip; }
.hero-webgl { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; opacity: 0.95; }
.hero-webgl canvas { width: 100% !important; height: 100% !important; display: block; }
.hero--premium .container { position: relative; z-index: 1; }
.hero__orb { position: absolute; border-radius: 50%; background: radial-gradient(circle at 30% 30%, var(--color-accent), transparent 70%); filter: blur(18px); opacity: 0.55; pointer-events: none; }
.hero__orb--1 { width: 420px; height: 420px; top: -8%; right: -6%; }
.hero__orb--2 { width: 300px; height: 300px; bottom: 10%; left: 6%; opacity: 0.35; }
.hero__orb--3 { width: 180px; height: 180px; top: 42%; right: 22%; opacity: 0.4; }
.scroll-pin { position: relative; }
.scroll-pin__sticky { position: sticky; top: 0; height: 100vh; display: grid; place-items: center; overflow: hidden; }
.parallax { will-change: transform; }
.glass { background: color-mix(in oklab, var(--color-surface) 72%, transparent); backdrop-filter: blur(16px) saturate(1.2); border: 1px solid color-mix(in oklab, var(--color-border) 70%, transparent); }
@media (max-width: 60rem) { .hero-webgl { opacity: 0.6; } .scroll-pin__sticky { height: auto; position: relative; } }
@media (prefers-reduced-motion: reduce) { .hero-webgl { display: none !important; } .parallax { transform: none !important; } }`);
      notes.push('premium 3D layer injected (WebGL canvas + orbs + scroll scaffolding)');
    } else if (!wantsPremium) {
      injections.push(`/* ---- artisan depth layer ---- */
#main, main { perspective: 1200px; }
.hero, section:first-of-type {
  transform-style: preserve-3d;
  position: relative;
}
.hero::before, section:first-of-type::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(120% 90% at 50% 0%, var(--color-accent-soft), transparent 60%);
  transform: translateZ(-60px);
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  #main, main { perspective: none; }
  .hero::before, section:first-of-type::before { transform: none; background: none; }
}`);
      notes.push('depth layer injected (one atmospheric effect + reduced-motion guard)');
    }
  }
  if (wantsScroll && !source.includes('ScrollTrigger') && !source.includes('hero-webgl')) {
    // If we didn't already inject premium 3D which includes scroll scaffolding, add scroll-only css
    if (!wants3D) {
      injections.push(`/* ---- artisan scroll storytelling ---- */
.scroll-pin { position: relative; }
.scroll-pin__sticky { position: sticky; top: 0; height: 100vh; display: grid; place-items: center; overflow: hidden; }
.parallax { will-change: transform; }
.horizontal { display: flex; gap: var(--space-6); will-change: transform; }
@media (prefers-reduced-motion: reduce) { .parallax { transform: none !important; } }`);
      notes.push('scroll storytelling layer injected (pin + parallax)');
    }
  }

  let updated = source;
  // Premium HTML scaffolding — inject CDN, canvas + orbs, scroll pin
  const needsCdn = (wants3D || wantsScroll) && wantsPremium && !updated.includes('gsap.min.js');
  if (needsCdn) {
    const cdnThree = wants3D ? `<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}</` + `script>\n` : '';
    updated = updated.replace('</head>', `${cdnThree}<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></` + `script>\n<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"></` + `script>\n</head>`);
    notes.push('CDN imports injected (GSAP' + (wants3D ? ' + Three' : '') + ')');
  }
  if (wantsPremium && wants3D && !updated.includes('hero-webgl')) {
    if (updated.includes('class="hero')) {
      updated = updated.replace(/class="hero([^"]*)"/, 'class="hero hero--premium$1" data-hero-premium');
      if (!updated.includes('data-hero-canvas')) {
        updated = updated.replace(/(<section[^>]*class="hero[^>]*>)/, `$1\n      <div class="hero-webgl" aria-hidden="true">\n        <canvas id="hero-webgl" data-hero-canvas></canvas>\n        <div class="hero__orb hero__orb--1 parallax" data-parallax data-speed="0.12"></div>\n        <div class="hero__orb hero__orb--2 parallax" data-parallax data-speed="0.06"></div>\n        <div class="hero__orb hero__orb--3 parallax" data-parallax data-speed="0.09"></div>\n      </div>`);
        notes.push('hero WebGL canvas injected');
      }
    }
  }
  if (wantsPremium && wantsScroll && !updated.includes('data-scroll-pin') && updated.includes('class="section')) {
    updated = updated.replace(/(<section[^>]*class="section[^>]*>)/, `$1`.replace(/<section/, '<section data-scroll-pin'));
    let count = 0;
    updated = updated.replace(/<section([^>]*class="section[^>]*>)/g, (m, attrs) => {
      count += 1;
      if (count === 2 && !m.includes('data-scroll-pin')) return `<section${attrs} data-scroll-pin><div data-pin>`;
      return m;
    });
    notes.push('scroll pin scaffolding injected');
  }

  if (injections.length) {
    const styleMatch = updated.match(/<style>([\s\S]*?)<\/style>/);
    if (styleMatch) {
      updated = updated.replace(/<\/style>/, `${injections.join('\n')}\n</style>`);
    } else {
      updated = updated.replace(/<\/head>/, `<style>\n${injections.join('\n')}\n</style>\n</head>`);
    }
    // Ensure the interactive layer exists for motion reveals.
    if (!updated.includes('IntersectionObserver') && (taskType === 'motion' || taskType === 'enhance' || wantsScroll)) {
      const close = '</' + 'script>';
      const js = `<script>\n(() => {\n  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;\n  if (reduce || !('IntersectionObserver' in window)) { document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('enter')); return; }\n  const io = new IntersectionObserver((entries) => entries.forEach((en) => {\n    if (en.isIntersecting) { en.target.classList.add('enter'); io.unobserve(en.target); }\n  }), { threshold: 0.12 });\n  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));\n})();\n${close}`;
      updated = updated.replace(/<\/body>/, `${js}\n</body>`);
      notes.push('reveal runtime injected');
    }
    // Premium 3D + scroll JS — single injection, respects reduced-motion and mobile
    if ((wants3D || wantsScroll) && wantsPremium && !updated.includes('hero-webgl') && !updated.includes('ScrollTrigger')) {
      // This case shouldn't happen as we already handled hero-webgl above, but fallback for JS-only
    }
    if (wantsPremium && (wants3D || wantsScroll) && !updated.includes('premium scroll + 3D')) {
      const close2 = '</' + 'script>';
      const premiumJs = `<script>\n/* premium scroll + 3D — progressive enhancement */\n(() => {\n  try {\n    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;\n    const isCoarse = window.matchMedia("(pointer: coarse)").matches;\n    const prefersLow = window.matchMedia("(max-width: 768px)").matches;\n    if (!reduceMotion) {\n      const els = document.querySelectorAll("[data-parallax]");\n      const onParallax = () => { const sy = window.scrollY; els.forEach((el) => { const speed = parseFloat(el.dataset.speed || "0.08"); el.style.transform = "translate3d(0," + (sy * speed * -0.35) + "px,0)"; }); };\n      window.addEventListener("scroll", onParallax, { passive: true }); onParallax();\n    }\n    if (!reduceMotion && !isCoarse) {\n      const orbs = document.querySelectorAll(".hero__orb");\n      window.addEventListener("mousemove", (e) => {\n        const x = (e.clientX / window.innerWidth - 0.5) * 2;\n        const y = (e.clientY / window.innerHeight - 0.5) * 2;\n        orbs.forEach((orb, i) => { const f = (i + 1) * 6; orb.style.transform = "translate3d(" + (x * f) + "px," + (y * f * 0.6) + "px,0)"; });\n      }, { passive: true });\n    }\n    const hasGSAP = typeof window.gsap !== "undefined";\n    if (!reduceMotion && hasGSAP && window.ScrollTrigger) {\n      window.gsap.registerPlugin(window.ScrollTrigger);\n      document.querySelectorAll("[data-scroll-pin]").forEach((pin) => {\n        const tl = window.gsap.timeline({ scrollTrigger: { trigger: pin, pin: pin.querySelector("[data-pin]") || pin, scrub: 1, start: "top top", end: "+=120%", anticipatePin: 1 } });\n        const steps = pin.querySelectorAll("[data-step]");\n        steps.forEach((step, i) => { tl.fromTo(step, { opacity: 0.35, y: 12 }, { opacity: 1, y: 0, duration: 0.4 }, i * 0.25); tl.to(step, { opacity: 0.35, duration: 0.2 }, i * 0.25 + 0.35); });\n      });\n      document.querySelectorAll("[data-horizontal]").forEach((wrap) => {\n        const track = wrap.querySelector("[data-horizontal-track]");\n        if (!track) return;\n        const len = track.children.length;\n        window.gsap.to(track, { xPercent: -100 * (len - 1), ease: "none", scrollTrigger: { trigger: wrap, pin: true, scrub: 1, end: "+=" + (len * 100) + "%" } });\n      });\n    }\n    const canvas = document.querySelector("[data-hero-canvas]");\n    if (canvas && !reduceMotion && !isCoarse && !prefersLow) {\n      import("three").then((THREE) => {\n        const scene = new THREE.Scene();\n        const camera = new THREE.PerspectiveCamera(44, canvas.clientWidth / canvas.clientHeight, 0.1, 100);\n        camera.position.set(0, 0.2, 6);\n        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });\n        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));\n        renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);\n        renderer.toneMapping = THREE.ACESFilmicToneMapping;\n        scene.add(new THREE.AmbientLight(0xffffff, 0.7));\n        const dir = new THREE.DirectionalLight(0xffffff, 1.2); dir.position.set(2, 3, 4); scene.add(dir);\n        const geo = new THREE.IcosahedronGeometry(0.9, 1);\n        const m1 = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x7c5cff, roughness: 0.35, metalness: 0.15, transparent: true, opacity: 0.95 })); m1.position.set(-1.6, 0.4, 0);\n        const m2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshStandardMaterial({ color: 0x4f46e5, roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0.75 })); m2.position.set(1.4, -0.2, -0.5);\n        const m3 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.65 })); m3.position.set(0.6, 0.9, -0.8);\n        scene.add(m1, m2, m3);\n        const onResize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); };\n        window.addEventListener("resize", onResize, { passive: true });\n        let mx = 0, my = 0, sx = 0;\n        window.addEventListener("mousemove", (e) => { mx = (e.clientX / window.innerWidth - 0.5) * 0.6; my = (e.clientY / window.innerHeight - 0.5) * 0.4; }, { passive: true });\n        window.addEventListener("scroll", () => { sx = window.scrollY / 1200; }, { passive: true });\n        let raf = 0; const tick = () => { raf = requestAnimationFrame(tick); m1.rotation.y += 0.003 + mx * 0.002; m1.rotation.x += 0.0015 + my * 0.001; m2.rotation.y -= 0.004 + mx * 0.0015; m2.rotation.z += 0.002; m3.rotation.y += 0.005; m3.rotation.x -= 0.002 + my * 0.001; camera.position.x += (mx * 0.9 - camera.position.x) * 0.04; camera.position.y += (-my * 0.5 - camera.position.y + 0.2) * 0.04; camera.lookAt(0, 0, 0); m1.position.y = 0.4 + Math.sin(Date.now() * 0.0004) * 0.12; scene.rotation.y = sx * 0.18; renderer.render(scene, camera); }; tick();\n        document.addEventListener("visibilitychange", () => { if (document.hidden) cancelAnimationFrame(raf); else tick(); });\n      }).catch(() => {});\n    } else if (canvas) { canvas.style.display = "none"; }\n  } catch (e) {}\n})();\n${close2}`;
      updated = updated.replace(/<\/body>/, `${premiumJs}\n</body>`);
      notes.push('premium 3D + scroll JS injected (GSAP + Three.js, mouse + scroll, reduced-motion guard)');
    }
    notes.push(`enhancement applied to ${existingRel} (markup preserved)`);
  } else {
    notes.push('nothing to inject for this task type; existing page left intact');
  }
  return { files: [{ rel: existingRel, content: updated }], notes };
}

/* ---------------------------------------------------------- repair pass ---- */

/** Deterministic repairs for the exact issues verifyStatic reports. */
function repairHtml({ html, issues, tokens, direction, page }) {
  let out = html;
  let changed = false;
  const has = (check) => issues.some((issue) => issue.check === check);
  if (!out) return undefined;

  if (has('title')) {
    out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeXml(page?.sections?.find((s) => s.type === 'hero')?.content?.headline ?? 'Artisan site')}</title>`);
    changed = true;
  }
  if (has('lang')) {
    out = out.replace(/<html(?! lang)[^>]*>/, '<html lang="en">');
    changed = true;
  }
  if (has('viewport')) {
    out = out.replace(/<\/head>/, '<meta name="viewport" content="width=device-width, initial-scale=1" />\n</head>');
    changed = true;
  }
  if (has('skip-link')) {
    out = out.replace(/<body[^>]*>/, (m) => `${m}\n<a class="visually-hidden" href="#main">Skip to content</a>`);
    changed = true;
  }
  if (has('reduced-motion')) {
    out = out.replace(/<\/style>/, '@media (prefers-reduced-motion: reduce) {\n  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }\n  [data-reveal] { opacity: 1 !important; transform: none !important; }\n}\n</style>');
    changed = true;
  }
  if (has('labels')) {
    out = out.replace(/<input([^>]*?)>/g, (m, attrs) => (/aria-label=/.test(m) ? m : `<input aria-label="field"${attrs}>`));
    changed = true;
  }
  return changed ? out : undefined;
}

function escapeXml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

