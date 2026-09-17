import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestedDelayMs, isDailyLimit } from '../../src/model/rate-limit.mjs';

test('the suggested delay is read as the provider wrote it', async (t) => {
  await t.test('a minutes-and-seconds duration is not truncated to its seconds tail', () => {
    // Read as 55s, a retry goes straight back into the same wall.
    assert.equal(suggestedDelayMs('Please try again in 2m55.823999999s.'), 175824);
  });
  await t.test('plain seconds', () => {
    assert.equal(suggestedDelayMs('Please try again in 7.66s'), 7660);
  });
  await t.test('milliseconds are not mistaken for minutes', () => {
    // A greedy optional minutes group turns 431ms into 431 minutes.
    assert.equal(suggestedDelayMs('Please try again in 431ms'), 431);
  });
  await t.test('no duration mentioned', () => {
    assert.equal(suggestedDelayMs('Rate limit reached'), 0);
    assert.equal(suggestedDelayMs(undefined), 0);
  });
});

test('a daily quota is distinguished from a per-minute one', () => {
  const daily = 'Rate limit reached for model `openai/gpt-oss-120b` ... on tokens per day (TPD): Limit 200000, Used 200000, Requested 407.';
  const minute = 'Rate limit reached ... on tokens per minute (TPM): Limit 8000, Used 7900, Requested 400.';
  assert.equal(isDailyLimit(daily), true);
  assert.equal(isDailyLimit(minute), false);
  assert.equal(isDailyLimit('requests per day exceeded'), true);
  assert.equal(isDailyLimit(''), false);
});
