/**
 * Scripted OpenAI-compatible model server for deterministic tests.
 *
 * It plays a competent frontend engineer: answers discussion turns with the
 * control JSON the conversation runtime expects, selects skills, writes a spec
 * + TODOs, implements files (with a deliberate mobile overflow so the REAL
 * browser QA has something to catch), fixes what QA hands back, and refines an
 * existing build on request. Every prompt it receives is recorded so tests can
 * assert what the runtime actually sent.
 */
import http from 'node:http';

const json = (value) => '```json\n' + JSON.stringify(value) + '\n```';

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lattice — the AI developer tool that reads your codebase</title>
<link rel="stylesheet" href="styles/main.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <a class="brand" href="#top">Lattice</a>
  <nav aria-label="Primary"><a href="#how">How it works</a><a href="#proof">Proof</a><a class="btn btn--ghost" href="#start">Start</a></nav>
</header>
<main id="main">
  <section class="hero" id="top">
    <div class="hero__depth" aria-hidden="true"><span class="layer layer--a"></span><span class="layer layer--b"></span></div>
    <p class="eyebrow">For engineering teams shipping weekly</p>
    <h1 class="display">Read the whole codebase.<br>Ship the right change.</h1>
    <p class="lede">Lattice maps every module, test and dependency in your repository so each suggestion lands in context — not in a vacuum.</p>
    <div class="actions"><a class="btn btn--primary" href="#start">Start free</a><a class="link" href="#how">See how it works</a></div>
  </section>
  <section class="how" id="how">
    <h2>Three moves, one system</h2>
    <ol class="steps">
      <li><span class="num">01</span><h3>Index</h3><p>Lattice parses the repo into a typed graph: modules, calls, tests, ownership.</p></li>
      <li><span class="num">02</span><h3>Reason</h3><p>Every request is answered against the graph, with citations to the exact lines.</p></li>
      <li><span class="num">03</span><h3>Ship</h3><p>Patches arrive as reviewable diffs with the tests that prove them.</p></li>
    </ol>
    <div class="wide">Benchmarks: 41% fewer review cycles across 120 repositories in the last quarter.</div>
  </section>
  <section class="proof" id="proof">
    <blockquote><p>"It is the first tool that answers with the file open."</p><cite>Staff engineer, payments platform</cite></blockquote>
  </section>
  <section class="cta" id="start">
    <h2>Point it at a repository.</h2>
    <p>Free for open source, flat pricing for teams.</p>
    <a class="btn btn--primary" href="#top">Start free</a>
  </section>
</main>
<footer class="foot"><p>© Lattice. Built for people who read code.</p></footer>
<script type="module" src="scripts/main.js"></script>
</body>
</html>`;

const CSS_WEAK = `:root { --bg: #0f1113; --ink: #f2efe9; --muted: #9a9890; --accent: #e0a458; --space: clamp(1rem, 2.5vw, 2rem); --display: 'Georgia', serif; --text: system-ui, sans-serif; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 var(--text); }
.skip { position: absolute; left: -999px; } .skip:focus-visible { left: 1rem; top: 1rem; }
.top { display: flex; justify-content: space-between; align-items: center; padding: var(--space) calc(var(--space) * 2); }
.brand { color: var(--ink); text-decoration: none; font-weight: 700; letter-spacing: -0.02em; }
nav { display: flex; gap: 1.5rem; align-items: center; } nav a { color: var(--muted); text-decoration: none; }
.hero { position: relative; padding: clamp(4rem, 12vw, 9rem) calc(var(--space) * 2) clamp(3rem, 8vw, 6rem); max-width: 68rem; margin: 0 auto; overflow: hidden; }
.hero__depth { position: absolute; inset: 0; pointer-events: none; }
.layer { position: absolute; border-radius: 50%; filter: blur(60px); opacity: 0.35; }
.layer--a { width: 40vw; height: 40vw; right: -10vw; top: -10vw; background: var(--accent); }
.layer--b { width: 24vw; height: 24vw; left: -8vw; bottom: -6vw; background: #4d6b7a; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.8rem; color: var(--muted); margin: 0 0 1rem; }
.display { font-family: var(--display); font-size: clamp(2.75rem, 7vw, 6rem); line-height: 0.98; letter-spacing: -0.03em; margin: 0 0 1.5rem; max-width: 12ch; position: relative; }
.lede { font-size: clamp(1.05rem, 1.6vw, 1.3rem); color: var(--muted); max-width: 42ch; margin: 0 0 2rem; position: relative; }
.actions { display: flex; gap: 1.25rem; align-items: center; position: relative; }
.btn { display: inline-flex; align-items: center; min-height: 44px; padding: 0 1.4rem; border-radius: 999px; text-decoration: none; font-weight: 600; }
.btn--primary { background: var(--accent); color: #141210; } .btn--ghost { border: 1px solid #3a3d40; color: var(--ink); }
.link { color: var(--ink); }
.how, .proof, .cta { padding: clamp(3rem, 8vw, 6rem) calc(var(--space) * 2); max-width: 68rem; margin: 0 auto; }
h2 { font-family: var(--display); font-size: clamp(1.9rem, 4vw, 3rem); letter-spacing: -0.02em; margin: 0 0 2rem; }
.steps { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; }
.steps li { border-top: 1px solid #2a2d30; padding-top: 1rem; } .num { color: var(--accent); font-variant-numeric: tabular-nums; }
.steps h3 { margin: 0.5rem 0; font-size: 1.2rem; } .steps p { margin: 0; color: var(--muted); }
.wide { width: 600px; margin-top: 3rem; padding: 1rem; border: 1px solid #2a2d30; color: var(--muted); }
blockquote { margin: 0; font-family: var(--display); font-size: clamp(1.4rem, 3vw, 2.2rem); } cite { display: block; margin-top: 1rem; color: var(--muted); font-style: normal; font-size: 1rem; }
.cta p { color: var(--muted); margin-bottom: 2rem; }
.foot { padding: 2rem; color: var(--muted); font-size: 0.9rem; }
a:focus-visible, .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
[data-reveal] { opacity: 0; transform: translateY(12px); transition: opacity 0.6s ease, transform 0.6s ease; }
[data-reveal].is-in { opacity: 1; transform: none; }
@media (max-width: 52rem) { .steps { grid-template-columns: 1fr; } nav a:not(.btn) { display: none; } }
@media (prefers-reduced-motion: reduce) { [data-reveal] { opacity: 1; transform: none; transition: none; } .layer { display: none; } }
`;

const JS = `const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const targets = document.querySelectorAll('[data-reveal]');
if (reduce || !('IntersectionObserver' in window)) targets.forEach((el) => el.classList.add('is-in'));
else { const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { threshold: 0.15 }); targets.forEach((el) => io.observe(el)); }
const layers = document.querySelectorAll('.layer');
if (!reduce && layers.length) window.addEventListener('scroll', () => { const y = window.scrollY; layers.forEach((l, i) => { l.style.transform = 'translate3d(0,' + (y * (0.05 + i * 0.03)) + 'px,0)'; }); }, { passive: true });
`;

function chatReply(lastUser, system) {
  const t = lastUser.toLowerCase();
  const hasBuild = /existing build:/i.test(system);
  const reply = (text, control) => `${text}\n${json({ intent: 'discuss', ready: false, missing: [], context: {}, ...control })}`;
  if (/^(hi|hello|hey)\b/.test(t)) return reply('Hey! Ready when you are — what are we building?', { intent: 'meta' });
  if (/what can you do/.test(t)) return reply('I design and build frontend work in your project: we discuss the direction, then I implement it, render it, critique it and iterate.', { intent: 'question' });
  if (/landing page for an ai developer tool/.test(t)) return reply('Nice. A landing page for an AI developer tool — who is it for, and what should it feel like?', { context: { project: 'landing page for an AI developer tool', product: 'AI developer tool', audience: 'developers and engineering teams', summary: 'Landing page for an AI developer tool.' } });
  if (/premium and cinematic/.test(t)) return reply('Premium and cinematic — I would lean on restraint: a dark, quiet stage, wide margins, a single strong typographic gesture, and depth from layering rather than decoration.', { context: { visualDirection: ['premium', 'cinematic'], summary: 'Premium, cinematic landing page for an AI developer tool.' } });
  if (/not the usual purple/.test(t)) return reply('Agreed — no purple gradients, no glass cards. A warm neutral palette with one amber signal reads more confident.', { context: { rejected: ['purple AI SaaS gradient look', 'glassmorphism cards'], color: 'warm dark neutrals with a single amber accent; no purple' } });
  if (/subtle 3d depth and smooth motion/.test(t)) return reply('Subtle depth I would do with layered planes and slow parallax rather than a full WebGL scene — cheaper and calmer. Motion stays smooth and scroll-linked.', { context: { depth3d: 'subtle layered depth in the hero (CSS layers + parallax), no heavy WebGL', motion: 'smooth scroll-linked motion, restrained reveals, one easing family' } });
  if (/typography to remain the main visual focus/.test(t)) return reply('Perfect — typography leads: an oversized serif display headline with tight tracking, depth layers stay behind it. I am ready to build when you are.', { ready: true, context: { typography: 'typography is the primary visual element: oversized serif display headline, tight tracking', hero: 'typography-led hero with subtle layered depth behind the headline', accepted: ['typography as the main focus'], summary: 'Premium, cinematic landing page for an AI developer tool: typography-led hero with subtle layered depth and smooth scroll-linked motion; no purple SaaS look.' } });
  if (/make the hero more immersive/.test(t)) return reply(hasBuild ? 'I would deepen the parallax layers, add a third plane and let the headline sit further in front. Say "do it" and I will apply it to the current build.' : 'What hero? We have not built anything yet.', { context: { changeRequests: ['make the hero more immersive: add a third depth plane and stronger parallax, headline in front'] } });
  if (/^(okay, )?(go )?build it|^do it|^go ahead|implement it/.test(t)) return reply(hasBuild ? 'Applying it now.' : 'On it.', { intent: 'build' });
  return reply('Noted.', {});
}

function assistantTurns(messages) { return messages.filter((m) => m.role === 'assistant').length; }

function implementationTurn(messages, system) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const refine = /REFINEMENT of an existing build/.test(system);
  const n = assistantTurns(messages);
  if (refine) {
    if (n === 0) return 'THINK: read the current hero first.\n' + json([{ tool: 'read_file', args: { path: 'index.html' } }, { tool: 'update_todo', args: { id: 'I1', status: 'in_progress' } }]);
    if (n === 1) return 'THINK: add a third depth plane and push the headline forward.\n' + json([
      { tool: 'edit_file', args: { path: 'index.html', edits: [{ oldText: '<span class="layer layer--b"></span></div>', newText: '<span class="layer layer--b"></span><span class="layer layer--c"></span></div>' }] } },
      { tool: 'edit_file', args: { path: 'styles/main.css', edits: [{ oldText: '.layer--b {', newText: '.layer--c { width: 18vw; height: 18vw; left: 30vw; top: 10vw; background: #7a5a3a; opacity: 0.25; }\n.layer--b {' }] } },
      { tool: 'update_todo', args: { id: 'I1', status: 'completed', note: 'third plane + stronger parallax' } },
      { done: true, summary: 'Hero made more immersive: third depth plane, headline in front.' },
    ]);
    return json([{ done: true, summary: 'Refinement complete.' }]);
  }
  if (/VISUAL QA round/.test(lastUser) && /overflow/i.test(lastUser)) {
    return 'THINK: the benchmark strip has a fixed 600px width — make it fluid.\n' + json([
      { tool: 'edit_file', args: { path: 'styles/main.css', edits: [{ oldText: '.wide { width: 600px;', newText: '.wide { max-width: 100%;' }] } },
      { done: true, summary: 'Fixed the mobile overflow; typography-led hero with layered depth stands.' },
    ]);
  }
  if (n === 0) return 'THINK: structure + tokens + composition first.\n```file:index.html\n' + HTML + '\n```\n```file:styles/main.css\n' + CSS_WEAK + '\n```\n```file:scripts/main.js\n' + JS + '\n```\n' + json([{ tool: 'update_todo', args: { id: 'I1', status: 'completed', note: 'structure, tokens, composition' } }]);
  if (n === 1) return 'THINK: visual system and motion are in; marking TODOs and requesting review.\n' + json([
    { tool: 'update_todo', args: { id: 'I2', status: 'completed' } },
    { tool: 'update_todo', args: { id: 'I3', status: 'completed' } },
    { tool: 'update_todo', args: { id: 'I4', status: 'completed' } },
    { done: true, summary: 'Built Lattice landing page: typography-led hero, layered depth, scroll-linked motion.' },
  ]);
  return json([{ done: true, summary: 'Done.' }]);
}

function critiqueTurn(prompt) {
  const overflow = /HORIZONTAL OVERFLOW/.test(prompt);
  if (overflow) return json({ score: 61, verdict: 'iterate', summary: 'Strong typographic hero, but the page breaks on mobile.', strengths: ['display headline carries the hero'], weaknesses: [{ area: 'responsive', severity: 'blocker', evidence: 'mobile viewport scrolls horizontally', fix: 'remove the fixed-width benchmark strip' }, { area: 'spacing', severity: 'minor', evidence: 'proof section feels thin', fix: 'add breathing room above the quote' }] });
  return json({ score: 86, verdict: 'pass', summary: 'Typography leads, depth is restrained, mobile holds.', strengths: ['typography-led hero', 'restrained palette without purple'], weaknesses: [] });
}

export function startMockModel({ vision = false } = {}) {
  const record = { prompts: [], systems: [], calls: 0 };
  const server = http.createServer(async (req, res) => {
    if (req.url?.startsWith('/models')) { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ data: [{ id: 'mock-model' }] })); }
    let body = '';
    for await (const chunk of req) body += chunk;
    let data = {};
    try { data = JSON.parse(body); } catch { res.writeHead(400); return res.end('bad json'); }
    const messages = data.messages ?? [];
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    const last = [...messages].reverse().find((m) => m.role === 'user');
    const lastUser = typeof last?.content === 'string' ? last.content : (last?.content ?? []).map((p) => p.text ?? '').join('\n');
    record.calls += 1;
    record.prompts.push({ system: system.slice(0, 200), user: lastUser.slice(0, 400), full: { system, user: lastUser }, images: Array.isArray(last?.content) ? last.content.filter((p) => p.type === 'image_url').length : 0 });
    let content;
    if (/^SKILL SELECTION/.test(lastUser)) content = json({ skills: [{ id: 'typography', why: 'typography leads' }, { id: 'visual-design', why: 'composition and hierarchy' }, { id: 'layout', why: 'asymmetric hero' }, { id: 'parallax', why: 'subtle depth' }, { id: 'vanilla-motion', why: 'static site motion' }, { id: 'responsive-design', why: 'three viewports' }], tech: { depth: 'css', animation: 'vanilla', why: 'layered CSS depth + rAF parallax is enough; no WebGL needed' } });
    else if (/^DESIGN SPEC \+ PLAN/.test(lastUser)) {
      const refine = /MODE: REFINE/.test(lastUser);
      content = json(refine
        ? { spec: { visual_direction: 'keep the established warm dark editorial stage', hero_concept: 'deeper layered parallax behind the serif headline; headline stays in front', motion_language: 'stronger scroll-linked parallax, same easing', depth_strategy: 'three CSS planes with blur, no WebGL' }, tech: { depth: 'css', animation: 'vanilla', why: 'CSS planes suffice' }, files: ['index.html', 'styles/main.css'], todos: [{ id: 'I1', description: 'Add a third depth plane and stronger parallax behind the hero headline', priority: 'high', dependencies: [], skills: ['parallax'], files: ['index.html', 'styles/main.css'], completionCondition: 'three planes render behind the headline with visible parallax' }] }
        : { spec: { visual_direction: 'warm dark editorial stage, quiet and premium; no purple, no glass', layout_strategy: 'asymmetric left-anchored hero, three-step system section, single quote, closing CTA', typography: 'serif display clamp(2.75rem, 7vw, 6rem) tight tracking; system sans body 16px/1.6; typography is the primary visual element', color_system: '#0f1113 stage, #f2efe9 ink, #e0a458 amber signal; no purple', hero_concept: 'typography-led: oversized two-line serif headline with two blurred depth planes behind it', motion_language: 'scroll-linked parallax on the planes, reveal on entry, one ease-out family', depth_strategy: 'CSS layered planes with blur and parallax; WebGL rejected as unnecessary', interaction_strategy: 'hover lift on buttons, focus-visible rings', responsive_strategy: 'single column under 52rem, headline clamps, tap targets 44px', performance_constraints: 'no canvas, < 5KB JS', copy_direction: 'concrete engineering voice, real numbers' }, tech: { depth: 'css', animation: 'vanilla', libraries: [], why: 'cheapest tier that achieves subtle depth' }, files: ['index.html', 'styles/main.css', 'scripts/main.js'], todos: [
          { id: 'I1', description: 'Establish structure, tokens and composition', priority: 'high', dependencies: [], skills: ['layout', 'typography'], files: ['index.html', 'styles/main.css'], completionCondition: 'semantic page with tokens and asymmetric hero renders' },
          { id: 'I2', description: 'Implement the typography system', priority: 'high', dependencies: ['I1'], skills: ['typography'], files: ['styles/main.css'], completionCondition: 'serif display headline leads the hero' },
          { id: 'I3', description: 'Implement hero depth planes with parallax', priority: 'medium', dependencies: ['I1'], skills: ['parallax'], files: ['scripts/main.js'], completionCondition: 'two planes parallax on scroll, disabled under reduced motion' },
          { id: 'I4', description: 'Implement motion language (reveals, hover states)', priority: 'medium', dependencies: ['I2'], skills: ['vanilla-motion'], files: ['scripts/main.js'], completionCondition: 'reveals fire, reduced motion shows everything' },
          { id: 'I5', description: 'Responsive refinement at 390 / 834 / 1440', priority: 'medium', dependencies: ['I3', 'I4'], skills: ['responsive-design'], files: [], completionCondition: 'no horizontal overflow at any viewport' },
        ] });
    } else if (/^VISUAL QA CRITIQUE/.test(lastUser)) content = critiqueTurn(lastUser);
    else if (/IMPLEMENTATION phase/.test(system)) content = implementationTurn(messages, system);
    else if (/OUTPUT FORMAT/.test(system)) content = chatReply(lastUser, system);
    else content = 'I do not know this prompt.\n' + json({ intent: 'discuss', context: {} });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'mock', object: 'chat.completion', model: data.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: Math.ceil(body.length / 4), completion_tokens: Math.ceil(content.length / 4) } }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        model: vision ? 'mock-vision-model' : 'mock-model',
        record,
        close: () => new Promise((done) => { try { server.closeAllConnections?.(); } catch {} server.close(() => done()); }),
      });
    });
  });
}
