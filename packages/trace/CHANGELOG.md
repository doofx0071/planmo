# @planmo/trace

## 1.1.2

### Patch Changes

- @planmo/workflow@1.0.3

## 1.1.1

### Patch Changes

- @planmo/workflow@1.0.2

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

### Patch Changes

- Updated dependencies [47d5859]
  - @planmo/shared@1.1.0
  - @planmo/core@1.0.3
  - @planmo/schema@1.0.3
  - @planmo/workflow@1.0.1

## 0.0.3

### Patch Changes

- Updated dependencies [5473462]
  - @planmo/shared@1.0.2
  - @planmo/schema@1.0.2
  - @planmo/core@1.0.2
  - @planmo/workflow@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [15dcca6]
  - @planmo/shared@1.0.1
  - @planmo/schema@1.0.1
  - @planmo/core@1.0.1
  - @planmo/workflow@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies [5ac4068]
  - @planmo/schema@1.0.0
  - @planmo/core@1.0.0
  - @planmo/workflow@0.0.1
