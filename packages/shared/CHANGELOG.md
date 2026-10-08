# @planmo/shared

## 1.1.0

### Minor Changes

- 47d5859: Canonical identifier scheme for phases and tasks, and a real per-phase task set.
  
  **One documented scheme.** `docs/02-architecture/identifier-scheme.md` defines it:
  phase ids are `NN`, task ids are `P<NN>-<NN>` (`P07-03` is the third task of
  phase `07`), requirement ids are `REQ-<NNN>`, and a work packet is `WP-<taskId>`.
  Fixed width is load-bearing, not cosmetic — the task DAG orders ready work by
  comparing task-id strings, so `P07-10` only sorts after `P07-09` if both are
  padded. `@planmo/shared` now owns the patterns and helpers (`taskId()`,
  `isTaskId()`, `taskPhase()`), so the emitter and the checker cannot drift.
  
  **A real task list.** `planning/tasks.csv` seeded one placeholder row per phase.
  It now seeds four per phase — implement, tests & evidence, docs & traceability,
  handoff — mirroring the product's own definition of done. The phase documents
  list their own tasks, `TRACKER.md` names each phase's task range, and
  `REQUIREMENTS-TRACEABILITY.md` links each requirement to the tasks that deliver
  it. All four surfaces derive from one function, so they cannot disagree.
  
  **Validation.** `planmo validate` gains two codes: `VLD-005` for a task id that is
  not `P<NN>-<NN>`, and `VLD-006` for an id whose embedded phase disagrees with its
  phase column. The `priority` column is now MoSCoW (`MUST`/`SHOULD`/`MAY`) rather
  than `P1`/`P2`, which collided visually with the `P` id prefix.
  
  **Fixed: a task title containing a comma broke validation.** Phase objectives
  contain commas, so the generated title was quoted — and the validator split rows
  on a bare `,`, turning a valid five-column row into six and failing `VLD-004`.
  CSV reading and writing now share one quote-aware implementation in
  `@planmo/shared` (`csvField`, `splitCsvLine`), which also fixes hand-edited files.
  
  **Fixed: the golden snapshots did not cover the workspace renderer.** Both
  `golden.test.ts` and `update-goldens.mjs` composed only two of the three
  renderers, so the 18 documents produced by `renderPlanWorkspace` had no byte
  snapshot — a regression in any of them failed nothing. All three levels now cover
  the full pipeline (29/33/40 artifacts for low/medium/high).

## 1.0.2

### Patch Changes

- 5473462: Add a README to every published package and fill in npm metadata (repository,
  homepage, bugs, keywords), and enable npm provenance attestation.
  
  The published tarballs previously contained only `dist/`, `package.json` and
  `LICENSE`, so the npm pages rendered empty with no usage information. No runtime
  change.

## 1.0.1

### Patch Changes

- 15dcca6: Validate npm Trusted Publishing (OIDC) for the v1 release line.
  
  No functional change: this release exists to prove the release workflow publishes
  with no npm token, via OIDC (`id-token: write`) and the trusted-publisher
  configuration on each package. A real publish is required because npm only
  validates a trusted-publisher configuration once it sees an authenticated publish
  from the configured repository and workflow.

## 1.0.0

### Major Changes

- First public release. `@planmo/shared` is part of the v1.0.0 CLI runtime
  closure: `planmo` depends on it (ADR-0009/0010 keep plain `tsc` emit, so there
  is no bundle and the closure must be published). The exported utility surface
  is stable for v1.
