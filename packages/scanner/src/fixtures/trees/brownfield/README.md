# brownfield-app

A synthetic brownfield repository used as a fixture for `@planmo/scanner`
(safe scanning, detection, context maps). Every credential-like value in this
tree is an obvious placeholder — never use any of it as a real secret.

## What is in here

- A small TypeScript application under `src/` with nested modules.
- A `package.json` with main, bin, exports and scripts, plus a lockfile.
- A Python helper under `scripts/`.
- Static assets under `public/`.
- Documentation under `docs/`.
- A GitHub Actions workflow in `.github/workflows/`.

## Getting started

1. Copy `.env.example` to `.env.local` and fill in real values.
2. `npm install`
3. `npm test`
4. `npm start`

The application exposes a health endpoint at `/health` and a placeholder
route at `/api/version`.

## Notes for scanners

This repository deliberately contains a few oddly named files (for example
`scripts/-rf` and `tools/--upload.txt`) to exercise path handling. It does
not contain symlinks: those cases are constructed at runtime by the scanner
test suite through the virtual reader.