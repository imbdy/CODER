/**
 * Load a `.env` file, if there is one.
 *
 * There was no .env support at all: keys had to be exported into the shell
 * before every command, which is invisible, easy to lose and impossible to share
 * with a teammate as "copy this file and fill it in".
 *
 * Node 20.12+ can parse the file itself, so this needs no dependency. Real
 * environment variables always win — a value already exported in the shell is a
 * deliberate override and must not be replaced by the file.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} [dir] where to look for the file (defaults to the process cwd)
 * @returns {{loaded: string|undefined, keys: string[]}}
 */
export function loadEnvFile(dir = process.cwd()) {
  const file = path.resolve(dir, '.env');
  if (!fs.existsSync(file)) return { loaded: undefined, keys: [] };
  const before = new Set(Object.keys(process.env));
  try {
    // Native parser: handles quotes, `export ` prefixes and comments.
    process.loadEnvFile(file);
  } catch {
    // Older Node, or a file it refuses: fall back to a minimal parser rather
    // than failing the whole command over a config convenience.
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const key = match[1];
      if (before.has(key)) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
  const keys = Object.keys(process.env).filter((key) => !before.has(key));
  return { loaded: file, keys };
}

/** A value safe to print: length and prefix only, never the secret itself. */
export function describeSecret(value) {
  const raw = String(value ?? '');
  if (!raw) return 'not set';
  return `set (${raw.length} chars, starts "${raw.slice(0, 3)}…")`;
}
