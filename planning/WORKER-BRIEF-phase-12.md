# Phase 12 Worker Brief — Hardening, pilot & v1

Repo: `C:/Users/Damascus/Videos/clel/planmo` (git-bash, Windows). Branch
`feat/phase-12-hardening-pilot-and-v1`. Run EVERY command from YOUR worktree
root (paths given below).

## Machine toolchain (git-bash, Windows)

```bash
export PATH="/c/Users/Damascus/AppData/Local/Programs/node-v24.11.0-win-x64:$PATH"
pnpm --filter <pkg> typecheck        # per-package typecheck
pnpm exec vitest run packages/<pkg>/src/<your-file>.test.ts
```

Single-quoted PATH breaks resolution — always the double-quoted export above.
`python` is fine for scratch. Do NOT run `pnpm check` or the full suite —
vitest on YOUR files only plus your package typecheck.

## Shared rules (all workers)

- Write ONLY files in YOUR ownership list. Never create stub versions of a
  sibling worker's file, even if typecheck complains.
- Do NOT run `git add/commit/reset/checkout/merge` (lead commits).
- Do NOT run `pnpm install` except once with `--frozen-lockfile`; never change
  the lockfile, never add dependencies (zero new deps rule).
- Tests ship with behavior, including negative/error-path cases.
- Determinism: every exported value byte-stable for identical input. No
  timestamps/randomness in outputs. Property tests must use a SEEDED
  pseudo-random generator (fixed seed via parameter), never Math.random.
- Strict types, no `any`. Prettier 2-space, `.js` suffix on relative imports.
- Report actual command output with pass/fail counts. Never fabricate.

---

## Worker A — P12-02 property/fuzz tests on high-risk parsers (critical)

Worktree: `C:/Users/Damascus/.hermes-worktrees/ws-a-phase12` (branch `worker-a/phase-12`)

Ownership (create ONLY these NEW files; never edit existing source/tests):
- `packages/core/src/property-fuzz-paths.test.ts` — path/path-normalization
  properties: arbitrary join/relative inputs resolve inside root or reject;
  traversal/symlink negative properties (seeded PRNG over crafted strings).
- `packages/packs/src/property-fuzz-loader.test.ts` — loader properties:
  executable keys at ANY depth rejected, arbitrary pack.yml shapes either
  parse or fail closed with deterministic error; never partial load.
- `packages/packs/src/property-fuzz-resolve.test.ts` — resolution
  permutations yield the same semantic resolution; conflict/cycle/missing-dep
  diagnostics deterministic; no silent drift.
- `packages/schema/src/property-fuzz-versioning.test.ts` — schema-versioning:
  unknown/future major rejected; round-trip serialization stable; legacy
  documents keep parsing after re-serialization.
- `packages/design-engine/src/property-fuzz-tokens.test.ts` — token alias
  graphs: fully-resolvable or deterministic cycle/missing-reference
  diagnostics; no hangs on deep/cyclic graphs.
- `packages/generator/src/property-fuzz-ir.test.ts` — IR compile/render:
  unchanged inputs produce byte-identical output (no-op regeneration);
  arbitrary malformed IR rejected, never crashes.
- `docs/09-testing/property-and-fuzz.md` — extend with the concrete property
  definitions + seed strategy + evidence (test names + counts).

Property style: table-driven + seeded generator loop (e.g. 200 iterations,
seed fixed like `0xC0FFEE12`), asserting invariants from
`docs/09-testing/property-and-fuzz.md`. Integration points: reuse exported
helpers (e.g. `resolveInsideRoot` from `./paths.js`, loader from
`./loader.js`) — import, do not duplicate. Do NOT touch
`phase11-contracts.ts`/trust/catalog/install files or their tests.

## Worker B — CHG-001 evals & memory hardening: P12-08, P12-09, P12-10, P12-11

Worktree: `C:/Users/Damascus/.hermes-worktrees/ws-b-phase12` (branch `worker-b/phase-12`)

Ownership (create/edit ONLY these):
- `packages/agent-bridge/src/context-retrieval-eval.test.ts` (NEW) — retrieval
  fixtures per `docs/14-context-memory/evaluation.md`: known relevant evidence
  scenarios (ADR lookup, failed approach, symbol location, package standard,
  stale/superseded, conflicting facts, security invariant) measured against
  the lexical context provider(s) exposed by agent-bridge/scanner context —
  compute recall@k, precision@k, required-fact inclusion, stale-memory
  exclusion. Deterministic fixtures inline; no network.
- `packages/agent-bridge/src/memory-poisoning-staleness.test.ts` (NEW) —
  memory security: prompt-injection text as memory content never treated as
  instructions; secret-like strings rejected/redacted; cross-project memory
  IDs filtered; stale superseded entries excluded; forged provenance detected
  (import/memory-file-provider paths).
- `packages/scanner/src/context/index-corruption-rebuild.test.ts` (NEW) —
  corruption/rebuild: truncated/garbage index/json/memory files →
  deterministic error or rebuildable state via provider/doctor paths; no
  crash, no fabricated rows (build on `memory-file-provider.ts` + scanner
  context modules). 
- `scripts/eval-context-retrieval.mjs` (NEW) — runnable harness printing the
  eval table (recall/precision/inclusion/stale-exclusion) with exit code.
- `scripts/eval-token-budget.mjs` (NEW) — token benchmark comparing
  full-context vs repo-map vs repo-map+lexical vs optional hybrid on PlanMo
  fixtures; deterministic token estimate (chars/4 or explicit tokenizer if one
  exists in-repo — check `packages/agent-bridge/src/context-bundle.ts` first);
  prints budget table + verdict.
- `docs/14-context-memory/evaluation.md` — append measured eval + benchmark
  RESULTS section (numbers from the scripts you actually ran).
- `docs/16-evals-trust/trust-engine-future.md` — append implemented-classification
  eval evidence + trust metadata pilot notes (classify a representative fixture
  catalog inline, deterministic).

Do NOT touch memory-portable.ts / memory-file-provider.ts source (Phase 11
frozen); test them only. No new dependencies.

## Worker C — P12-04 upgrade/migration validation + P12-05 pilots + P12-06 docs/examples/RC

Worktree: `C:/Users/Damascus/.hermes-worktrees/ws-c-phase12` (branch `worker-c/phase-12`)

Ownership (create/edit ONLY these):
- `packages/schema/src/upgrade-migration-e2e.test.ts` (NEW) — upgrade paths:
  each persisted doc kind (project, state/lock manifest, pack, trace/handoff)
  from the OLDEST supported schemaVersion through every migration step to
  current; invalid/unknown version rejected; round-trip stable; downgrade
  policy asserted or documented-as-blocked where engine does not support it.
  Reuse `packages/schema/src/migrations.ts` + fixtures.
- `scripts/e2e-phase12-pilots.mjs` (NEW) — representative pilots running the
  REAL CLI: (1) greenfield tiny CLI project via `planmo init` (+ status/
  generate if supported with deterministic fixtures), (2) brownfield messy
  monorepo via `planmo adopt` on `packages/scanner/src/fixtures`-style tree,
  (3) high-assurance payment-style project profile selection sanity.
  Assert exit codes + generated artifacts exist + manifest checksums match.
  No AI key required (deterministic core only). Print PASS/FAIL per pilot.
- `docs/10-engineering/pilots.md` (NEW) — pilot report: what was run, real
  output summaries, findings, follow-ups.
- `docs/09-testing/release-test-gates.md` — extend with the upgrade E2E +
  pilot evidence section.
- `docs/03-cli/` example page (NEW `examples.md` if not present) — walkthrough
  of init/status/adopt for a new user, matching actual CLI surface.
- `.changeset/phase-12-release-candidate.md` (NEW — content only; lead files
  it if format differs): minor bumps for @planmo/* packages describing
  hardening + eval evidence.

Do NOT edit existing docs files except the two listed updates. Do NOT touch
packages/*/src existing files. Check CLI surface first by reading
`packages/cli/src/index.ts` (read-only OK) and use it EXACTLY as built.

---

## Verification commands (yours only)

```bash
export PATH="/c/Users/Damascus/AppData/Local/Programs/node-v24.11.0-win-x64:$PATH"
cd <YOUR WORKTREE ROOT>
pnpm install --frozen-lockfile   # once, if node_modules missing
pnpm exec vitest run packages/<pkg>/src/<your>.test.ts   # all your files
pnpm --filter <your-pkgs> typecheck
node scripts/<your-script>.mjs   # Worker B/C scripts
```

All your tests must pass BEFORE you report. If a sibling dependency prevents
typecheck of your package, report that honestly with the exact error.

## Report format (required)

1. Files written (absolute paths).
2. Commands run + real pass/fail counts.
3. Design decisions; any gap encountered (do NOT widen types silently —
   report; lead amends).
4. P12-04 downgrade finding (Worker C): explicit statement whether downgrade
   is engine-supported or legacy-only.
5. Anything BLOCKED with exact unblock steps.