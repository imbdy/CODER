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
