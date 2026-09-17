/**
 * Headless browser renderer — zero dependencies.
 *
 * The visual QA loop needs to actually SEE the page. This module finds a local
 * Chrome / Edge / Chromium, launches it headless with a DevTools port, speaks
 * the Chrome DevTools Protocol over the global WebSocket (Node >= 22), serves
 * the workspace over 127.0.0.1 (so module scripts, fonts and relative assets
 * work — file:// blocks ES modules), and for every viewport captures:
 *
 *   - a top-of-page screenshot and a full-page screenshot (PNG on disk)
 *   - layout / typography / contrast / a11y metrics measured in the live DOM
 *   - console errors, uncaught exceptions and failed resource loads
 *
 * When no browser can be found the caller gets { available: false, reason }
 * and must report that visual QA was NOT rendered — never pretend otherwise.
 */

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm',
};

export const DEFAULT_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
];

/* ------------------------------------------------------------ discovery ---- */

function candidatesFor(platform) {
  const env = process.env;
  const pf = env['ProgramFiles'] ?? 'C:\\Program Files';
  const pf86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const local = env.LOCALAPPDATA ?? '';
  if (platform === 'win32') {
    return [
      { path: path.join(pf, 'Google/Chrome/Application/chrome.exe'), label: 'Google Chrome' },
      { path: path.join(pf86, 'Google/Chrome/Application/chrome.exe'), label: 'Google Chrome' },
      { path: path.join(local, 'Google/Chrome/Application/chrome.exe'), label: 'Google Chrome' },
      { path: path.join(pf86, 'Microsoft/Edge/Application/msedge.exe'), label: 'Microsoft Edge' },
      { path: path.join(pf, 'Microsoft/Edge/Application/msedge.exe'), label: 'Microsoft Edge' },
      { path: path.join(local, 'Chromium/Application/chrome.exe'), label: 'Chromium' },
      { path: path.join(pf, 'BraveSoftware/Brave-Browser/Application/brave.exe'), label: 'Brave' },
    ];
  }
  if (platform === 'darwin') {
    return [
      { path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', label: 'Google Chrome' },
      { path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', label: 'Microsoft Edge' },
      { path: '/Applications/Chromium.app/Contents/MacOS/Chromium', label: 'Chromium' },
      { path: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', label: 'Brave' },
    ];
  }
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser'];
  const dirs = String(process.env.PATH ?? '').split(path.delimiter).concat(['/usr/bin', '/usr/local/bin', '/snap/bin', '/opt/google/chrome']);
  const out = [];
  for (const name of names) for (const dir of dirs) out.push({ path: path.join(dir, name), label: name });
  return out;
}

/** Locate a usable Chromium-based browser. Config / env override wins. */
export function findBrowser(config = {}) {
  const explicit = config?.verification?.browserPath ?? process.env.ARTISAN_BROWSER ?? process.env.CHROME_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit && fs.existsSync(explicit)) return { path: explicit, label: path.basename(explicit) };
  for (const candidate of candidatesFor(process.platform)) {
    try { if (candidate.path && fs.existsSync(candidate.path)) return candidate; } catch { /* next */ }
  }
  return undefined;
}

export function browserAvailability(config = {}) {
  if (typeof WebSocket === 'undefined') return { available: false, reason: 'Node 22+ is required for the headless browser (global WebSocket missing)' };
  const browser = findBrowser(config);
  if (!browser) return { available: false, reason: 'no Chrome/Edge/Chromium found — install one or set ARTISAN_BROWSER=<path to chrome.exe>' };
  return { available: true, browser };
}

/* -------------------------------------------------------------- server ---- */

/** Serve a folder over 127.0.0.1 on a random port. Returns { url, close }. */
export function serveWorkspace(root) {
  const base = path.resolve(root);
  const server = http.createServer((request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const full = path.resolve(base, `.${pathname}`);
      if (!full.startsWith(base)) { response.writeHead(403).end('forbidden'); return; }
      let target = full;
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      if (!fs.existsSync(target)) { response.writeHead(404, { 'content-type': 'text/plain' }).end(`not found: ${pathname}`); return; }
      const body = fs.readFileSync(target);
      response.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(body);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain' }).end(String(error?.message ?? error));
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, port, close: () => new Promise((done) => { try { server.closeAllConnections?.(); } catch {} server.close(() => done()); }) });
    });
  });
}

/* ------------------------------------------------------------- CDP client ---- */

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.events = [];
  }

  async connect(timeoutMs = 10000) {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connect timeout')), timeoutMs);
      this.ws.onopen = () => { clearTimeout(timer); resolve(); };
      this.ws.onerror = (event) => { clearTimeout(timer); reject(new Error(`CDP socket error: ${event?.message ?? 'unknown'}`)); };
    });
    this.ws.onmessage = (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message}${message.error.data ? ` (${message.error.data})` : ''}`));
        else resolve(message.result ?? {});
        return;
      }
      if (message.method) {
        this.events.push(message);
        if (this.events.length > 2000) this.events.shift();
        for (const listener of this.listeners.get(message.method) ?? []) { try { listener(message.params ?? {}); } catch {} }
      }
    };
    this.ws.onclose = () => {
      for (const { reject } of this.pending.values()) reject(new Error('CDP socket closed'));
      this.pending.clear();
    };
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }

  send(method, params = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      try { this.ws.send(JSON.stringify({ id, method, params })); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  async evaluate(expression, { awaitPromise = false, timeoutMs = 20000 } = {}) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, timeoutMs);
    if (result.exceptionDetails) throw new Error(`page script failed: ${result.exceptionDetails.text ?? ''} ${result.exceptionDetails.exception?.description ?? ''}`.trim());
    return result.result?.value;
  }

  close() { try { this.ws?.close(); } catch {} }
}

/* --------------------------------------------------------------- launch ---- */

export async function launchBrowser({ config = {}, timeoutMs = 20000 } = {}) {
  const availability = browserAvailability(config);
  if (!availability.available) throw new Error(availability.reason);
  const browser = availability.browser;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'artisan-browser-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-sync', '--mute-audio', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--disable-features=TranslateUI,MediaRouter', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1440,900',
  ];
  if (process.env.ARTISAN_BROWSER_NO_SANDBOX === '1' || (process.platform === 'linux' && process.getuid?.() === 0)) args.push('--no-sandbox');
  args.push('about:blank');
  const child = spawn(browser.path, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '';
  const wsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`browser did not expose DevTools within ${timeoutMs}ms: ${stderr.slice(-300)}`)), timeoutMs);
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`browser exited (${code}) before DevTools was ready: ${stderr.slice(-300)}`)); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
  });
  const port = Number(new URL(wsUrl).port);
  const close = async () => {
    try { child.kill(); } catch {}
    if (process.platform === 'win32' && child.pid) {
      try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch {}
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
    }
  };
  return { browser, child, port, wsUrl, profile, close };
}

async function openPage(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  let target = list.find((entry) => entry.type === 'page');
  if (!target) {
    const created = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    target = created;
  }
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.connect();
  return session;
}

/* -------------------------------------------------------------- metrics ---- */

/** Runs inside the page. Everything is guarded so one failure never blanks the report. */
export const METRICS_SCRIPT = String.raw`(() => {
  const out = {};
  const safe = (key, fn) => { try { out[key] = fn(); } catch (e) { out[key] = { error: String(e && e.message || e) }; } };
  const doc = document.documentElement;
  // Layout viewport, not the visual one: under mobile emulation Chrome zooms the
  // visual viewport out to fit wide content, which would hide horizontal overflow.
  const vw = doc.clientWidth || window.innerWidth, vh = doc.clientHeight || window.innerHeight;
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
  const parseColor = (str) => { const m = String(str || '').match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((v) => parseFloat(v)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const bgOf = (el) => { let node = el; const stack = []; while (node && node !== document) { const cs = getComputedStyle(node); const c = parseColor(cs.backgroundColor); if (c && c.a > 0) stack.push(c); if (cs.backgroundImage && cs.backgroundImage !== 'none') stack.push({ image: true }); if (c && c.a >= 1) break; node = node.parentElement; } let color = { r: 255, g: 255, b: 255, a: 1 }; const bodyBg = parseColor(getComputedStyle(document.body).backgroundColor); const htmlBg = parseColor(getComputedStyle(doc).backgroundColor); if (htmlBg && htmlBg.a > 0) color = blend(htmlBg, color); if (bodyBg && bodyBg.a > 0) color = blend(bodyBg, color); let hasImage = false; for (let i = stack.length - 1; i >= 0; i -= 1) { const c = stack[i]; if (c.image) { hasImage = true; continue; } color = blend(c, color); } return { color, hasImage }; };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const hueOf = (c) => { const r = c.r / 255, g = c.g / 255, b = c.b / 255; const max = Math.max(r, g, b), min = Math.min(r, g, b); const d = max - min; if (d === 0) return { h: 0, s: 0, l: max }; const l = (max + min) / 2; const s = d / (1 - Math.abs(2 * l - 1)); let h; if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h = Math.round(h * 60); if (h < 0) h += 360; return { h, s, l }; };
  const textOf = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const describe = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));

  safe('viewport', () => ({ width: vw, height: vh, docHeight: doc.scrollHeight, scrollWidth: doc.scrollWidth, horizontalOverflow: doc.scrollWidth > vw + 1, title: document.title, lang: doc.getAttribute('lang') || '' }));
  safe('overflowingElements', () => { const list = []; for (const el of document.body.querySelectorAll('*')) { if (list.length >= 8) break; if (!visible(el)) continue; const r = el.getBoundingClientRect(); if (r.right > vw + 2 && r.width < doc.scrollWidth * 1.5 && r.width > 8) list.push({ el: describe(el), right: Math.round(r.right), width: Math.round(r.width) }); } return list; });
  safe('headings', () => { const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map((h) => ({ level: Number(h.tagName[1]), text: textOf(h).slice(0, 80), px: parseFloat(getComputedStyle(h).fontSize), weight: getComputedStyle(h).fontWeight, family: getComputedStyle(h).fontFamily.split(',')[0].replace(/["']/g, '').trim() })); let orderIssues = 0; let last = 0; for (const h of hs) { if (last && h.level > last + 1) orderIssues += 1; last = h.level; } return { count: hs.length, h1: hs.filter((h) => h.level === 1).map((h) => h.text), h1Px: hs.find((h) => h.level === 1)?.px ?? 0, orderIssues, list: hs.slice(0, 24) }; });
  safe('sections', () => { const decorative = (el) => el.getAttribute('aria-hidden') === 'true' || ['absolute', 'fixed'].includes(getComputedStyle(el).position) || [...el.querySelectorAll('*')].length === 0 && !textOf(el); const nodes = [...document.querySelectorAll('header, nav, main > *, section, article, footer, [class*="hero"]')].filter((el, i, arr) => arr.indexOf(el) === i).filter((el) => visible(el) && !decorative(el)).slice(0, 28); return nodes.map((el) => { const r = el.getBoundingClientRect(); const text = textOf(el); return { el: describe(el), top: Math.round(r.top + window.scrollY), height: Math.round(r.height), textChars: text.length, images: el.querySelectorAll('img, svg, canvas, video, picture').length, headings: el.querySelectorAll('h1,h2,h3').length, empty: text.length < 12 && !el.querySelector('img, svg, canvas, video, picture, form, button') }; }); });
  safe('firstViewport', () => { const els = [...document.body.querySelectorAll('*')].filter((el) => { if (!visible(el)) return false; const r = el.getBoundingClientRect(); return r.top < vh && r.bottom > 0; }); const text = els.filter((el) => el.children.length === 0).map(textOf).join(' ').trim(); const heading = els.find((el) => /^H[1-3]$/.test(el.tagName)); const first = document.querySelector('main > *:not(nav):not(header), section, [class*="hero"]'); const firstRect = first ? first.getBoundingClientRect() : null; const ctas = els.filter((el) => (el.tagName === 'BUTTON' || (el.tagName === 'A' && /btn|button|cta/i.test(el.className))) && textOf(el).length); return { elements: els.length, textChars: text.length, hasHeading: Boolean(heading), headingText: heading ? textOf(heading).slice(0, 80) : '', heroHeightRatio: firstRect ? Number((firstRect.height / vh).toFixed(2)) : 0, ctaCount: ctas.length, ctaLabels: ctas.slice(0, 4).map(textOf) }; });
  safe('text', () => { const els = [...document.body.querySelectorAll('p, li, a, button, span, label, h1, h2, h3, h4, h5, h6, td, th, dd, dt, blockquote, small, strong, em, figcaption, summary')].filter((el) => visible(el) && textOf(el).length >= 4 && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 3)); let min = Infinity, max = 0; const families = new Map(); const sizes = new Map(); let small = 0; let widestCh = 0; for (const el of els.slice(0, 1200)) { const cs = getComputedStyle(el); const px = parseFloat(cs.fontSize); if (px < min) min = px; if (px > max) max = px; if (px < 12) small += 1; const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(); families.set(fam, (families.get(fam) || 0) + 1); if (el.tagName === 'P' || el.tagName === 'LI') { const chars = textOf(el).length; sizes.set(px, (sizes.get(px) || 0) + chars); const ch = el.getBoundingClientRect().width / (px * 0.5); if (ch > widestCh && chars > 60) widestCh = ch; } } let bodyPx = 16; let best = 0; for (const [px, n] of sizes) if (n > best) { best = n; bodyPx = px; } return { sampled: Math.min(els.length, 1200), minFontPx: Number.isFinite(min) ? min : 0, maxFontPx: max, bodyFontPx: bodyPx, smallTextCount: small, families: [...families.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f, n]) => f + ' x' + n), maxParagraphWidthCh: Math.round(widestCh) }; });
  safe('contrast', () => { const els = [...document.body.querySelectorAll('p, li, a, button, label, h1, h2, h3, h4, h5, h6, td, th, dd, dt, small, span, summary, figcaption')].filter((el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length >= 3)).slice(0, 400); const failures = []; let checked = 0; let skipped = 0; for (const el of els) { const cs = getComputedStyle(el); const fg = parseColor(cs.color); if (!fg) continue; const bg = bgOf(el); if (bg.hasImage) { skipped += 1; continue; } const px = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700; const large = px >= 24 || (px >= 18.66 && bold); const needed = large ? 3 : 4.5; const fgc = fg.a < 1 ? blend(fg, bg.color) : fg; const r = ratio(fgc, bg.color); checked += 1; if (r < needed && failures.length < 8) failures.push({ el: describe(el), text: textOf(el).slice(0, 40), ratio: Number(r.toFixed(2)), needed, fg: hex(fgc), bg: hex(bg.color), px }); } return { checked, skipped, failures }; });
  safe('colors', () => { const bgs = new Map(); const gradients = []; let blur = 0; let softBlur = 0; const accent = new Map(); for (const el of document.body.querySelectorAll('*')) { if (!visible(el)) continue; const cs = getComputedStyle(el); const c = parseColor(cs.backgroundColor); if (c && c.a > 0.2) { const key = hex(c); bgs.set(key, (bgs.get(key) || 0) + 1); } if (cs.backgroundImage && /gradient/.test(cs.backgroundImage) && gradients.length < 12) gradients.push(cs.backgroundImage.slice(0, 80)); if (/blur/.test(cs.backdropFilter || cs.webkitBackdropFilter || '')) blur += 1; else if (/blur/.test(cs.filter || '')) softBlur += 1; if ((el.tagName === 'BUTTON' || el.tagName === 'A') && c && c.a > 0.5) { const hsl = hueOf(c); if (hsl.s > 0.25) { const key = hex(c); accent.set(key, { count: (accent.get(key)?.count || 0) + 1, hue: hsl.h, sat: Number(hsl.s.toFixed(2)) }); } } } const accents = [...accent.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 4).map(([k, v]) => ({ color: k, hue: v.hue, sat: v.sat, count: v.count })); const bodyBg = parseColor(getComputedStyle(document.body).backgroundColor); return { distinctBackgrounds: bgs.size, gradients: gradients.length, gradientSamples: gradients.slice(0, 3), blurCount: blur, softBlurCount: softBlur, accents, theme: bodyBg && bodyBg.a > 0 ? (lum(bodyBg) < 0.2 ? 'dark' : 'light') : 'unknown', bodyBackground: bodyBg ? hex(bodyBg) : '' }; });
  safe('layout', () => { let cardLike = 0; let absoluteDecor = 0; let uniformGrids = 0; const cardSizes = []; for (const el of document.body.querySelectorAll('*')) { if (!visible(el)) continue; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); const radius = parseFloat(cs.borderTopLeftRadius) || 0; const bordered = cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0; const shadow = cs.boxShadow && cs.boxShadow !== 'none'; if (radius >= 10 && (bordered || shadow) && r.width * r.height > 20000 && r.width < vw * 0.8) { cardLike += 1; cardSizes.push(Math.round(r.width) + 'x' + Math.round(r.height)); } if ((cs.position === 'absolute' || cs.position === 'fixed') && (el.getAttribute('aria-hidden') === 'true' || textOf(el).length === 0) && r.width * r.height > 5000 && !/nav|header/i.test(el.tagName + el.className)) absoluteDecor += 1; if (cs.display === 'grid') { const cols = (cs.gridTemplateColumns || '').split(' ').filter(Boolean); if (cols.length >= 3 && new Set(cols).size === 1 && el.children.length >= 3) uniformGrids += 1; } } const sizeCounts = {}; for (const s of cardSizes) sizeCounts[s] = (sizeCounts[s] || 0) + 1; const identicalCards = Math.max(0, ...Object.values(sizeCounts)); return { cardLike, identicalCards, uniformGrids, absoluteDecor, canvas: document.querySelectorAll('canvas').length, svg: document.querySelectorAll('svg').length, images: document.images.length, brokenImages: [...document.images].filter((img) => img.complete && img.naturalWidth === 0 && !img.src.startsWith('data:')).length, transforms3d: [...document.body.querySelectorAll('*')].filter((el) => { const t = getComputedStyle(el).transform; return t && t.startsWith('matrix3d'); }).length, perspective: [...document.body.querySelectorAll('*')].some((el) => getComputedStyle(el).perspective !== 'none') }; });
  safe('interactive', () => { const els = [...document.body.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]')].filter(visible); let smallTap = 0; const samples = []; for (const el of els) { const r = el.getBoundingClientRect(); if ((r.width < 40 || r.height < 40) && el.tagName !== 'INPUT' && !/^(A)$/.test(el.tagName) ) { smallTap += 1; if (samples.length < 4) samples.push(describe(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); } else if (el.tagName === 'A' && r.height < 32 && /btn|button|cta/i.test(el.className)) { smallTap += 1; } } return { total: els.length, buttons: document.querySelectorAll('button').length, links: document.querySelectorAll('a[href]').length, smallTapTargets: smallTap, smallSamples: samples, hasSkipLink: Boolean([...document.querySelectorAll('a[href^="#"]')].find((a) => /skip/i.test(textOf(a)))), focusVisibleRule: [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => /focus-visible/.test(r.selectorText || '')); } catch { return false; } }) }; });
  safe('motion', () => { let animated = 0; let transitions = 0; for (const el of document.body.querySelectorAll('*')) { const cs = getComputedStyle(el); if (cs.animationName && cs.animationName !== 'none') animated += 1; if (cs.transitionDuration && cs.transitionDuration !== '0s' && cs.transitionProperty !== 'none') transitions += 1; } let reducedMotionRule = false; for (const s of document.styleSheets) { try { for (const r of s.cssRules) if (r.media && /prefers-reduced-motion/.test(r.media.mediaText)) reducedMotionRule = true; } catch {} } return { animatedElements: animated, transitionElements: transitions, reducedMotionRule, reducedMotionMatched: matchMedia('(prefers-reduced-motion: reduce)').matches, hiddenRevealElements: [...document.querySelectorAll('[data-reveal], .reveal, [data-animate]')].filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.height > 0 && cs.display !== 'none' && Number(cs.opacity) < 0.1 && (el.innerText || '').trim().length > 0; }).length }; });
  safe('a11y', () => ({ imagesWithoutAlt: [...document.images].filter((img) => !img.hasAttribute('alt')).length, inputsWithoutLabel: [...document.querySelectorAll('input:not([type=hidden]), textarea, select')].filter((el) => !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).length, landmarks: { main: document.querySelectorAll('main').length, nav: document.querySelectorAll('nav').length, header: document.querySelectorAll('header').length, footer: document.querySelectorAll('footer').length }, buttonsWithoutName: [...document.querySelectorAll('button')].filter((b) => !textOf(b) && !b.getAttribute('aria-label')).length }));
  safe('assets', () => ({ stylesheets: document.querySelectorAll('link[rel=stylesheet]').length, moduleScripts: document.querySelectorAll('script[type=module]').length, scripts: document.querySelectorAll('script[src]').length, inlineStyleChars: [...document.querySelectorAll('style')].reduce((n, s) => n + s.textContent.length, 0), inlineScriptChars: [...document.querySelectorAll('script:not([src])')].reduce((n, s) => n + s.textContent.length, 0), fonts: [...document.fonts].filter((f) => f.status === 'loaded').length, fontsFailed: [...document.fonts].filter((f) => f.status === 'error').length }));
  safe('bodyText', () => (document.body.innerText || '').replace(/\s+/g, ' ').trim().length);
  safe('structures', () => ({
    tables: document.querySelectorAll('table').length,
    tableRows: document.querySelectorAll('table tbody tr, table tr').length,
    definitionLists: document.querySelectorAll('dl').length,
    blockquotes: document.querySelectorAll('blockquote, figure > q, [class*="quote"]').length,
    citations: document.querySelectorAll('cite, figcaption').length,
    orderedLists: document.querySelectorAll('ol').length,
    orderedItems: document.querySelectorAll('ol > li').length,
    forms: document.querySelectorAll('form').length,
    navLinks: document.querySelectorAll('nav a, header a').length,
    landmarkSections: document.querySelectorAll('main > section, main > article, body > section').length,
    headingTexts: [...document.querySelectorAll('h1,h2,h3')].filter(visible).map((h) => textOf(h).slice(0, 70)),
  }));
  safe('copy', () => {
    const text = (document.body.innerText || '').replace(/\s+/g, ' ');
    // Phrases any competitor could paste unchanged (see skills/copywriting).
    const filler = ['everything you need', 'everything your team needs', 'powerful yet simple', 'coming soon', 'lorem ipsum', 'get started today', 'take your', 'to the next level', 'seamlessly', 'supercharge', 'unlock your', 'best-in-class', 'world-class', 'cutting-edge', 'game-changing', 'revolutionary', 'one-stop', 'trusted by thousands', 'built for the future'];
    const hits = filler.filter((phrase) => text.toLowerCase().includes(phrase));
    const h1 = document.querySelector('h1');
    const ctas = [...document.querySelectorAll('a[class*="cta"], a[class*="btn"], button')].filter(visible).map(textOf).filter(Boolean);
    const genericCta = ctas.filter((label) => /^(get started|sign up|learn more|request a demo|book a demo|contact us|try (it )?free|start (free|now)|submit|read more|click here)$/i.test(label.trim()));
    return { fillerHits: hits, words: text.split(/\s+/).filter(Boolean).length, h1Text: h1 ? textOf(h1).slice(0, 120) : '', ctaLabels: ctas.slice(0, 6), genericCtaLabels: genericCta.slice(0, 4) };
  });
  return JSON.stringify(out);
})()`;

const SCROLL_THROUGH_SCRIPT = String.raw`(async () => { const h = document.documentElement.scrollHeight; const step = Math.max(400, Math.floor(window.innerHeight * 0.7)); for (let y = 0; y < Math.min(h, 12000); y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 70)); } window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 250)); return true; })()`;

/* --------------------------------------------------------------- render ---- */

/**
 * Render a page from the workspace at several viewports.
 * @returns {Promise<object>} see module docs. Never throws for "no browser"; throws only on unexpected failures.
 */
export async function renderPage({
  workspaceDir, entry = 'index.html', viewports = DEFAULT_VIEWPORTS, config = {}, outDir,
  settleMs = 900, timeoutMs = 25000, url: explicitUrl, fullPage = true, reducedMotionCheck = true,
} = {}) {
  const started = Date.now();
  const availability = browserAvailability(config);
  if (!availability.available) return { ok: false, available: false, reason: availability.reason, viewports: [], console: { errors: [], warnings: [] }, failedRequests: [] };

  const shotsDir = outDir ?? path.join(os.tmpdir(), `artisan-shots-${Date.now()}`);
  fs.mkdirSync(shotsDir, { recursive: true });

  let server;
  let launched;
  let session;
  const consoleLog = { errors: [], warnings: [] };
  const failedRequests = [];
  const requestUrls = new Map();
  try {
    const entryRel = String(entry ?? 'index.html').replace(/\\/g, '/').replace(/^\.?\//, '');
    let pageUrl = explicitUrl;
    if (!pageUrl) {
      server = await serveWorkspace(workspaceDir);
      pageUrl = `${server.url}/${entryRel}`;
    }
    launched = await launchBrowser({ config, timeoutMs });
    session = await openPage(launched.port);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Log.enable');
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    session.on('Runtime.consoleAPICalled', (params) => {
      if (!['error', 'warning', 'assert'].includes(params.type)) return;
      const text = (params.args ?? []).map((arg) => arg.value ?? arg.description ?? '').join(' ').slice(0, 300);
      (params.type === 'warning' ? consoleLog.warnings : consoleLog.errors).push(text);
    });
    session.on('Runtime.exceptionThrown', (params) => {
      const details = params.exceptionDetails ?? {};
      consoleLog.errors.push(`${details.text ?? 'Uncaught'} ${details.exception?.description ?? ''}`.trim().slice(0, 300));
    });
    session.on('Log.entryAdded', (params) => {
      const entryLog = params.entry ?? {};
      if (entryLog.level === 'error' && !/favicon.ico/i.test(String(entryLog.url ?? entryLog.text ?? ''))) consoleLog.errors.push(`${entryLog.text ?? ''}${entryLog.url ? ` (${entryLog.url})` : ''}`.slice(0, 300));
      else if (entryLog.level === 'warning') consoleLog.warnings.push(String(entryLog.text ?? '').slice(0, 300));
    });
    session.on('Network.requestWillBeSent', (params) => { requestUrls.set(params.requestId, params.request?.url); });
    session.on('Network.loadingFailed', (params) => { const failedUrl = requestUrls.get(params.requestId) ?? '?'; if (/favicon.ico$/i.test(failedUrl)) return; failedRequests.push({ url: failedUrl, error: params.errorText ?? 'failed' }); });
    session.on('Network.responseReceived', (params) => { const status = params.response?.status ?? 0; const responseUrl = params.response?.url ?? '?'; if (status >= 400 && !/favicon.ico$/i.test(responseUrl)) failedRequests.push({ url: responseUrl, error: `HTTP ${status}` }); });

    const results = [];
    for (const viewport of viewports) {
      const vpStarted = Date.now();
      const mobile = viewport.width < 700;
      await session.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile });
      await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
      await navigateAndSettle(session, pageUrl, { timeoutMs, settleMs });
      try { await session.evaluate(SCROLL_THROUGH_SCRIPT, { awaitPromise: true, timeoutMs: 15000 }); } catch { /* scrolling is best-effort */ }
      await new Promise((r) => setTimeout(r, 250));
      let metrics = {};
      try { metrics = JSON.parse(await session.evaluate(METRICS_SCRIPT)); } catch (error) { metrics = { error: String(error?.message ?? error) }; }
      const topPath = path.join(shotsDir, `${viewport.name}-top.png`);
      try {
        const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(topPath, Buffer.from(shot.data, 'base64'));
      } catch (error) { metrics.screenshotError = String(error?.message ?? error); }
      let fullPath;
      if (fullPage) {
        const docHeight = Math.min(Number(metrics?.viewport?.docHeight ?? viewport.height) || viewport.height, 6000);
        fullPath = path.join(shotsDir, `${viewport.name}-full.png`);
        try {
          const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: viewport.width, height: docHeight, scale: 1 } }, 40000);
          fs.writeFileSync(fullPath, Buffer.from(shot.data, 'base64'));
        } catch (error) { metrics.fullScreenshotError = String(error?.message ?? error); fullPath = undefined; }
      }
      let reducedMotion;
      if (reducedMotionCheck && viewport === viewports[0]) {
        try {
          await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
          await navigateAndSettle(session, pageUrl, { timeoutMs, settleMs: 500 });
          const chars = await session.evaluate('(document.body.innerText || "").replace(/\\s+/g, " ").trim().length');
          const hidden = await session.evaluate('[...document.body.querySelectorAll("*")].filter((el) => { const cs = getComputedStyle(el); return el.textContent.trim().length > 20 && Number(cs.opacity) < 0.1 && cs.display !== "none"; }).length');
          reducedMotion = { bodyTextChars: chars, invisibleTextBlocks: hidden };
          await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
        } catch (error) { reducedMotion = { error: String(error?.message ?? error) }; }
      }
      results.push({ name: viewport.name, width: viewport.width, height: viewport.height, screenshot: topPath, fullScreenshot: fullPath, metrics, reducedMotion, ms: Date.now() - vpStarted });
    }
    const dedupe = (list) => [...new Set(list.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))))].slice(0, 20).map((item) => { try { return item.startsWith('{') ? JSON.parse(item) : item; } catch { return item; } });
    return {
      ok: true, available: true, browser: launched.browser.label, url: pageUrl, entry: entryRel, outDir: shotsDir,
      viewports: results,
      console: { errors: dedupe(consoleLog.errors), warnings: dedupe(consoleLog.warnings) },
      failedRequests: dedupe(failedRequests),
      ms: Date.now() - started,
    };
  } finally {
    try { session?.close(); } catch {}
    try { await launched?.close(); } catch {}
    try { await server?.close(); } catch {}
  }
}

async function navigateAndSettle(session, url, { timeoutMs, settleMs }) {
  await session.send('Page.navigate', { url });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let state = 'loading';
    try { state = await session.evaluate('document.readyState'); } catch { /* navigating */ }
    if (state === 'complete') break;
    await new Promise((r) => setTimeout(r, 60));
  }
  try { await session.evaluate('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true', { awaitPromise: true, timeoutMs: 8000 }); } catch { /* fonts are best-effort */ }
  await new Promise((r) => setTimeout(r, settleMs));
}

/** Compact, prompt-ready digest of a render result (no screenshots). */
export function describeRender(render, { maxChars = 2600 } = {}) {
  if (!render?.ok) return `render unavailable: ${render?.reason ?? 'unknown'}`;
  const lines = [`Rendered with ${render.browser} at ${render.viewports.map((v) => `${v.name} ${v.width}x${v.height}`).join(', ')} (${render.ms} ms)`];
  for (const vp of render.viewports) {
    const m = vp.metrics ?? {};
    const v = m.viewport ?? {};
    lines.push(`[${vp.name}] doc ${v.docHeight ?? '?'}px tall, ${v.horizontalOverflow ? `HORIZONTAL OVERFLOW (scrollWidth ${v.scrollWidth} > ${v.width})` : 'no horizontal overflow'}; first viewport: ${m.firstViewport?.textChars ?? '?'} chars, heading "${m.firstViewport?.headingText ?? ''}", hero ${m.firstViewport?.heroHeightRatio ?? '?'}x viewport, ${m.firstViewport?.ctaCount ?? 0} CTA(s) ${(m.firstViewport?.ctaLabels ?? []).map((c) => `"${c}"`).join(' ')}`);
    if (vp === render.viewports[0]) {
      lines.push(`  headings: ${(m.headings?.list ?? []).map((h) => `h${h.level} ${h.px}px "${h.text.slice(0, 40)}"`).join(' | ').slice(0, 500)}`);
      lines.push(`  sections: ${(m.sections ?? []).map((s) => `${s.el} ${s.height}px/${s.textChars}ch${s.empty ? ' EMPTY' : ''}`).join(', ').slice(0, 700)}`);
      lines.push(`  type: body ${m.text?.bodyFontPx ?? '?'}px, min ${m.text?.minFontPx ?? '?'}px, max ${m.text?.maxFontPx ?? '?'}px, h1 ${m.headings?.h1Px ?? '?'}px, families ${(m.text?.families ?? []).join(', ')}, widest paragraph ${m.text?.maxParagraphWidthCh ?? '?'}ch`);
      lines.push(`  color: theme ${m.colors?.theme ?? '?'} bg ${m.colors?.bodyBackground ?? ''}, ${m.colors?.distinctBackgrounds ?? '?'} backgrounds, ${m.colors?.gradients ?? 0} gradients, ${m.colors?.blurCount ?? 0} glass (backdrop-filter), ${m.colors?.softBlurCount ?? 0} soft-blur layers, accents ${(m.colors?.accents ?? []).map((a) => `${a.color}(hue ${a.hue})`).join(' ') || 'none'}`);
      lines.push(`  layout: ${m.layout?.cardLike ?? 0} card-like blocks (${m.layout?.identicalCards ?? 0} identical), ${m.layout?.uniformGrids ?? 0} uniform grids, ${m.layout?.absoluteDecor ?? 0} absolute decor, canvas ${m.layout?.canvas ?? 0}, 3d transforms ${m.layout?.transforms3d ?? 0}, images ${m.layout?.images ?? 0} (${m.layout?.brokenImages ?? 0} broken)`);
      lines.push(`  motion: ${m.motion?.animatedElements ?? 0} animated, ${m.motion?.transitionElements ?? 0} with transitions, reduced-motion rule ${m.motion?.reducedMotionRule ? 'yes' : 'NO'}`);
      lines.push(`  contrast: ${m.contrast?.checked ?? 0} checked, ${(m.contrast?.failures ?? []).length} failures ${(m.contrast?.failures ?? []).slice(0, 3).map((f) => `${f.el} ${f.ratio}:1 "${f.text}"`).join('; ')}`);
      lines.push(`  a11y: ${m.a11y?.imagesWithoutAlt ?? 0} img w/o alt, ${m.a11y?.inputsWithoutLabel ?? 0} inputs w/o label, landmarks main=${m.a11y?.landmarks?.main ?? 0} nav=${m.a11y?.landmarks?.nav ?? 0}, skip link ${m.interactive?.hasSkipLink ? 'yes' : 'no'}, focus-visible ${m.interactive?.focusVisibleRule ? 'yes' : 'no'}`);
    }
    if (vp.name === 'mobile') lines.push(`  mobile: ${m.interactive?.smallTapTargets ?? 0} small tap targets ${(m.interactive?.smallSamples ?? []).join(', ')}`);
    if (vp.reducedMotion) lines.push(`  reduced-motion: ${vp.reducedMotion.invisibleTextBlocks ?? 0} invisible text blocks, ${vp.reducedMotion.bodyTextChars ?? '?'} chars visible`);
  }
  if (render.console.errors.length) lines.push(`console errors (${render.console.errors.length}): ${render.console.errors.slice(0, 4).join(' | ')}`);
  if (render.failedRequests.length) lines.push(`failed requests (${render.failedRequests.length}): ${render.failedRequests.slice(0, 4).map((f) => `${f.url} ${f.error}`).join(' | ')}`);
  const text = lines.join('\n');
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[render digest truncated]` : text;
}
