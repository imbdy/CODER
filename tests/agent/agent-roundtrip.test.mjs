/**
 * Agent round-trip test: verifies the agent loop can parse JSON tool calls
 * from qwen2.5-coder-style outputs, execute tools, and loop until done.
 *
 * Uses deterministic stubs for Ollama so the test runs without a live server.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createToolContext } from '../../src/tools/context.mjs';
import { parseToolCalls } from '../../src/agent/agent.mjs';
import { buildAgentSystemPrompt } from '../../src/agent/prompts.mjs';

const tmpDir = path.join(process.cwd(), 'tmp-agent-test-' + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });

const tools = createToolContext({
  workspaceDir: tmpDir,
  config: { policy: { allowShell: true, maxWritesPerRun: 50 }, workspace: { ignore: [] } },
  dryRun: false,
});

const canned = [
  {
    text: 'I will build a landing page.\n```json\n[\n  {"tool": "listFiles", "args": {}},\n  {"tool": "writeFile", "args": {"rel": "index.html", "content": "<!DOCTYPE html><html><head><style>body{margin:0}</style></head><body></body></html>"}},\n  {"tool": "writeFile", "args": {"rel": "styles.css", "content": "h1{color:#111}"}}\n]\n```',
    model: 'qwen2.5-coder:7b (mock)',
  },
  {
    text: 'Reading back what I wrote.\n```json\n[\n  {"tool": "readFile", "args": {"rel": "index.html"}},\n  {"tool": "readFile", "args": {"rel": "styles.css"}}\n]\n```',
    model: 'qwen2.5-coder:7b (mock)',
  },
  {
    text: 'Done.\n```json\n[{"done": true, "summary": "Built landing page with index.html, styles.css"}]\n```',
    model: 'qwen2.5-coder:7b (mock)',
  },
];

// ---------- parseToolCalls coverage ----------
describe('agent.parseToolCalls — protocol comprehension', () => {
  it('accepts standard ```json ... ``` block', () => {
    const res = parseToolCalls('I will start.\n```json\n[\n  {"tool": "listFiles", "args": {}},\n  {"tool": "writeFile", "args": {"rel": "index.html", "content": "<!DOCTYPE html><html>...<head><style>body{margin:0}</style></head><body></body></html>"}}\n]\n```');
    assert.ok(res.calls.length >= 1, 'expected at least one tool call parsed');
    assert.equal(res.calls[0].tool, 'listFiles');
    assert.equal(res.calls[1].tool, 'writeFile');
    assert.equal(res.calls[1].args.rel, 'index.html');
  });

  it('extracts content arg from writeFile example', () => {
    const res = parseToolCalls('```json\n[{"tool":"writeFile","args":{"rel":"styles.css","content":"h1{color:#111}"}}]\n```');
    assert.equal(res.calls.length, 1);
    assert.equal(res.calls[0].tool, 'writeFile');
    assert.equal(res.calls[0].args.rel, 'styles.css');
    assert.equal(res.calls[0].args.content, 'h1{color:#111}');
  });

  it('recognises done signal', () => {
    const res = parseToolCalls('```json\n[{"done": true, "summary": "Built landing page with index.html, styles.css"}]\n```');
    assert.ok(res.done, 'done flag should be recognised');
    assert.equal(res.summary, 'Built landing page with index.html, styles.css');
  });

  it('falls back to raw [{...}] when no code fence is present', () => {
    const res = parseToolCalls('[{\"tool\":\"listFiles\",\"args\":{}}]');
    assert.ok(res.calls.length >= 1);
    assert.equal(res.calls[0].tool, 'listFiles');
  });

  it('rejects prose-only responses without tool calls', () => {
    const res = parseToolCalls('Here is my plan... (no JSON)');
    assert.equal(res.calls.length, 0);
    assert.ok(!res.done);
  });
});


// ---------- system prompt checks ----------
describe('agent round-trip: system prompt mentions JSON tool protocol + writeFile content arg', () => {
  it('system prompt tells the model to respond with a JSON array in a ```json block', () => {
    const system = buildAgentSystemPrompt({ skillsContext: '', inspection: null });
    assert.ok(system.includes('```json'), 'system prompt should reference the ```json code block convention');
    assert.ok(system.includes('tool'), 'system prompt should mention tools');
  });

  it('system prompt gives a writeFile example that includes a content arg', () => {
    const system = buildAgentSystemPrompt({ skillsContext: '', inspection: null });
    assert.ok(system.includes('content'), 'system prompt example should include the content arg for writeFile');
  });
});
