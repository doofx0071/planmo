# Phase 09 Worker Orchestration Brief (READ FIRST)

Repo root on disk: `C:\Users\Damascus\Videos\clel\planmo`. Native Windows git-bash.
Rules:

1. **Node PATH**: `export PATH="/c/Users/Damascus/AppData/Local/Programs/node-v24.11.0-win-x64:$PATH"` (double quotes — single quotes break pnpm).
2. **Files-first**: write your own files immediately. Own ONLY the files listed in your task. Never touch contracts.ts/index.ts/package.json (lead-owned).
3. No git, no full `pnpm run check` (lead integrates). Run vitest on YOUR files + `pnpm --filter @planmo/trace typecheck` (must be 0 errors YOU introduced).
4. Prettier: `pnpm exec prettier --write <your files>`.
5. Frozen interfaces live in `packages/trace/src/contracts.ts` — implement against THEM exactly. Read it first.
6. Pure + deterministic: no Date.now, no randomness, no filesystem. Sort every output array. exactOptionalPropertyTypes: omit optional fields, never set undefined.
7. Diagnostics ALWAYS carry a stable `code` (e.g. `VLD-001`) — CI-consumable (exit gate).