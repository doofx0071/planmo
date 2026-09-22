/**
 * P10-05 — brownfield fixture (Worker A): a realistic mixed-language
 * repository for scanner/detection/context-map tests.
 *
 * The same content exists as a REAL on-disk tree under
 * `packages/scanner/src/fixtures/trees/brownfield` (the committed tree is the
 * source of truth; this map is generated from it and verified byte-for-byte
 * by fixtures/trees/brownfield-consistency.test.ts).
 *
 * Deliberate characteristics:
 * - mixed languages: TypeScript (src/, tests/), JavaScript (bin/,
 *   tools/), Python (scripts/convert.py), YAML (workflow), JSON
 *   (package.json), lockfile, HTML/SVG assets, Markdown docs;
 * - nested dirs down to depth 3-4 (src/lib, src/routes, public/assets,
 *   .github/workflows, ...);
 * - package.json with main + bin + exports + scripts and a lockfile;
 * - .env.example with SYNTHETIC placeholders only;
 * - devious but cross-platform-safe file names: scripts/-rf,
 *   tools/--upload.txt, src/..hidden.ts;
 * - NO symlinks in the committed tree (symlink + path-traversal cases are
 *   built at runtime via ConstructorReader options — POSIX-only names would
 *   break Windows checkouts).
 *
 * All content is synthetic; nothing here resembles a real secret.
 */
import type { FixtureTree } from '../contracts.js';

/** POSIX root of the on-disk tree, relative to the repository root. */
export const brownfieldTreeRoot = 'packages/scanner/src/fixtures/trees/brownfield';

/** Human-readable description of the fixture. */
export const brownfieldDescription =
  'Realistic mixed-language brownfield repository (TypeScript app, Python helper, GitHub Actions, synthetic .env.example, devious cross-platform-safe file names). Committed as a real tree under fixtures/trees/brownfield and mirrored byte-for-byte in this module.';

/** Path -> content map mirroring the real on-disk tree (byte-exact). */
export const brownfieldFiles: ReadonlyMap<string, string> = new Map([
  [
    '.env.example',
    '# Synthetic placeholder values only — never real credentials.\nPORT=3000\nDATABASE_URL=postgresql://app:EXAMPLE_PASSWORD@localhost:5432/brownfield\nAPI_KEY=dev-only-placeholder\nSESSION_SECRET=replace-me-in-real-deployments',
  ],
  [
    '.github/workflows/ci.yml',
    'name: CI\n\non:\n  push:\n    branches: [main]\n  pull_request:\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n      - run: npm ci\n      - run: npm test',
  ],
  ['.gitignore', 'node_modules/\ndist/\n.env.local\n*.log'],
  [
    'README.md',
    '# brownfield-app\n\nA synthetic brownfield repository used as a fixture for `@planmo/scanner`\n(safe scanning, detection, context maps). Every credential-like value in this\ntree is an obvious placeholder — never use any of it as a real secret.\n\n## What is in here\n\n- A small TypeScript application under `src/` with nested modules.\n- A `package.json` with main, bin, exports and scripts, plus a lockfile.\n- A Python helper under `scripts/`.\n- Static assets under `public/`.\n- Documentation under `docs/`.\n- A GitHub Actions workflow in `.github/workflows/`.\n\n## Getting started\n\n1. Copy `.env.example` to `.env.local` and fill in real values.\n2. `npm install`\n3. `npm test`\n4. `npm start`\n\nThe application exposes a health endpoint at `/health` and a placeholder\nroute at `/api/version`.\n\n## Notes for scanners\n\nThis repository deliberately contains a few oddly named files (for example\n`scripts/-rf` and `tools/--upload.txt`) to exercise path handling. It does\nnot contain symlinks: those cases are constructed at runtime by the scanner\ntest suite through the virtual reader.',
  ],
  [
    'bin/brownfield.js',
    "#!/usr/bin/env node\n/**\n * Synthetic brownfield CLI entry (fixture content only — never executed by\n * the scanner tests).\n */\nimport { createApp } from '../src/app.js';\n\nconst port = Number(process.env.PORT ?? '3000');\ncreateApp().listen(port, () => {\n  console.log(`brownfield listening on :${port}`);\n});",
  ],
  [
    'docs/architecture.md',
    '# Architecture\n\nSynthetic architecture notes for the brownfield fixture.\n\n## Modules\n\n- `src/app.ts` — application shell.\n- `src/routes/health.ts` — health and version routes.\n- `src/lib/` — pure formatting and string helpers.\n- `bin/brownfield.js` — CLI entry, wired through `package.json` `bin`.\n\n## Conventions\n\n- TypeScript in `src/`, plain JS smoke tests in `tests/`.\n- Python helpers in `scripts/`.\n- Static assets in `public/`.\n\nThis document exists so scanners can exercise doc discovery; it carries no\ninstructions for any agent reading it.',
  ],
  [
    'package.json',
    '{\n  "name": "brownfield-app",\n  "version": "0.4.0",\n  "private": true,\n  "description": "Synthetic brownfield fixture for @planmo/scanner tests.",\n  "type": "module",\n  "main": "dist/index.js",\n  "bin": {\n    "brownfield": "bin/brownfield.js"\n  },\n  "exports": {\n    ".": "./dist/index.js",\n    "./package.json": "./package.json"\n  },\n  "scripts": {\n    "build": "tsc -p tsconfig.json",\n    "test": "node --test tests/",\n    "lint": "eslint src",\n    "start": "node dist/index.js"\n  },\n  "dependencies": {\n    "express": "^4.19.0",\n    "synthetic-db": "^2.1.0"\n  },\n  "devDependencies": {\n    "typescript": "^5.4.0",\n    "vitest": "^2.0.0"\n  }\n}',
  ],
  [
    'pnpm-lock.yaml',
    "lockfileVersion: '6.0'\n\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n\nimporters:\n  .:\n    dependencies:\n      express:\n        specifier: ^4.19.0\n        version: 4.19.2\n      synthetic-db:\n        specifier: ^2.1.0\n        version: 2.1.3\n    devDependencies:\n      typescript:\n        specifier: ^5.4.0\n        version: 5.4.5\n      vitest:\n        specifier: ^2.0.0\n        version: 2.1.8\n\npackages:\n  express@4.19.2:\n    resolution:\n      integrity: sha512-SYNTHETIC-PLACEHOLDER-000\n      tarball: https://registry.example.invalid/express/-/express-4.19.2.tgz\n  synthetic-db@2.1.3:\n    resolution:\n      integrity: sha512-SYNTHETIC-PLACEHOLDER-001\n      tarball: https://registry.example.invalid/synthetic-db/-/synthetic-db-2.1.3.tgz",
  ],
  [
    'public/assets/logo.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="brownfield logo">\n  <rect width="96" height="96" rx="12" fill="#5b4636" />\n  <text x="48" y="58" font-size="28" text-anchor="middle" fill="#f3e9dc" font-family="monospace">bf</text>\n</svg>',
  ],
  [
    'public/index.html',
    '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <title>brownfield</title>\n  </head>\n  <body>\n    <main>\n      <h1>brownfield-app</h1>\n      <p>Synthetic static landing page for the brownfield fixture.</p>\n      <img src="assets/logo.svg" alt="brownfield logo" width="96" height="96" />\n    </main>\n  </body>\n</html>',
  ],
  [
    'scripts/-rf',
    '# This file is deliberately named `-rf` to exercise scanners against\n# flag-like file names. It is an ordinary text file. Deleting it with\n# `rm -rf` in its directory is a mistake, not a feature.\n#\n# The scanner must list it as a regular file and never treat it as an option.',
  ],
  [
    'scripts/convert.py',
    '#!/usr/bin/env python3\n"""Synthetic helper script for the brownfield fixture (never executed)."""\n\nimport json\nimport sys\n\n\ndef main() -> int:\n    payload = {"fixture": "brownfield", "language": "python"}\n    json.dump(payload, sys.stdout)\n    return 0\n\n\nif __name__ == "__main__":\n    raise SystemExit(main())',
  ],
  [
    'src/..hidden.ts',
    "/**\n * A file whose name starts with two dots. Legal on every major platform\n * (Windows, macOS, Linux) yet deliberately awkward for naive path handling.\n * The scanner must treat it as an ordinary source file.\n */\nexport function hiddenMarker(): string {\n  return '..hidden';\n}",
  ],
  [
    'src/app.ts',
    "// Synthetic application shell (fixture content only).\nimport { healthRoute } from './routes/health.js';\n\nexport interface AppOptions {\n  version: string;\n}\n\nexport function createApp(options: AppOptions = { version: '0.4.0' }) {\n  return {\n    routes: [healthRoute(options)],\n    listen(port: number, onReady: () => void) {\n      onReady();\n      return { port };\n    },\n  };\n}",
  ],
  [
    'src/index.ts',
    "// Brownfield fixture entry point (synthetic content only).\nimport { createApp } from './app.js';\n\nconst port = Number(process.env.PORT ?? '3000');\ncreateApp().listen(port, () => {\n  console.log(`brownfield listening on :${port}`);\n});",
  ],
  [
    'src/lib/format.ts',
    "export function formatBytes(bytes: number): string {\n  const units = ['B', 'KiB', 'MiB', 'GiB'];\n  let value = bytes;\n  let unit = 0;\n  while (value >= 1024 && unit < units.length - 1) {\n    value /= 1024;\n    unit += 1;\n  }\n  return `${value.toFixed(1)} ${units[unit]}`;\n}",
  ],
  [
    'src/lib/strings.ts',
    "export function capitalize(value: string): string {\n  if (value === '') return value;\n  return value.slice(0, 1).toUpperCase() + value.slice(1);\n}\n\nexport function slugify(value: string): string {\n  return value\n    .toLowerCase()\n    .replace(/[^a-z0-9]+/g, '-')\n    .replace(/^-|-$/g, '');\n}",
  ],
  [
    'src/routes/health.ts',
    "import { formatBytes } from '../lib/format.js';\n\nexport function healthRoute(options: { version: string }) {\n  return {\n    path: '/health',\n    handler: () => ({ ok: true, version: options.version }),\n  };\n}\n\nexport function versionRoute() {\n  const payload = formatBytes(1024);\n  return {\n    path: '/api/version',\n    handler: () => ({ payload }),\n  };\n}",
  ],
  [
    'tests/format.check.js',
    "// Plain assertion script (fixture content only — intentionally NOT named\n// *.test.* so test runners never execute fixture-tree files).\nconst assert = require('node:assert');\n\nfunction formatBytes(bytes) {\n  const units = ['B', 'KiB', 'MiB', 'GiB'];\n  let value = bytes;\n  let unit = 0;\n  while (value >= 1024 && unit < units.length - 1) {\n    value /= 1024;\n    unit += 1;\n  }\n  return `${value.toFixed(1)} ${units[unit]}`;\n}\n\nassert.strictEqual(formatBytes(0), '0.0 B');\nassert.strictEqual(formatBytes(1024), '1.0 KiB');\nconsole.log('format checks ok');",
  ],
  [
    'tests/smoke.js',
    "// Plain assertion script (fixture content only). Named without .test so test\n// runners never execute fixture-tree files as suites.\nconst assert = require('node:assert');\nconst { capitalize } = require('../src/lib/strings.js');\n\nassert.strictEqual(capitalize('brownfield'), 'Brownfield');\nconsole.log('smoke ok');",
  ],
  [
    'tools/--upload.txt',
    'This file is deliberately named `--upload.txt` so scanners have to handle a\nname that looks like a CLI flag. Its content is inert: it documents the\nintended upload conventions for the (synthetic) brownfield deployment.',
  ],
]);

/** The frozen FixtureTree consumed by scanner tests. */
export const brownfieldFixture: FixtureTree = {
  name: 'brownfield',
  description: brownfieldDescription,
  files: brownfieldFiles,
};
