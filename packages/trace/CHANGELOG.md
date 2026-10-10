# @planmo/trace

## 1.2.2

### Patch Changes

- @planmo/workflow@1.1.5

## 1.2.1

### Patch Changes

- Updated dependencies [60b39b1]
  - @planmo/schema@1.2.0
  - @planmo/core@1.0.5
  - @planmo/workflow@1.1.4

## 1.2.0

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

### Patch Changes

- Updated dependencies [da9ad6a]
  - @planmo/schema@1.1.0
  - @planmo/core@1.0.4
  - @planmo/workflow@1.1.3

## 1.1.6

### Patch Changes

- @planmo/workflow@1.1.2

## 1.1.5

### Patch Changes

- fa4cd8a: `planmo doctor` — environment and workspace health, and the package-manager bug
  that had to be fixed before it could be wired.
  
  ```console
  $ planmo doctor
  environment:
    node            v24.11.0
    package manager pnpm
    git worktree    clean
    prompts missing 0
  doctor: OK (0 error(s), 0 warning(s), 0 info)
  ```
  
  **The bug.** `doctorEngine()` hardcoded `expected "pnpm"` and raised **DOC-003 as
  an error** for anything else. That is correct for this repository, where pnpm is
  the convention, and wrong for every other project — a Python service, a Go binary,
  a Rust crate would each have been told their package manager was an error. It
  could not be wired as it stood without shipping false failures.
  
  The engine no longer invents an expectation. `DoctorInput.expectedPackageManager`
  is optional: supplied, a mismatch is an error as before; absent, the engine stays
  silent, because there is nothing to judge. Silence rather than an `info`
  diagnostic is deliberate — it keeps the engine's existing "a clean environment
  reports nothing" property intact, and the CLI prints the resolved facts itself:
  
  ```console
  $ planmo doctor          # in a project with a poetry.lock
    package manager poetry
  doctor: OK (0 error(s), 0 warning(s), 0 info)
  ```
  
  **The adapter** (`packages/planmo/src/doctor.ts`) resolves the facts the engine
  cannot know, the same shape as `validate` over the same package:
  
  - Node version from the runtime.
  - Package manager detected from the lockfile (pnpm, bun, yarn, npm, uv, poetry,
    pipenv, cargo, go, bundler, composer) — most specific first, `unknown` when
    there is none. Reported, never judged.
  - Git worktree state via `git status --porcelain`. A failing `git` (not a repo, no
    git installed) is reported as clean rather than as an error: not having git is
    not a health problem here.
  - Missing next-phase prompt file: the workspace state names one, so if it is
    absent that is a real gap; if the state names none, there is nothing to check.
  
  `doctor` exits `0` unless the environment genuinely fails (`1`), and `3` with no
  workspace — so it works as a pre-flight check without turning a warning into a
  build failure.

## 1.1.4

### Patch Changes

- @planmo/workflow@1.1.1

## 1.1.3

### Patch Changes

- Updated dependencies [0d9d79f]
  - @planmo/workflow@1.1.0

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
