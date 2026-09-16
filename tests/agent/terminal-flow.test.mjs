/** One deterministic end-to-end regression. No model download or design benchmark. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { OllamaProvider } from '../../src/model/ollama.mjs';
import { runBuild } from '../../src/runtime/agent-build.mjs';
import { loadConfig } from '../../src/core/config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
test('terminal: streamed chat -> tool build -> feedback, preserving history', { timeout: 20000 }, async () => {
  const folder = path.join(root, 'agent-test-results', 'terminal-flow');
  const ws = path.join(folder, 'site');
  fs.mkdirSync(ws, { recursive: true });
  const requests = [];
  const errors = [];
  let generation = 0;
  let conversation = 0;
  let output = '';
  let streamedBeforeEnd = false;
  const html = '<!doctype html><html><head><link rel="stylesheet" href="styles/main.css"></head><body><main><h1>Orbit studio</h1><p>' + 'Thoughtful digital experiences for independent creators. '.repeat(6) + '</p><button id="toggle">Show details</button><p id="detail" hidden>Made with care.</p></main><script type="module" src="scripts/main.js"></script></body></html>';
  const css = ':root { --ink: #17212b; } body { color: var(--ink); display: grid; } @media(max-width:600px){body{padding:1rem}} @media(prefers-reduced-motion:reduce){*{transition:none}}';
  const js = 'const b=document.querySelector("#toggle"), p=document.querySelector("#detail"); if(b&&p)b.addEventListener("click",()=>{p.hidden=!p.hidden});';
  const json = (value) => '```json\n' + JSON.stringify(value) + '\n```';
  const server = http.createServer(async (req, res) => {
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'qwen2.5-coder:7b' }] }));
    let body = ''; for await (const chunk of req) body += chunk;
    const data = JSON.parse(body); requests.push(data);
    if (data.model === 'broken-stream') {
      res.setHeader('content-type', 'application/x-ndjson');
      res.write(JSON.stringify({ message: { content: 'partial' }, done: false }) + '\n');
      return setTimeout(() => res.end(JSON.stringify({ error: 'generation interrupted' }) + '\n'), 30);
    }
    const messages = data.messages ?? [];
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    const isChat = system.includes('buildSite');
    let text;
    if (isChat) {
      conversation++;
      if (conversation === 1) text = 'Hello Orbit! We can talk without editing anything.';
      else if (conversation === 2) {
        if (!messages.some((m) => m.content.includes('Hello Orbit!'))) errors.push('chat history missing');
        text = json([{ tool: 'buildSite', args: { request: 'Build Orbit with separated CSS and JS.' } }]);
      } else {
        if (!messages.some((m) => /Built|done/.test(m.content))) errors.push('build result absent from chat history');
        text = json([{ tool: 'buildSite', args: { request: 'Change Orbit accent to blue; preserve the rest.' } }]);
      }
    } else {
      generation++;
      const table = [
        [{ tool: 'readSkill', args: { id: 'css' } }, { tool: 'list_directory', args: {} }],
        [{ tool: 'write_file', args: { path: 'index.html', content: html } }, { tool: 'write_file', args: { path: 'styles/main.css', content: css } }, { tool: 'write_file', args: { path: 'scripts/main.js', content: js } }],
        [{ tool: 'read_file', args: { path: 'index.html' } }, { tool: 'run_bash', args: { command: 'node', args: ['--check', 'scripts/main.js'] } }, { done: true, summary: 'Built Orbit. Preview the static site.' }],
        [{ tool: 'read_file', args: { path: 'styles/main.css' } }],
        [{ tool: 'edit_file', args: { path: 'styles/main.css', edits: [{ oldText: '#17212b', newText: '#245cbb' }] } }],
        [{ done: true, summary: 'Updated Orbit accent to blue.' }],
      ];
      text = json(table[generation - 1] ?? [{ done: true, summary: 'Finished' }]);
    }
    if (data.stream) {
      res.setHeader('content-type', 'application/x-ndjson');
      res.write(JSON.stringify({ message: { content: text }, done: false }) + '\n');
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (conversation === 1 && isChat) streamedBeforeEnd = output.includes('Hello Orbit!');
      res.end(JSON.stringify({ message: { content: '' }, done: true }) + '\n');
    } else res.end(JSON.stringify({ message: { content: text } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const child = spawn(process.execPath, [path.join(root, 'bin/artisan.mjs'), 'chat', '--workspace', ws, '--no-color'], {
    cwd: root, env: { ...process.env, ARTISAN_PROVIDERS: 'ollama', ARTISAN_OLLAMA_HOST: `http://127.0.0.1:${server.address().port}` },
  });
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  child.stdin.end('hi\nBuild Orbit for independent creators\nmake it blue\n/exit\n');
  try {
    await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
    const provider = new OllamaProvider({ host: `http://127.0.0.1:${server.address().port}`, model: 'broken-stream' });
    let partial = '';
    await assert.rejects(provider.generate({ prompt: 'probe', onToken: (text) => { partial += text; } }), /interrupted|stream/i);
    assert.equal(partial, 'partial');
    assert.equal(conversation, 3, 'all natural language must reach the conversational model');
    assert.equal(streamedBeforeEnd, true, 'reply must display before stream completion');
    assert.deepEqual(errors, []);
    assert.equal(generation, 6);
    assert.match(fs.readFileSync(path.join(ws, 'styles/main.css'), 'utf8'), /#245cbb/);
    assert.equal(fs.readFileSync(path.join(ws, 'scripts/main.js'), 'utf8'), js);
    assert.ok(!output.includes('unknown tool'));
    generation = 3; // Replay the same read -> edit -> done sequence via the public build API.
    fs.writeFileSync(path.join(ws, 'styles/main.css'), css);
    const config = loadConfig({ workspaceDir: ws, overrides: { models: { order: ['ollama'], ollama: { host: `http://127.0.0.1:${server.address().port}` } } } });
    const edited = await runBuild('Change the accent to blue', { workspaceDir: ws, config });
    assert.equal(edited.run.status, 'done');
    assert.deepEqual(edited.run.writes.map((file) => file.rel), ['styles/main.css']);
    assert.ok(edited.run.writes[0].bytes > 0);
  } finally {
    child.kill(); server.closeAllConnections(); server.close();
    fs.writeFileSync(path.join(folder, 'result.json'), JSON.stringify({ requests: requests.length, conversation, generation, streamedBeforeEnd, errors, output }, null, 2));
  }
});
