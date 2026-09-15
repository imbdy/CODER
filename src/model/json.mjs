/**
 * Tolerant JSON extraction for small local models.
 * Handles: fenced blocks, prose preambles, trailing commas, single quotes,
 * unquoted keys, smart quotes and unbalanced trailing text.
 */

function stripFences(text) {
  const fence = text.match(/```(?:json|jsonc|javascript|js|ts|tsx)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1];
  return text;
}

function findBalanced(text, openChar = '{', closeChar = '}') {
  const start = text.indexOf(openChar);
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === openChar) depth += 1;
    else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  // Unbalanced (model hit a token limit): return what we have so the repair pass can close it.
  return text.slice(start);
}

function normalize(raw) {
  let text = String(raw ?? '').trim();
  text = text.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");
  text = text.replace(/^\uFEFF/, '');
  return text;
}

function repair(text) {
  let out = text;
  // remove // and /* */ comments that are not inside strings (best effort, line based)
  out = out
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n');
  // trailing commas
  out = out.replace(/,\s*([}\]])/g, '$1');
  // unquoted keys
  out = out.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)\s*:/g, '$1"$2":');
  // single quoted strings -> double quoted
  out = out.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match, inner) => `"${inner.replace(/"/g, '\\"')}"`);
  // python-ish literals
  out = out.replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false');
  return out;
}

function closeUnbalanced(text) {
  let open = 0;
  let openBracket = 0;
  let inString = false;
  let quote = '';
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === '"' || char === "'") { inString = true; quote = char; continue; }
    if (char === '{') open += 1;
    else if (char === '}') open -= 1;
    else if (char === '[') openBracket += 1;
    else if (char === ']') openBracket -= 1;
  }
  let fixed = text;
  if (inString) fixed += quote;
  fixed = fixed.replace(/,\s*$/, '');
  fixed += ']'.repeat(Math.max(0, openBracket));
  fixed += '}'.repeat(Math.max(0, open));
  return fixed;
}

/**
 * @returns {{ok: boolean, value?: any, error?: string, strategy?: string, raw: string}}
 */
export function extractJson(input) {
  const raw = normalize(input);
  if (!raw) return { ok: false, error: 'empty response', raw };

  const candidates = [];
  const unfenced = stripFences(raw).trim();
  candidates.push({ text: unfenced, strategy: 'direct' });
  candidates.push({ text: repair(unfenced), strategy: 'repaired' });

  const objectText = findBalanced(unfenced, '{', '}') ?? findBalanced(unfenced, '[', ']');
  if (objectText) {
    candidates.push({ text: objectText.trim(), strategy: 'balanced' });
    candidates.push({ text: repair(objectText).trim(), strategy: 'balanced+repaired' });
    candidates.push({ text: closeUnbalanced(repair(objectText).trim()), strategy: 'balanced+closed' });
  }

  for (const candidate of candidates) {
    if (!candidate.text) continue;
    try {
      const value = JSON.parse(candidate.text);
      return { ok: true, value, strategy: candidate.strategy, raw };
    } catch {
      /* try next candidate */
    }
  }

  // Last resort: try to salvage the first key/value pairs into an object.
  const salvaged = salvageKeyValues(unfenced);
  if (salvaged) return { ok: true, value: salvaged, strategy: 'salvaged', raw };

  return { ok: false, error: 'unparseable JSON', raw };
}

function salvageKeyValues(text) {
  const pairs = [...text.matchAll(/"([A-Za-z0-9_$-]+)"\s*:\s*("(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?)/g)];
  if (pairs.length < 2) return undefined;
  const out = {};
  for (const [, key, value] of pairs) {
    try {
      out[key] = JSON.parse(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

/** Extract the first fenced code block of a given language (or any code block). */
export function extractCodeBlock(text, languages = ['tsx', 'jsx', 'ts', 'js', 'css', 'html', 'json']) {
  const pattern = new RegExp(`\`\`\`(${languages.join('|')})?\\s*([\\s\\S]*?)\`\`\``, 'i');
  const match = String(text ?? '').match(pattern);
  if (match) return match[2].trim();
  return String(text ?? '').trim();
}