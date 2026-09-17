/**
 * Terminal wiring: the REPL drives ONE session through discussion → build →
 * refinement against the scripted mock model, streaming replies and keeping
 * history. Also checks that a broken Ollama stream fails loudly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { OllamaProvider } from '../../src/model/ollama.mjs';
import { startMockModel } from '../helpers/mock-model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('terminal: one session — discuss, build, refine — with streamed replies', { timeout: 240000 }, async () => {
  const folder = path.join(root, 'agent-test-results', 'terminal-flow');
  const ws = path.join(folder, 'site');
  fs.rmSync(ws, { recursive: true, force: true });
  fs.mkdirSync(ws, { recursive: true });
  const mock = await startMockModel();
  let output = '';
  const child = spawn(process.execPath, [path.join(root, 'bin/artisan.mjs'), 'chat', '--workspace', ws, '--no-color'], {
    cwd: root,
    env: { ...process.env, ARTISAN_PROVIDERS: 'openaiCompatible', ARTISAN_BASE_URL: mock.baseUrl, ARTISAN_API_KEY: 'test', ARTISAN_MODEL: mock.model },
  });
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  const lines = [
    'hi',
    'build it',
    'I want a landing page for an AI developer tool.',
    'I want it premium and cinematic.',
    'But not the usual purple AI SaaS design.',
    'Use subtle 3D depth and smooth motion.',
    'I want typography to remain the main visual focus.',
    'Okay, go build it.',
    'Make the hero more immersive.',
    'Do it.',
    '/status',
    '/exit',
  ];
  child.stdin.end(`${lines.join('\n')}\n`);
  try {
    await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'result.json'), JSON.stringify({ calls: mock.record.calls, output }, null, 2));
    assert.match(output, /artisan> Hey! Ready when you are/, 'greeting reply shown');
    assert.match(output, /haven't decided what we're building yet/i, 'empty-context build refused');
    assert.match(output, /Done — built via openai-compatible/, 'build summary printed');
    assert.match(output, /Skills loaded \(model\)/);
    assert.match(output, /Visual QA: /);
    assert.match(output, /say "do it"/i, 'refinement discussed first');
    assert.match(output, /Done — refined via openai-compatible/, 'refinement applied in place');
    assert.match(output, /build exists/, '/status reflects the session');
    assert.ok(!/```json/.test(output), 'control JSON never printed');
    for (const f of ['index.html', 'styles/main.css', 'scripts/main.js']) assert.ok(fs.existsSync(path.join(ws, f)), `${f} exists`);
    assert.ok(fs.readFileSync(path.join(ws, 'index.html'), 'utf8').includes('layer--c'), 'refinement edited the existing file');
    assert.ok(mock.record.prompts.filter((p) => /IMPLEMENTATION phase/.test(p.full.system)).length >= 3, 'implementation turns happened');
  } finally {
    child.kill();
    await mock.close();
  }
});

test('ollama streaming failure surfaces the root cause', { timeout: 20000 }, async () => {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'broken-stream' }] }));
    res.setHeader('content-type', 'application/x-ndjson');
    res.write(`${JSON.stringify({ message: { content: 'partial' }, done: false })}\n`);
    setTimeout(() => res.end(`${JSON.stringify({ error: 'generation interrupted' })}\n`), 30);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const provider = new OllamaProvider({ host: `http://127.0.0.1:${server.address().port}`, model: 'broken-stream' });
    let partial = '';
    await assert.rejects(provider.generate({ prompt: 'probe', onToken: (text) => { partial += text; } }), /interrupted|stream/i);
    assert.equal(partial, 'partial');
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});
