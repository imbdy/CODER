#!/usr/bin/env node
/** CLI entry — loads .env, then delegates to the canonical CLI (src/terminal/cli.mjs). */
import { loadEnvFile } from '../src/core/env.mjs';

// Before anything reads process.env. A real exported variable still wins.
loadEnvFile();

const { main } = await import('../src/terminal/cli.mjs');
process.exitCode = await main();
