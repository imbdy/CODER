import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findingsFromRender, scoreFindings, renderFindingsForModel, runVisualQa } from '../../src/verify/visual-qa.mjs';
import { browserAvailability, renderPage, describeRender } from '../../src/verify/browser.mjs';

function fakeRender({ overflow = false, purpleAccent = false, h1Px = 64, bodyPx = 16, hidden = 0 } = {}) {
  const metrics = {
    viewport: { width: 1440, height: 900, docHeight: 2400, scrollWidth: overflow ? 1600 : 1440, horizontalOverflow: overflow, title: 'x', lang: 'en' },
    overflowingElements: overflow ? [{ el: 'div.wide', right: 1600, width: 600 }] : [],
    headings: { count: 3, h1: ['Headline'], h1Px, orderIssues: 0, list: [] },
    sections: [{ el: 'section.hero', height: 800, textChars: 300, empty: false }, { el: 'section.empty', height: 400, textChars: 0, empty: true }],
    firstViewport: { elements: 20, textChars: 300, hasHeading: true, headingText: 'Headline', heroHeightRatio: 0.9, ctaCount: 1, ctaLabels: ['Start'] },
    text: { sampled: 30, minFontPx: 14, maxFontPx: h1Px, bodyFontPx: bodyPx, smallTextCount: 0, families: ['Inter x10'], maxParagraphWidthCh: 60 },
    contrast: { checked: 20, skipped: 0, failures: [] },
    colors: { distinctBackgrounds: 2, gradients: 1, blurCount: 0, accents: purpleAccent ? [{ color: '#7c5cff', hue: 252, sat: 0.9, count: 2 }] : [{ color: '#e0a458', hue: 33, sat: 0.7, count: 2 }], theme: 'dark', bodyBackground: '#0f1113' },
    layout: { cardLike: 0, identicalCards: 0, uniformGrids: 0, absoluteDecor: 1, canvas: 0, svg: 0, images: 0, brokenImages: 0, transforms3d: 0, perspective: false },
    interactive: { total: 5, buttons: 1, links: 4, smallTapTargets: 0, smallSamples: [], hasSkipLink: true, focusVisibleRule: true },
    motion: { animatedElements: 2, transitionElements: 4, reducedMotionRule: true, reducedMotionMatched: false, hiddenRevealElements: hidden },
    a11y: { imagesWithoutAlt: 0, inputsWithoutLabel: 0, landmarks: { main: 1, nav: 1, header: 1, footer: 1 }, buttonsWithoutName: 0 },
    assets: {}, bodyText: 900,
  };
  const vp = (name, width, height) => ({ name, width, height, metrics: JSON.parse(JSON.stringify(metrics)), screenshot: undefined });
  const mobile = vp('mobile', 390, 844);
  mobile.metrics.viewport = { ...mobile.metrics.viewport, width: 390, scrollWidth: overflow ? 600 : 390, horizontalOverflow: overflow };
  return { ok: true, available: true, browser: 'fake', ms: 1, viewports: [vp('desktop', 1440, 900), vp('tablet', 834, 1112), mobile], console: { errors: [], warnings: [] }, failedRequests: [] };
}

describe('visual QA findings (deterministic)', () => {
  it('flags overflow as a blocker and rejected purple as major', () => {
    const findings = findingsFromRender(fakeRender({ overflow: true, purpleAccent: true }), { agreed: { rejected: ['purple AI SaaS look'] } });
    assert.ok(findings.some((f) => f.severity === 'blocker' && f.area === 'responsive' && /overflow/.test(f.evidence)));
    assert.ok(findings.some((f) => f.severity === 'major' && f.area === 'color' && /purple/.test(f.evidence)));
    assert.ok(findings.some((f) => f.area === 'content' && /no content/.test(f.evidence)), 'empty section flagged');
    assert.ok(scoreFindings(findings) < 78);
    const text = renderFindingsForModel({ round: 1, rendered: true, browser: 'fake', method: 'browser+heuristics', score: 40, minScore: 78, verdict: 'iterate', findings, screenshots: [] });
    assert.match(text, /VISUAL QA round 1/);
    assert.match(text, /\[blocker\] responsive/);
  });
  it('honours the typography-led promise and reveal visibility', () => {
    const weak = findingsFromRender(fakeRender({ h1Px: 30, bodyPx: 16, hidden: 2 }), { agreed: { accepted: ['typography as the main focus'] } });
    assert.ok(weak.some((f) => f.area === 'typography' && /meant to lead/.test(f.evidence)));
    assert.ok(weak.some((f) => f.area === 'motion' && /still hidden/.test(f.evidence)));
    const strong = findingsFromRender(fakeRender({ h1Px: 72 }), { agreed: { accepted: ['typography as the main focus'] } });
    assert.ok(!strong.some((f) => f.area === 'typography'));
  });
  it('reports honestly when no browser is available', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artisan-qa-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html lang="en"><head><title>x</title></head><body><main><h1>Hi</h1></main></body></html>');
    const qa = await runVisualQa({ workspaceDir: dir, config: { verification: { runVisual: false } }, html: '<html></html>', css: '' });
    assert.equal(qa.rendered, false);
    assert.equal(qa.method, 'static-only');
    assert.ok(qa.findings.some((f) => /NOT rendered/.test(f.evidence)));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('headless browser render', { timeout: 90000 }, () => {
  it('renders a page at three viewports with screenshots, metrics and console capture', async (t) => {
    const availability = browserAvailability({});
    if (!availability.available) { t.skip(availability.reason); return; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artisan-render-'));
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Probe</title><style>body{margin:0;font:16px/1.5 sans-serif;background:#111;color:#eee}.wide{width:700px;background:#333}h1{font-size:56px}</style></head><body><main><h1>Probe page</h1><p>${'Readable body copy about a real product. '.repeat(8)}</p><div class="wide">too wide for phones</div></main><script type="module" src="scripts/main.js"></script></body></html>`);
    fs.writeFileSync(path.join(dir, 'scripts', 'main.js'), 'console.error("boom from page"); document.body.dataset.ready = "1";');
    const out = path.join(dir, 'shots');
    const render = await renderPage({ workspaceDir: dir, outDir: out, settleMs: 300, reducedMotionCheck: false });
    assert.equal(render.ok, true, render.reason);
    assert.equal(render.viewports.length, 3);
    assert.ok(fs.existsSync(render.viewports[0].screenshot), 'desktop screenshot written');
    assert.ok(fs.existsSync(render.viewports[2].fullScreenshot), 'mobile full-page screenshot written');
    const mobile = render.viewports.find((v) => v.name === 'mobile');
    assert.equal(mobile.metrics.viewport.horizontalOverflow, true, 'measured overflow on mobile');
    assert.equal(render.viewports[0].metrics.headings.h1[0], 'Probe page');
    assert.ok(render.console.errors.some((e) => /boom from page/.test(e)), 'console error captured (module script served over http)');
    assert.match(describeRender(render), /HORIZONTAL OVERFLOW/);
    const findings = findingsFromRender(render, {});
    assert.ok(findings.some((f) => f.severity === 'blocker' && /overflow/.test(f.evidence)));
    assert.ok(findings.some((f) => f.severity === 'blocker' && /console error/.test(f.evidence)));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
