#!/usr/bin/env node
import { run } from './index.js';

// run() is async (init/status touch the filesystem); await so process errors
// surface instead of silently swallowing. bin is ESM top-level await.
process.exitCode = await run(process.argv.slice(2));
