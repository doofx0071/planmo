# @planmo/schema

## 1.1.0

### Minor Changes

- da9ad6a: Task schema v2 — acceptance criteria, a verification policy, and the evidence
  scaffold that makes "verified" mean something.
  
  **The gap this closes.** There was no canonical Task type at all: `@planmo/trace`
  had `TraceTask`, `@planmo/workflow` had its own view, and `tasks.csv` was the only
  artifact they shared — each parsing it independently. Nothing could carry
  acceptance criteria, so three things were dead ends:
  
  - `planmo trace` could never clear its warnings. Nothing in a workspace could
    record test evidence, so every task reported `TRC-002 no test evidence` forever.
  - `planmo handoff` could not report verification — no field for it.
  - Evidence-based completion was structurally impossible, which is the product's
    central promise: a task is not verified because an agent says it is.
  
  **`@planmo/schema` now owns the model.** `TaskRecord` with `acceptance: string[]`
  and `verification: { required, checks }`, plus the `tasks.csv` codec
  (`serializeTasksCsv` / `parseTasksCsv`) so the writer and every reader share one
  implementation instead of each splitting on a bare comma. The task states stay
  where they already were — `state-lock-manifest.ts` — so there is still one
  definition of the lifecycle.
  
  **`planning/tasks.csv` gains three columns:**
  
  ```
  id,phase,title,status,priority,acceptance,verification,checks
  ```
  
  `acceptance` and `checks` are `;`-separated lists inside one RFC 4180 quoted cell.
  The parser accepts the five-column v1 width too, so a workspace generated before
  this change keeps working — the validator accepts both, and the validators report
  missing criteria rather than the schema refusing to load the file.
  
  **`planning/testing/TEST-EVIDENCE.csv` is new** — one row per check a
  `verification.required` task must satisfy:
  
  ```
  task_id,check,command,result
  P00-01,unit tests,,
  ```
  
  `command` and `result` are blank until the check is actually run. `command` is
  blank because the generator cannot know a project's commands; a pre-filled result
  would be a fabricated one. This is the file `planmo trace` reads, so recording a
  result is what clears `TRC-002` for that task. Verified on the real CLI: the
  warning count drops 28 → 27 the moment a pass is recorded for `P00-01`.
  
  Optional tasks get no evidence rows — nothing gates on them, so demanding
  evidence would be noise.
  
  **What the seed criteria are, honestly.** The generator cannot know a project's
  acceptance criteria, so it derives them from what it does know: the phase
  objective, the phase document, and the profile's exit gates. Every task gets at
  least one checkable criterion. This is a deterministic **floor, not task
  decomposition** — raising it to project-specific criteria is the AI planner's job.
  Stated plainly so nobody mistakes the seed for the finished feature.
  
  The seeded workstreams are unchanged: implement, tests & evidence,
  docs/traceability, handoff — still derived from the one `phaseTasks()` function,
  so `tasks.csv`, the phase documents, the tracker, the traceability matrix and the
  evidence file cannot disagree.
  
  **Also:** the phase document now lists each task's acceptance criteria and whether
  its verification is required, so the criteria are visible where a human reads them.

## 1.0.3

### Patch Changes

- Updated dependencies [47d5859]
  - @planmo/shared@1.1.0

## 1.0.2

### Patch Changes

- 5473462: Add a README to every published package and fill in npm metadata (repository,
  homepage, bugs, keywords), and enable npm provenance attestation.
  
  The published tarballs previously contained only `dist/`, `package.json` and
  `LICENSE`, so the npm pages rendered empty with no usage information. No runtime
  change.
- Updated dependencies [5473462]
  - @planmo/shared@1.0.2

## 1.0.1

### Patch Changes

- 15dcca6: Validate npm Trusted Publishing (OIDC) for the v1 release line.
  
  No functional change: this release exists to prove the release workflow publishes
  with no npm token, via OIDC (`id-token: write`) and the trusted-publisher
  configuration on each package. A real publish is required because npm only
  validates a trusted-publisher configuration once it sees an authenticated publish
  from the configured repository and workflow.
- Updated dependencies [15dcca6]
  - @planmo/shared@1.0.1

## 1.0.0

### Major Changes

- 5ac4068: Phase 12 (release candidate prep): upgrade/migration validation E2E, representative pilots on the real CLI, and new-user docs — hardening evidence, no behavioural regressions.
  
  - `@planmo/schema`: `upgrade-migration-e2e.test.ts` (NEW, 24 tests) migrates every chain-covered legacy fixture (project/state/handoff v0 → v1) to the current schema with strict-parse + round-trip stability + `extensions` preservation; asserts v1-only kinds (lockfile, manifest, pack, design profile, trace graph, work packet) keep golden fixtures parseable (incl. pre-Phase 11 lockfiles and legacy ownership aliases) and reject future/unknown versions; records the downgrade policy: migration is upgrade-only (no engine-supported downgrade), v0 → v1 is additive and pure, legacy rollback is legacy-only (original v0 file always untouched).
  - `@planmo/core` / `@planmo/scanner` / `@planmo/cli`: exercised end-to-end by `scripts/e2e-phase12-pilots.mjs` (8 pilots, 63/63 checks) driving the real built CLI — greenfield init + HEALTHY status, dry-run writes nothing, collision exit 2 + `--force`, brownfield `adopt --dry-run` confined to `.planmo/adopt/` with `rewritesApplicationCode: false` on a hostile fixture, `--depth high-assurance` validation, exit-code surface 0/1/2/3, byte-identical determinism across runs. No code changes in this phase — hardening is evidence + docs only.
  - Docs: `docs/10-engineering/pilots.md` (NEW — pilot report, findings incl. the documented-vs-real CLI surface mismatch), `docs/03-cli/examples.md` (NEW — new-user walkthrough matching the actual v1 surface), `docs/09-testing/release-test-gates.md` (Phase 12 evidence section).
