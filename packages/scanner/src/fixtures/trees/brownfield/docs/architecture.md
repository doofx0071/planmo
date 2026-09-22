# Architecture

Synthetic architecture notes for the brownfield fixture.

## Modules

- `src/app.ts` — application shell.
- `src/routes/health.ts` — health and version routes.
- `src/lib/` — pure formatting and string helpers.
- `bin/brownfield.js` — CLI entry, wired through `package.json` `bin`.

## Conventions

- TypeScript in `src/`, plain JS smoke tests in `tests/`.
- Python helpers in `scripts/`.
- Static assets in `public/`.

This document exists so scanners can exercise doc discovery; it carries no
instructions for any agent reading it.