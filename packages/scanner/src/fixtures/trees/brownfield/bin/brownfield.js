#!/usr/bin/env node
/**
 * Synthetic brownfield CLI entry (fixture content only — never executed by
 * the scanner tests).
 */
import { createApp } from '../src/app.js';

const port = Number(process.env.PORT ?? '3000');
createApp().listen(port, () => {
  console.log(`brownfield listening on :${port}`);
});