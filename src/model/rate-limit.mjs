/**
 * Reading what a metered provider actually told us.
 *
 * Both of these existed as inline regexes in the router and both were wrong in
 * ways that cost whole builds, so they are here with tests behind them.
 */

/**
 * How long the provider said to wait, in milliseconds.
 *
 * Groq phrases exhaustion as "try again in 2m55.823999999s". A pattern that
 * only understands the seconds tail reads that as 55s and retries straight into
 * the same wall; one that treats the minutes group as optional-greedy reads
 * "431ms" as 431 MINUTES. The minutes group therefore only counts when a
 * numeric remainder follows it.
 */
export function suggestedDelayMs(message) {
  const text = String(message ?? '');
  const full = /try again in\s+(?:([\d.]+)m(?=[\d.]))?([\d.]+)\s*(ms|s)\b/i.exec(text);
  if (!full) return 0;
  const minutes = full[1] ? parseFloat(full[1]) : 0;
  const value = parseFloat(full[2]);
  const unitMs = String(full[3]).toLowerCase() === 'ms' ? 1 : 1000;
  const ms = minutes * 60000 + value * unitMs;
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0;
}

/**
 * A per-minute limit refills on its own and is worth waiting for. A per-DAY
 * limit does not: retrying it burns minutes and then reports a generic failure,
 * which is exactly how an exhausted account gets mistaken for a broken agent.
 */
export function isDailyLimit(message) {
  return /\b(?:tokens|requests) per day\b|\bTPD\b|\bRPD\b/i.test(String(message ?? ''));
}

/**
 * The standard `Retry-After` header, in milliseconds.
 *
 * Providers that do not spell the wait out in prose still send this, and it was
 * being ignored entirely: opencode's gateway answers an exhausted free tier with
 * `429 FreeUsageLimitError` and `Retry-After: 14751` — four hours — while the
 * body says only "Please try again later". With no number to parse, the router
 * fell back to a few seconds and burned every attempt against a wall that would
 * not move until tomorrow.
 *
 * Accepts both forms in the spec: delta-seconds, or an HTTP date.
 */
export function retryAfterMs(value, now = Date.now()) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const ms = Number(raw) * 1000;
    return Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0;
  }
  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, at - now);
}

/**
 * A cooldown long enough that retrying is pointless.
 *
 * A per-minute limit is worth waiting for; anything measured in hours is a quota
 * wall, and the honest move is to say so rather than spend the attempts.
 */
export function isLongCooldown(ms, thresholdMs = 120000) {
  return Number.isFinite(ms) && ms > thresholdMs;
}
