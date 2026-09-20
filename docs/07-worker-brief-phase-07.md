# Phase 07 Worker Orchestration Brief (READ FIRST)

Repo root on disk: `C:\Users\Damascus\Videos\clel\planmo`. Native Windows git-bash.
Rules that apply to you:

1. **Node PATH**: export PATH="/c/Users/Damascus/AppData/Local/Programs/node-v24.11.0-win-x64:$PATH" before any pnpm/vitest/tsc command. Use `C:/...` forward-slash paths for native tools, never `/c/...`.
2. **Own ONLY your files** (listed in your task). Do NOT touch `contracts.ts`, `tokens.ts`, `anti-patterns.ts`, `index.ts`, `package.json`, schemas, `docs/`, `planning/`, or any other worker's files. No git commands at all — the lead integrates.
3. **Pure + deterministic**: no timestamps, no randomness, no filesystem reads/writes, no CLI execution in your modules. Sort every array before it appears in output. `exactOptionalPropertyTypes` is ON: omit optional fields, never set `undefined`.
4. Read `packages/design-engine/src/contracts.ts` FIRST — the frozen interfaces you implement. Read an existing sibling (e.g. `tokens.ts`) to match style: header doc comment, pure functions, exported const implementing the contract interface.
5. Verify ONLY your own test files: `pnpm exec vitest run packages/design-engine/src/<your-files>.test.ts`. Also `pnpm --filter @planmo/design-engine typecheck` (avoid introducing TS errors). Do NOT run `pnpm check` or the full suite.
6. Prettier: printWidth 100, singleQuote, semi, trailingComma all. Your code must pass `pnpm prettier --write` cleanly on your own files.
7. Use `read_file`/`search_files`/`patch`/`write_file` tools only. If types from `@planmo/schema` are unclear, read `packages/schema/src/design-profile.ts` and `packages/schema/src/pack-content.ts` (StandardRule shape) for the real shapes.
8. Report: files created, tests run + counts, and any contract discrepancies you could not resolve (do not silently change the frozen contract — flag it instead).