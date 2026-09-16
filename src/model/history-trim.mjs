/**
 * History trimming for 7B context window.
 * Qwen2.5-7B has 32k total but practical ctx is 8-16k; we keep budget small.
 * Strategy: keep system + last N turns verbatim, summarize older turns into 1 paragraph.
 */

export function estimateTokens(text) {
  // ~4 chars per token heuristic
  return Math.ceil(String(text ?? '').length / 4);
}

export function trimHistory(messages, { maxTokens = 6000, keepLast = 4, maxMessages = 10 } = {}) {
  if (!Array.isArray(messages)) return [];
  if (messages.length <= maxMessages && totalTokens(messages) <= maxTokens) return messages;

  // Always keep system (index 0 if role system) and last keepLast messages
  const system = messages.find((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');
  const tail = nonSystem.slice(-keepLast);
  const head = nonSystem.slice(0, -keepLast);

  if (!head.length) return messages.slice(-maxMessages);

  const summary = summarizeTurns(head);
  const summarized = { role: 'user', content: `[HISTORY SUMMARY — ${head.length} earlier turns compressed]: ${summary}` };

  const out = [];
  if (system) out.push(system);
  out.push(summarized);
  out.push(...tail);

  // Still over budget? drop oldest tail entries until fit
  while (out.length > maxMessages || totalTokens(out) > maxTokens) {
    // remove second element (after system+summary) — the oldest tail
    const idx = system ? 2 : 1;
    if (out.length <= (system ? 3 : 2)) break;
    out.splice(idx, 1);
  }
  return out;
}

function totalTokens(messages) {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content ?? ''), 0);
}

function summarizeTurns(turns) {
  // Extract key facts: files written, tool calls, decisions
  const facts = [];
  for (const t of turns) {
    const c = String(t.content ?? '').slice(0, 400);
    if (t.role === 'assistant' && c.includes('[wrote')) facts.push(c.slice(0, 120));
    if (t.role === 'user' && c.includes('Tool results')) facts.push(c.slice(0, 120));
    if (t.role === 'user' && c.startsWith('REQUEST:')) facts.push(c.slice(0, 120));
  }
  if (!facts.length) return turns.map((t) => `${t.role}: ${String(t.content ?? '').slice(0, 80)}`).join(' | ').slice(0, 600);
  return facts.join(' | ').slice(0, 800);
}
