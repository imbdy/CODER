/**
 * Telling what a brief WANTS from what it RULES OUT.
 *
 * A design brief carries both in the same breath: "precise, mechanical, quiet —
 * absolutely no AI-SaaS look, no purple, no glass." Matching keywords against
 * the raw text reads those rejections as requests, which is how a brief for a
 * hand-built film scanner produced a page about indexing a codebase: the words
 * "no AI-SaaS look" were the strongest AI signal in the text.
 *
 * Every layer that reads intent from prose (art direction, domain detection,
 * accent choice, decoration budget) needs the same split, so it lives here with
 * tests instead of being re-implemented per layer.
 */

/** Words that flip the clause they appear in. */
const NEGATIVE = /\b(no|not|never|without|avoid|avoiding|don'?t|do not|doesn'?t|instead of|rather than|nothing|none|anti|less)\b/i;

/** A rendered agreed-context line that is itself a list of rejections. */
const REJECTION_LINE = /^\s*(rejected|avoid|not wanted|excluded)\s*:/i;

/**
 * Split prose into clauses. Sentence ends, commas, semicolons, dashes and "but"
 * all start a new one, because "quiet and expensive, no purple" must not leave
 * "purple" sitting in the same clause as "quiet".
 */
export function clausesOf(text) {
  return String(text ?? '')
    .split(/[.!?;\n]+|,\s*|\s+—\s+|\s+-\s+|\s+\b(?:but|however|though|although)\b\s+/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

/**
 * @param {string} text
 * @returns {{positive: string, negative: string, positiveClauses: string[], negativeClauses: string[]}}
 */
export function splitPolarity(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const rejectionLines = lines.filter((line) => REJECTION_LINE.test(line));
  const body = lines.filter((line) => !REJECTION_LINE.test(line)).join('\n');
  const positiveClauses = [];
  const negativeClauses = [];
  for (const clause of clausesOf(body)) {
    (NEGATIVE.test(clause) ? negativeClauses : positiveClauses).push(clause);
  }
  for (const line of rejectionLines) negativeClauses.push(line.replace(REJECTION_LINE, '').trim());
  return {
    positive: positiveClauses.join('. '),
    negative: negativeClauses.join(' | '),
    positiveClauses,
    negativeClauses,
  };
}

/**
 * Just the part of the brief that asks for something.
 *
 * When a brief is nothing BUT rejections this returns the empty string, and
 * that is deliberate: falling back to the raw text is how "REJECTED: AI-SaaS
 * look, purple, glass" still produced a purple accent. No request means no
 * signal, and the caller should take its own default rather than a rejection.
 */
export function positiveText(text) {
  return splitPolarity(text).positive;
}

/** Just the part of the brief that rules something out. */
export function negativeText(text) {
  return splitPolarity(text).negative;
}
