# Phase 08 Worker Orchestration Brief (READ FIRST)

Repo root on disk: `C:\Users\Damascus\Videos\clel\planmo`. Native Windows git-bash.
Rules that apply to you:

1. **Node PATH**: `export PATH="/c/Users/Damascus/AppData/Local/Programs/node-v24.11.0-win-x64:$PATH"` — single quotes break $PATH expansion.
2. **Own ONLY your listed files.** `git status --porcelain` must show nothing new beyond your files. Never run git add/commit/branch; never run `pnpm run check` (lead integrates).
3. **Read the frozen contracts FIRST**: `packages/workflow/src/contracts.ts` (all interfaces + doc rules: pure, deterministic, sorted arrays, exactOptionalPropertyTypes=ON, time always injected, never `Date.now()`). Style reference (lead-owned, same package): `src/transition.ts`, `src/handoff.ts`, `src/next.ts`, `src/change.ts`, `src/workflow.test.ts`.
4. Schema types come from `@planmo/schema` (workflow deps: schema + agent-bridge only — NO other imports). Check `packages/schema/src/index.ts` for exports (StateDocument, HandoffDocument, WorkPacket, ChangePackage, TASK_STATUSES...).
5. **Prettier**: run `pnpm exec prettier --write <your files>` before reporting (Prettier must be clean at integration).
6. Deterministic output is tested byte-for-byte; sort ALL arrays before emitting them.
7. Files-first: write code immediately, tests alongside. Do not design-then-write; land files early and iterate with vitest.

Sanity check per file before reporting:
`export PATH="/c/Users/Damascus/AppData/Local/Programs/node-v24.11.0-win-x64:$PATH"` then `pnpm exec vitest run packages/workflow/src/<your-test>.ts` (all green) and `pnpm --filter @planmo/workflow typecheck` (0 NEW errors — pre-existing errors in other workers' files are not yours).

Report back: files created, tests run + counts, any contract discrepancy (do not edit contracts.ts — flag it).