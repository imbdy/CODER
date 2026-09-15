/**
 * Minimal YAML front-matter reader for SKILL.md files.
 *
 * Deliberately small but forgiving: scalars, quoted strings, booleans, numbers,
 * inline arrays `[a, b]`, dash lists and one level of nested maps. SKILL.md files
 * are hand-written, so we never throw on malformed input — we degrade to strings.
 */

function coerce(value) {
  const text = String(value).trim();
  if (/^".*"$/.test(text) || /^'.*'$/.test(text)) return text.slice(1, -1);
  if (text === '' ) return '';
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((part) => coerce(part));
  }
  return text;
}

export function parseFrontmatter(source) {
  const text = String(source ?? '').replace(/^\uFEFF/, '');
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!match) return { data: {}, body: text.trim(), hasFrontmatter: false };

  const data = {};
  let currentKey;
  let currentList;
  let currentMap;

  const flushList = () => {
    if (currentKey && currentList) data[currentKey] = currentList;
    currentList = undefined;
  };
  const flushMap = () => {
    if (currentKey && currentMap) data[currentKey] = currentMap;
    currentMap = undefined;
  };

  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, (_m, offset) => (offset > 0 && rawLine[offset - 1] !== ' ' ? '' : rawLine.slice(offset)));
    if (!line.trim()) continue;

    const listItem = line.match(/^\s*-\s+(.*)$/);
    const mapItem = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    const topItem = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);

    if (topItem && !/^\s/.test(line)) {
      flushList();
      flushMap();
      const [, key, valueRaw] = topItem;
      currentKey = key;
      const value = valueRaw.trim();
      if (!value) {
        // could become a list or map; decide on the next line
        currentList = undefined;
        currentMap = undefined;
        data[key] = undefined;
        continue;
      }
      data[key] = coerce(value);
      currentList = undefined;
      currentMap = undefined;
      continue;
    }

    if (listItem && currentKey) {
      currentList = currentList ?? [];
      currentList.push(coerce(listItem[1]));
      data[currentKey] = currentList;
      continue;
    }

    if (mapItem && currentKey) {
      currentMap = currentMap ?? {};
      currentMap[mapItem[1]] = coerce(mapItem[2]);
      data[currentKey] = currentMap;
      continue;
    }

    if (currentKey && typeof data[currentKey] === 'string') {
      data[currentKey] = `${data[currentKey]} ${line.trim()}`.trim();
    }
  }

  flushList();
  flushMap();
  return { data, body: text.slice(match[0].length).trim(), hasFrontmatter: true };
}

export function renderFrontmatter(data) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) lines.push(`${key}: [${value.map((item) => String(item)).join(', ')}]`);
    else if (typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [innerKey, innerValue] of Object.entries(value)) lines.push(`  ${innerKey}: ${innerValue}`);
    } else lines.push(`${key}: ${value}`);
  }
  lines.push('---');
  return lines.join('\n');
}