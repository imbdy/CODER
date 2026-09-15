#!/usr/bin/env node
/** CLI entry — delegates to the canonical CLI (src/terminal/cli.mjs). */
import { main } from '../src/terminal/cli.mjs';
process.exitCode = await main();
