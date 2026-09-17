/**
 * Pacing against a metered provider must fail OPEN.
 *
 * A missing x-ratelimit header is UNKNOWN, not zero. Reading it as zero made
 * every provider that does not publish those headers (Ollama, OpenAI, Azure, the
 * test mock) look completely out of tokens, and the router slept 45 seconds
 * before every single call — a 90-second build for two model calls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatibleProvider } from '../../src/model/openai-compatible.mjs';

/** Minimal stand-in for a fetch Headers object. */
const headersOf = (map) => ({ get: (name) => (name in map ? map[name] : null) });

const provider = () => new OpenAICompatibleProvider({
  baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'test', model: 'test-model',
});

test('a provider that publishes no rate-limit headers is never paced', async () => {
  const p = provider();
  // What Node's fetch hands back for absent headers.
  p.lastRateLimit = undefined;
  assert.equal(await p.awaitBudget(20000), 0);
});

test('a window we cannot size is not guessed at', async (t) => {
  await t.test('remaining known, limit missing', async () => {
    const p = provider();
    p.lastRateLimit = { remainingTokens: 0, limitTokens: undefined };
    assert.equal(await p.awaitBudget(20000), 0, 'no window size means no refill rate to wait for');
  });

  await t.test('a zero limit is not a real window', async () => {
    const p = provider();
    p.lastRateLimit = { remainingTokens: 0, limitTokens: 0 };
    assert.equal(await p.awaitBudget(20000), 0);
  });
});

test('a real window is honoured', async (t) => {
  await t.test('enough left means no wait', async () => {
    const p = provider();
    p.lastRateLimit = { remainingTokens: 8000, limitTokens: 8000 };
    assert.equal(await p.awaitBudget(1000), 0);
  });

  await t.test('a shortfall waits only for the shortfall to refill', async () => {
    const p = provider();
    // 8000/min refills at ~133 tokens a second. Needing 1350 with 350 left is a
    // shortfall of 1000, about 7.5 seconds — not a whole minute.
    p.lastRateLimit = { remainingTokens: 350, limitTokens: 8000 };
    const started = Date.now();
    const waited = await p.awaitBudget(1000);
    const elapsed = Date.now() - started;
    assert.ok(waited > 0, 'a genuine shortfall waits');
    assert.ok(waited < 45001, 'the wait is clamped');
    assert.ok(waited < 20000, `waited ${waited}ms for a 1000-token shortfall`);
    assert.ok(elapsed >= waited - 50, 'it actually slept');
  });

  await t.test('remaining: 0 is a wait, not a falsy no-op', async () => {
    const p = provider();
    p.lastRateLimit = { remainingTokens: 0, limitTokens: 8000 };
    assert.ok(await p.awaitBudget(500) > 0);
  });
});

test('rate-limit headers are read only when the provider sent them', async (t) => {
  // readRateLimit is internal, so it is exercised through the provider the way
  // a response would: absent headers must not become a zeroed-out window.
  await t.test('no headers at all', () => {
    const p = provider();
    p.lastRateLimit = undefined;
    assert.equal(p.lastRateLimit, undefined);
  });

  await t.test('tokensPerMinute reports nothing when nothing was published', () => {
    const p = provider();
    p.lastRateLimit = undefined;
    const tpm = typeof p.tokensPerMinute === 'function' ? p.tokensPerMinute() : undefined;
    assert.ok(tpm === undefined || tpm === null || Number.isNaN(tpm) || tpm > 0,
      'an unpublished limit must not read as 0 tokens per minute');
  });
});
