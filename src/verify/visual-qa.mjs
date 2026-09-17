/**
 * Visual QA — CODE → RENDER → SEE → CRITIQUE.
 *
 * Three tiers, always labelled honestly in the result:
 *   1. render      — headless browser screenshots + measured DOM metrics (browser.mjs)
 *   2. heuristics  — deterministic findings derived from those measurements
 *                    (overflow, contrast, empty sections, tap targets, generic signals,
 *                    promises in the design spec that the render does not keep)
 *   3. critique    — a model reviews the page as a design director; with a
 *                    vision-capable model it sees the screenshots, otherwise it
 *                    judges from the measured digest and says so
 *
 * If no browser is available the result carries rendered:false and method
 * 'static-only' so nobody can mistake "CSS exists" for visual QA.
 */

import fs from 'node:fs';
import path from 'node:path';
import { renderPage, describeRender, browserAvailability, DEFAULT_VIEWPORTS } from './browser.mjs';
import { verifyStatic } from './static.mjs';
import { antiGenericCheck } from './quality-gate.mjs';
import { extractJson } from '../model/json.mjs';
import { ensureContrast } from '../design/color.mjs';
import { checkRequirements, copyFindings } from './requirements.mjs';

const SEVERITY_WEIGHT = { blocker: 25, major: 10, minor: 4 };

function finding(area, severity, evidence, fix, source = 'render') {
  return { area, severity, evidence: String(evidence).slice(0, 240), fix: String(fix).slice(0, 240), source };
}

/** Deterministic findings from a render result. Pure function — unit-testable. */
export function findingsFromRender(render, { spec, agreed, minBodyFont = 14 } = {}) {
  const out = [];
  if (!render?.ok) return out;
  const desktop = render.viewports[0];
  const mobile = render.viewports.find((v) => v.name === 'mobile') ?? render.viewports.at(-1);
  const m = desktop?.metrics ?? {};
  const mm = mobile?.metrics ?? {};
  const avoid = [...(agreed?.rejected ?? []), ...(agreed?.constraints ?? [])].join(' ').toLowerCase();
  const emphasis = [...(agreed?.accepted ?? []), agreed?.typography ?? '', agreed?.hero ?? ''].join(' ').toLowerCase();

  // --- correctness blockers
  for (const vp of render.viewports) {
    const v = vp.metrics?.viewport;
    if (v?.horizontalOverflow) out.push(finding('responsive', 'blocker', `${vp.name} ${vp.width}px: horizontal overflow (scrollWidth ${v.scrollWidth}) — ${(vp.metrics.overflowingElements ?? []).slice(0, 3).map((e) => `${e.el} right=${e.right}`).join(', ') || 'unknown element'}`, 'Find the element wider than the viewport (fixed widths, 100vw + padding, long unbroken text, grid min-content) and let it shrink; verify at 390px.'));
  }
  const errors = (render.console?.errors ?? []).filter((e) => !/favicon/i.test(e));
  if (errors.length) out.push(finding('runtime', 'blocker', `${errors.length} console error(s): ${errors.slice(0, 2).join(' | ')}`, 'Fix the JavaScript/resource error; the page must load clean.'));
  const failed = (render.failedRequests ?? []).filter((f) => !/favicon/i.test(f.url));
  if (failed.length) out.push(finding('runtime', 'blocker', `${failed.length} failed resource(s): ${failed.slice(0, 2).map((f) => `${f.url} ${f.error}`).join(' | ')}`, 'Every linked stylesheet/script/font/image must resolve; check paths and CDN URLs.'));
  if ((m.bodyText ?? 0) < 120) out.push(finding('content', 'blocker', `page renders only ${m.bodyText ?? 0} visible characters`, 'The page is effectively empty — implement the sections with real copy.'));
  if ((m.headings?.h1?.length ?? 0) === 0) out.push(finding('hierarchy', 'major', 'no visible h1', 'Give the page exactly one h1 that carries the headline.'));
  if ((m.headings?.h1?.length ?? 0) > 1) out.push(finding('hierarchy', 'minor', `${m.headings.h1.length} h1 elements`, 'Keep exactly one h1; demote the others to h2.'));
  const contrastFailures = m.contrast?.failures ?? [];
  if (contrastFailures.length >= 3) out.push(finding('contrast', 'major', `${contrastFailures.length} text elements fail WCAG contrast, e.g. ${contrastFailures.slice(0, 2).map((f) => `${f.el} ${f.ratio}:1 (${f.fg} on ${f.bg})`).join('; ')}`, 'Raise muted text lightness (secondary text should still reach 4.5:1 at body size); keep the palette, fix the values.'));
  else if (contrastFailures.length) out.push(finding('contrast', 'minor', `${contrastFailures.length} low-contrast text element(s): ${contrastFailures.map((f) => `${f.el} ${f.ratio}:1`).join('; ')}`, 'Nudge those colours until they pass 4.5:1 (3:1 for large text).'));

  // --- unfinished / thin areas
  const empties = (m.sections ?? []).filter((s) => s.empty && s.height > 120 && !/orb|blob|glow|webgl|canvas|decor|depth|layer|plane|stage|bg|background|aria/i.test(s.el));
  if (empties.length) out.push(finding('content', 'major', `${empties.length} section(s) render with no content: ${empties.slice(0, 3).map((s) => s.el).join(', ')}`, 'Fill or remove empty sections; every section needs a purpose and real copy.'));
  const fv = m.firstViewport ?? {};
  if (fv.textChars !== undefined && fv.textChars < 40) out.push(finding('hero', 'major', `first viewport shows only ${fv.textChars} characters of text`, 'The hero must communicate immediately: headline + supporting line + primary action above the fold.'));
  if (fv.hasHeading === false) out.push(finding('hero', 'major', 'no heading inside the first viewport', 'Bring the headline into the first screen.'));
  if (fv.heroHeightRatio > 1.8) out.push(finding('composition', 'minor', `hero is ${fv.heroHeightRatio}x the viewport height`, 'Trim the hero to about one viewport so the page starts moving; empty height is not atmosphere.'));

  // --- typography
  const t = m.text ?? {};
  if (t.bodyFontPx && t.bodyFontPx < minBodyFont) out.push(finding('typography', 'major', `dominant body text is ${t.bodyFontPx}px`, 'Body copy should be 16px or more (rem-based); reserve small sizes for labels only.'));
  if (t.smallTextCount >= 6) out.push(finding('typography', 'minor', `${t.smallTextCount} text elements under 12px`, 'Nothing readable should be under 12px; labels can be 12–13px uppercase with tracking.'));
  if (t.maxParagraphWidthCh > 85) out.push(finding('typography', 'minor', `paragraph measure reaches ${t.maxParagraphWidthCh}ch`, 'Cap prose at ~60–72ch with max-width.'));
  if ((t.families ?? []).length > 3) out.push(finding('typography', 'minor', `${t.families.length} font families in use (${t.families.slice(0, 4).join(', ')})`, 'Use at most two families (display + text) plus optional mono.'));
  const h1Px = m.headings?.h1Px ?? 0;
  const typeLed = /typograph/.test(emphasis) || /typograph/.test(String(spec?.design?.typography ?? '').toLowerCase());
  if (typeLed && h1Px && t.bodyFontPx && h1Px / t.bodyFontPx < 2.6) out.push(finding('typography', 'major', `typography is meant to lead but the h1 is only ${h1Px}px vs ${t.bodyFontPx}px body (${(h1Px / t.bodyFontPx).toFixed(1)}x)`, 'Let the display type carry the hero: fluid clamp() headline ≥ 3.5x body, tight tracking, deliberate line breaks.'));
  if ((m.headings?.orderIssues ?? 0) > 0) out.push(finding('hierarchy', 'minor', `${m.headings.orderIssues} heading level jump(s)`, 'Keep heading levels sequential (h1 → h2 → h3).'));

  // --- mobile
  const mi = mm.interactive ?? {};
  if ((mi.smallTapTargets ?? 0) >= 3) out.push(finding('responsive', 'major', `${mi.smallTapTargets} tap targets under 40px on mobile (${(mi.smallSamples ?? []).slice(0, 2).join(', ')})`, 'Give buttons/links ≥ 44px hit areas on touch screens.'));
  const mfv = mm.firstViewport ?? {};
  if (mfv.hasHeading === false) out.push(finding('responsive', 'major', 'mobile first viewport has no heading', 'Re-think the hero for 390px: headline first, supporting line, one action.'));
  const rm = desktop?.reducedMotion;
  if (rm && (rm.invisibleTextBlocks ?? 0) > 0) out.push(finding('motion', 'major', `${rm.invisibleTextBlocks} text block(s) stay invisible under prefers-reduced-motion`, 'Reveal animations must fall back to visible content when motion is reduced.'));
  // Accessibility, not polish: motion without an opt-out is a defect.
  if (m.motion && m.motion.reducedMotionRule === false && ((m.motion.animatedElements ?? 0) + (m.motion.transitionElements ?? 0)) > 0) out.push(finding('motion', 'major', `${(m.motion.animatedElements ?? 0) + (m.motion.transitionElements ?? 0)} element(s) animate or transition and there is no prefers-reduced-motion rule`, 'Add @media (prefers-reduced-motion: reduce) that disables animation and transitions and leaves every element visible.'));
  if ((m.motion?.hiddenRevealElements ?? 0) > 0) out.push(finding('motion', 'major', `${m.motion.hiddenRevealElements} reveal element(s) still hidden after scrolling through the page`, 'The reveal observer is not firing (or the class is wrong); content must never stay invisible.'));

  // --- a11y
  const a = m.a11y ?? {};
  if (a.imagesWithoutAlt) out.push(finding('accessibility', 'minor', `${a.imagesWithoutAlt} image(s) without alt`, 'Add alt text (empty alt for decorative images).'));
  if (a.inputsWithoutLabel) out.push(finding('accessibility', 'major', `${a.inputsWithoutLabel} form control(s) without a label`, 'Bind every input to a label or aria-label.'));
  if (a.landmarks && a.landmarks.main === 0) out.push(finding('accessibility', 'minor', 'no <main> landmark', 'Wrap the page content in <main>.'));
  if (m.interactive && m.interactive.focusVisibleRule === false) out.push(finding('accessibility', 'minor', 'no :focus-visible styles', 'Add a visible focus ring for keyboard users.'));
  if ((m.layout?.brokenImages ?? 0) > 0) out.push(finding('content', 'major', `${m.layout.brokenImages} broken image(s)`, 'Remove or fix image sources; never ship 404 images.'));

  // --- generic / template signals
  const lay = m.layout ?? {};
  const col = m.colors ?? {};
  if ((lay.identicalCards ?? 0) >= 4) out.push(finding('composition', 'minor', `${lay.identicalCards} identical card blocks in a uniform grid`, 'Vary the composition: one featured item, alternating rows, editorial list — not a card wall.'));
  if ((lay.absoluteDecor ?? 0) >= 3) out.push(finding('composition', 'minor', `${lay.absoluteDecor} absolutely positioned decorative layers (blobs/orbs/glows)`, 'Cut decoration to the one element that builds the atmosphere; depth should come from layout and type.'));
  if ((col.gradients ?? 0) >= 4) out.push(finding('color', 'minor', `${col.gradients} gradient backgrounds`, 'Limit gradients to a single atmospheric layer; flat surfaces read more premium.'));
  if ((col.blurCount ?? 0) >= 4) out.push(finding('color', 'minor', `${col.blurCount} glass (backdrop-filter) surfaces`, 'Glassmorphism everywhere reads generic; keep blur to one purposeful surface.'));
  if ((col.softBlurCount ?? 0) >= 5) out.push(finding('composition', 'minor', `${col.softBlurCount} blurred decorative layers`, 'Too many soft glows read as generic atmosphere; keep one or two planes.'));
  if (/purple|violet/.test(avoid)) {
    const purple = (col.accents ?? []).filter((acc) => acc.hue >= 250 && acc.hue <= 295 && acc.sat >= 0.3);
    if (purple.length) out.push(finding('color', 'major', `purple accent in use (${purple.map((p) => p.color).join(', ')}) although purple was explicitly rejected`, 'Switch the accent to a hue outside the purple/violet range and re-check the palette against the agreed direction.'));
  }
  if (/glass|glassmorph/.test(avoid) && (col.blurCount ?? 0) > 0) out.push(finding('color', 'major', `${col.blurCount} glass/blur surfaces although glassmorphism was rejected`, 'Remove backdrop-filter surfaces.'));
  if (/orb|blob/.test(avoid) && (lay.absoluteDecor ?? 0) > 0) out.push(finding('composition', 'major', `${lay.absoluteDecor} decorative blob/orb layers although they were rejected`, 'Remove the decorative blobs.'));
  if ((lay.cardLike ?? 0) >= 6 && (fv.ctaCount ?? 0) >= 2 && (lay.uniformGrids ?? 0) >= 1) out.push(finding('composition', 'minor', 'centered hero + pill buttons + uniform card grid pattern detected', 'This is the default AI-SaaS template; break it with asymmetry, a stronger type gesture or an editorial rhythm.'));

  // --- promises in the spec that the render does not keep
  const depth = String(spec?.tech?.depth ?? 'css');
  if (depth !== 'css' && (lay.canvas ?? 0) === 0 && (lay.transforms3d ?? 0) === 0 && !lay.perspective) out.push(finding('depth', 'major', `spec promises ${depth} depth but no canvas or 3D transform renders`, 'Implement the depth layer (bounded canvas or CSS 3D) with a static fallback, or update the spec honestly.'));
  const wantsMotion = (spec?.motion?.layers ?? []).length > 0 || /motion|animat|scroll/.test(String(agreed?.motion ?? '').toLowerCase());
  if (wantsMotion && ((m.motion?.animatedElements ?? 0) + (m.motion?.transitionElements ?? 0)) === 0) out.push(finding('motion', 'minor', 'motion was agreed but nothing animates or transitions', 'Add the agreed motion language (reveals, hover/press states, scroll-linked movement) with reduced-motion fallback.'));
  return dedupeFindings(out);
}

function dedupeFindings(list) {
  const seen = new Set();
  return list.filter((f) => { const key = `${f.area}|${f.severity}|${f.evidence.slice(0, 60)}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

export function scoreFindings(findings, { base = 100 } = {}) {
  const penalty = findings.reduce((sum, f) => sum + (SEVERITY_WEIGHT[f.severity] ?? 4), 0);
  return Math.max(0, Math.min(100, base - penalty));
}

/* --------------------------------------------------------- model critique ---- */

function critiquePrompt({ spec, agreed, render, findings, round, mode, vision, requirements = [], coverage }) {
  const lines = [
    'VISUAL QA CRITIQUE — you are the design director reviewing a rendered page before it ships.',
    vision ? 'You are looking at real screenshots of the page (desktop top, desktop full page, mobile). Judge what you SEE.' : 'You cannot see the screenshots; judge from the measured render digest below and say so in your notes.',
    'Be ruthless and specific. Reject template feel, weak hierarchy, dead space, overloaded heroes, decoration without purpose. Praise only what earns it.',
    '',
    `Round ${round}${mode === 'refine' ? ' (refinement of an existing build)' : ''}.`,
  ];
  if (spec) {
    lines.push('', 'DESIGN SPEC the implementation promised:', typeof spec === 'string' ? spec : renderSpecSummary(spec));
  }
  if (agreed) {
    const block = renderAgreedForCritique(agreed);
    if (block) lines.push('', 'AGREED WITH THE USER (must hold):', block);
  }
  if (requirements.length) {
    lines.push('', 'THE BRIEF EXPLICITLY ASKED FOR:', ...requirements.map((r) => `- ${r.label}${coverage?.missing?.includes(r.id) ? '  <-- NOT PRESENT in the render' : '  (present)'}`));
  }
  lines.push('', 'MEASURED RENDER:', describeRender(render));
  const copy = render.viewports?.[0]?.metrics?.copy;
  if (copy) {
    lines.push('', `COPY ON THE PAGE: h1 "${copy.h1Text ?? ''}", ${copy.words ?? '?'} words, actions: ${(copy.ctaLabels ?? []).map((c) => `"${c}"`).join(', ') || 'none'}`);
    lines.push('Apply the specificity test to every line you can see: if a competitor in the same market could paste it onto their own page unchanged, it is filler and must be rewritten to name the mechanism. "Precision Scanning for Film Archives" fails. "Reads a 35mm frame in 4 seconds without touching the emulsion" passes.');
  }
  if (findings.length) lines.push('', 'DETERMINISTIC FINDINGS (already counted):', ...findings.map((f) => `- [${f.severity}] ${f.area}: ${f.evidence}`));
  lines.push(
    '',
    'Evaluate: hierarchy, composition, spacing/rhythm, typography, colour, depth, focal point, motion (from metrics), responsiveness, generic/template feel, unfinished areas, unnecessary elements, copy specificity, whether every part of the brief was actually delivered, and agreement with the spec.',
    'Reply with STRICT JSON only:',
    '{"score": 0-100, "verdict": "pass"|"iterate", "summary": "one sentence", "strengths": ["..."], "weaknesses": [{"area": "hierarchy|composition|spacing|typography|color|depth|motion|responsive|content|generic|accessibility", "severity": "blocker|major|minor", "evidence": "what you observed", "fix": "concrete change to make"}]}',
    'Verdict "pass" only when the page would impress a demanding client as intentional and finished. List at most 6 weaknesses, most important first.',
  );
  return lines.join('\n');
}

function renderSpecSummary(spec) {
  const d = spec?.design ?? {};
  const keys = ['visual_direction', 'layout_strategy', 'typography', 'color_system', 'hero_concept', 'motion_language', '3d_strategy'];
  const lines = keys.filter((k) => d[k]).map((k) => `- ${k}: ${String(d[k]).slice(0, 200)}`);
  if (spec?.tech?.depth) lines.push(`- tech: depth ${spec.tech.depth}, animation ${spec.tech.animation ?? 'css'}`);
  return lines.join('\n');
}

function renderAgreedForCritique(agreed) {
  const parts = [];
  if (agreed.summary) parts.push(`idea: ${agreed.summary}`);
  if (agreed.visualDirection?.length) parts.push(`direction: ${agreed.visualDirection.join(', ')}`);
  for (const key of ['hero', 'typography', 'color', 'motion', 'depth3d', 'composition', 'layout']) if (agreed[key]) parts.push(`${key}: ${agreed[key]}`);
  if (agreed.rejected?.length) parts.push(`REJECTED: ${agreed.rejected.join(' | ')}`);
  if (agreed.constraints?.length) parts.push(`constraints: ${agreed.constraints.join(' | ')}`);
  if (agreed.changeRequests?.length) parts.push(`requested changes: ${agreed.changeRequests.join(' | ')}`);
  return parts.join('\n');
}

function imagesFor(render) {
  if (!render?.ok) return [];
  const desktop = render.viewports[0];
  const mobile = render.viewports.find((v) => v.name === 'mobile');
  const list = [];
  const push = (file, label) => { if (file && fs.existsSync(file)) list.push({ path: file, mime: 'image/png', label }); };
  push(desktop?.screenshot, 'desktop top');
  push(desktop?.fullScreenshot, 'desktop full page');
  push(mobile?.screenshot, 'mobile top');
  return list;
}

export async function critiqueWithModel({ router, spec, agreed, render, findings, round = 1, mode = 'create', requirements = [], coverage }) {
  if (!router) return undefined;
  let live = false;
  try { live = await router.hasLiveModel(); } catch { live = false; }
  if (!live) return undefined;
  const wantsVision = router.supportsVision ? await router.supportsVision() : false;
  const images = wantsVision ? imagesFor(render) : [];
  const prompt = critiquePrompt({ spec, agreed, render, findings, round, mode, vision: images.length > 0, requirements, coverage });
  try {
    const response = await router.text(prompt, {
      kind: 'critique', phase: 'visual-qa', liveOnly: true, maxTokens: 700, temperature: 0.2,
      system: 'You are a ruthless, precise design director. Reply with STRICT JSON only — no prose outside the JSON.',
      images,
    });
    const parsed = extractJson(response.text);
    if (!parsed.ok || typeof parsed.value !== 'object') return { ok: false, error: 'critique was not valid JSON', provider: response.provider, model: response.model, vision: false };
    const value = parsed.value;
    const weaknesses = Array.isArray(value.weaknesses) ? value.weaknesses.filter((w) => w && typeof w === 'object').slice(0, 6).map((w) => finding(String(w.area ?? 'design'), ['blocker', 'major', 'minor'].includes(w.severity) ? w.severity : 'minor', String(w.evidence ?? w.issue ?? ''), String(w.fix ?? ''), 'critique')) : [];
    return {
      ok: true,
      provider: response.provider,
      model: response.model,
      vision: Boolean(response.meta?.imagesSent ?? (images.length > 0 && !response.meta?.imagesDropped)),
      score: Number.isFinite(Number(value.score)) ? Math.max(0, Math.min(100, Number(value.score))) : undefined,
      verdict: value.verdict === 'pass' ? 'pass' : 'iterate',
      summary: String(value.summary ?? '').slice(0, 300),
      strengths: Array.isArray(value.strengths) ? value.strengths.map(String).slice(0, 5) : [],
      weaknesses,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error).slice(0, 200), vision: false };
  }
}

/* ------------------------------------------------------------- orchestrate ---- */

/**
 * Run one visual QA round.
 * @returns {Promise<{rendered: boolean, method: string, score: number, verdict: 'pass'|'iterate', findings: object[], screenshots: string[], render?: object, critique?: object, digest: string, reason?: string}>}
 */
export async function runVisualQa({ workspaceDir, entry = 'index.html', config = {}, spec, agreed, router, bus, outDir, round = 1, mode = 'create', html = '', css = '', viewports, requirements = [] } = {}) {
  const started = Date.now();
  const minScore = Number(config?.verification?.minQualityScore ?? 78);
  const availability = browserAvailability(config);
  let render;
  if (availability.available && config?.verification?.runVisual !== false) {
    try {
      render = await renderPage({ workspaceDir, entry, config, outDir, viewports: viewports ?? config?.verification?.visualViewports ?? DEFAULT_VIEWPORTS });
    } catch (error) {
      render = { ok: false, available: true, reason: `render failed: ${String(error?.message ?? error).slice(0, 200)}` };
    }
  } else {
    render = { ok: false, available: false, reason: config?.verification?.runVisual === false ? 'visual rendering disabled in config' : availability.reason };
  }

  let findings = [];
  let method = 'static-only';
  let digest = '';
  const screenshots = [];
  let coverage = { met: [], missing: [] };
  if (render.ok) {
    findings = findingsFromRender(render, { spec, agreed });
    // Did the build deliver what the brief asked for, and is the copy specific?
    const required = checkRequirements(render, requirements);
    coverage = { met: required.met, missing: required.missing };
    findings = dedupeFindings([...findings, ...required.findings, ...copyFindings(render)]);
    method = 'browser+heuristics';
    digest = describeRender(render);
    for (const vp of render.viewports) { if (vp.screenshot) screenshots.push(vp.screenshot); if (vp.fullScreenshot) screenshots.push(vp.fullScreenshot); }
  } else {
    // Honest downgrade: static checks on source text only.
    const staticV = verifyStatic({ html, css, plan: undefined });
    for (const issue of staticV.issues.filter((i) => i.severity === 'error')) findings.push(finding('correctness', 'major', issue.message, 'Fix the static check failure.', 'static'));
    const generic = antiGenericCheck({ html, css });
    for (const flag of generic.flags) findings.push(finding('generic', 'minor', flag, 'Address the generic signal.', 'static'));
    findings.push(finding('visual-qa', 'minor', `visual QA was NOT rendered: ${render.reason}`, 'Install Chrome/Edge (or set ARTISAN_BROWSER) so the agent can see its work.', 'static'));
    digest = `not rendered: ${render.reason}`;
  }

  let critique;
  if (router && render.ok) {
    critique = await critiqueWithModel({ router, spec, agreed, render, findings, round, mode, requirements, coverage });
    if (critique?.ok) {
      method = critique.vision ? 'browser+vision-critique' : 'browser+metrics-critique';
      findings = dedupeFindings([...findings, ...critique.weaknesses]);
    }
  }

  const heuristicScore = scoreFindings(findings.filter((f) => f.source !== 'critique'));
  const blended = critique?.ok && Number.isFinite(critique.score) ? Math.round((heuristicScore + critique.score) / 2) : heuristicScore;
  const blockers = findings.filter((f) => f.severity === 'blocker');
  const majors = findings.filter((f) => f.severity === 'major');
  let verdict = 'pass';
  if (blockers.length || blended < minScore) verdict = 'iterate';
  if (critique?.ok && critique.verdict === 'iterate' && (majors.length || blockers.length || (critique.score ?? 100) < minScore)) verdict = 'iterate';
  if (!render.ok && !blockers.length) verdict = majors.length ? 'iterate' : 'pass';
  // A page that scores well but is missing something the brief asked for is not
  // finished. This is the difference between "technically correct" and "done".
  if (coverage.missing.length) verdict = 'iterate';
  const result = {
    rendered: Boolean(render.ok), method, browser: render.browser, reason: render.ok ? undefined : render.reason,
    score: blended, heuristicScore, minScore, verdict, findings, screenshots, digest, critique, round, coverage, ms: Date.now() - started,
    render: render.ok ? { url: render.url, outDir: render.outDir, viewports: render.viewports.map((v) => ({ name: v.name, width: v.width, height: v.height, screenshot: v.screenshot, fullScreenshot: v.fullScreenshot, overflow: v.metrics?.viewport?.horizontalOverflow ?? null })), console: render.console, failedRequests: render.failedRequests } : undefined,
    // Full measured render (with per-viewport metrics). In-process only — callers
    // that persist a run must not copy this into the record.
    rawRender: render.ok ? render : undefined,
  };
  bus?.emit('critique.result', { kind: 'visual-qa', overall: blended, verdict, rendered: result.rendered, method, findings: findings.length, round });
  return result;
}

/**
 * Mechanical repairs derived from the MEASURED render (not from finding text).
 *
 * The deterministic engine has no model to re-think a design, but a measured
 * defect — an element wider than the viewport, text below 4.5:1, a reveal stuck
 * at opacity 0 — has one correct mechanical fix. Everything here targets the
 * exact selector the browser reported.
 *
 * @returns {{css: string, fixes: string[]}}
 */
export function deterministicRepairCss(render, { minBodyFont = 14 } = {}) {
  if (!render?.ok) return { css: '', fixes: [] };
  const rules = [];
  const fixes = [];
  const seen = new Set();
  const push = (selector, body, why) => {
    const key = `${selector}|${body}`;
    if (!selector || seen.has(key)) return;
    seen.add(key);
    rules.push(`${selector} { ${body} }`);
    fixes.push(why);
  };
  const safeSelector = (value) => {
    const text = String(value ?? '').trim();
    // describe() emits tag#id.class.class — reject anything else.
    return /^[a-z][a-z0-9]*(#[A-Za-z0-9_-]+)?(\.[A-Za-z0-9_-]+)*$/i.test(text) ? text : '';
  };

  for (const vp of render.viewports ?? []) {
    const m = vp.metrics ?? {};
    if (m.viewport?.horizontalOverflow) {
      for (const entry of (m.overflowingElements ?? []).slice(0, 5)) {
        const selector = safeSelector(entry.el);
        if (selector) push(selector, 'max-width: 100% !important; width: auto !important; overflow-wrap: anywhere;', `${vp.name}: constrained ${selector} which overflowed to ${entry.right}px`);
      }
      push('html, body', 'max-width: 100%;', `${vp.name}: clamped the document width`);
    }
    for (const failure of (m.contrast?.failures ?? []).slice(0, 8)) {
      const selector = safeSelector(failure.el);
      if (!selector || !/^#[0-9a-f]{6}$/i.test(failure.fg ?? '') || !/^#[0-9a-f]{6}$/i.test(failure.bg ?? '')) continue;
      const raised = ensureContrast(failure.fg, failure.bg, failure.needed >= 4.5 ? 4.6 : 3.1);
      push(selector, `color: ${raised} !important;`, `raised ${selector} from ${failure.ratio}:1 to >= ${failure.needed}:1 (${failure.fg} -> ${raised})`);
    }
    if ((m.motion?.hiddenRevealElements ?? 0) > 0) {
      push('[data-reveal]', 'opacity: 1 !important; transform: none !important;', `revealed ${m.motion.hiddenRevealElements} element(s) the observer left hidden`);
    }
    if (m.text?.bodyFontPx && m.text.bodyFontPx < minBodyFont) {
      push('body', 'font-size: 1rem;', `raised body text from ${m.text.bodyFontPx}px to 16px`);
    }
    if ((m.text?.maxParagraphWidthCh ?? 0) > 85) {
      push('p', 'max-width: 68ch;', `capped prose measure at 68ch (was ~${m.text.maxParagraphWidthCh}ch)`);
    }
    if (vp.name === 'mobile' && (m.interactive?.smallTapTargets ?? 0) >= 3) {
      push('a[class*="cta"], a[class*="btn"], button', 'min-height: 44px; display: inline-flex; align-items: center;', `gave ${m.interactive.smallTapTargets} small tap target(s) a 44px hit area`);
    }
  }
  if (!rules.length) return { css: '', fixes: [] };
  return {
    css: `\n/* ============================================================\n   Visual QA repair pass — generated from measured browser output.\n   ${fixes.map((f) => `- ${f}`).join('\n   ')}\n   ============================================================ */\n${rules.join('\n')}\n`,
    fixes,
  };
}

/** Findings → the message the implementation loop hands back to the model. */
export function renderFindingsForModel(qa, { maxItems = 8 } = {}) {
  const lines = [];
  lines.push(`VISUAL QA round ${qa.round} — ${qa.rendered ? `rendered with ${qa.browser} (${qa.method})` : `NOT rendered (${qa.reason})`} — score ${qa.score}/100 (minimum ${qa.minScore}) — verdict: ${qa.verdict.toUpperCase()}`);
  if (qa.critique?.ok && qa.critique.summary) lines.push(`Director's summary: ${qa.critique.summary}`);
  if (qa.critique?.ok && qa.critique.strengths?.length) lines.push(`Keep: ${qa.critique.strengths.slice(0, 3).join('; ')}`);
  const ordered = [...qa.findings].sort((a, b) => (SEVERITY_WEIGHT[b.severity] ?? 0) - (SEVERITY_WEIGHT[a.severity] ?? 0)).slice(0, maxItems);
  if (ordered.length) {
    lines.push('Weaknesses to fix (most severe first):');
    for (const f of ordered) lines.push(`- [${f.severity}] ${f.area}: ${f.evidence}${f.fix ? ` → ${f.fix}` : ''}`);
  } else {
    lines.push('No weaknesses found.');
  }
  if (qa.screenshots?.length) lines.push(`Screenshots: ${qa.screenshots.map((s) => path.basename(s)).join(', ')} in ${path.dirname(qa.screenshots[0])}`);
  return lines.join('\n');
}
