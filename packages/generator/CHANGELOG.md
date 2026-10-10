# @planmo/generator

## 1.4.1

### Patch Changes

- 0de291d: Stop regeneration from discarding recorded evidence.
  
  `planning/testing/TEST-EVIDENCE.csv` was a **generated** document. It is also the
  file the trace engine reads to decide whether a task has evidence — so recording a
  result and then running `planmo generate` wiped the result and made `TRC-002` fire
  again for every task that had been evidenced.
  
  Observed on a real workspace, not inferred: record six results, regenerate, get zero
  rows back. The agent doing the work noticed, worked around it by copying the results
  into `DECISIONS.md`, and reported the file as "a lossy projection".
  
  It is now `seeded` — PlanMo writes the scaffold once and the user owns it afterwards,
  the same family as `DECISIONS.md` and `RISKS.md`. If the task list later grows, new
  tasks simply have no rows, which the trace reports as missing evidence: true, rather
  than evidence that was thrown away.
  
  The `next` brief also now states two things an agent was otherwise discovering by
  reading PlanMo's source:
  
  - **The evidence contract.** `task_id,check,command,result`, and a result counts as
    passing only for `pass | passed | ok | green`. `FAIL` and `NOT RUN` count as no
    evidence, which is honest and was not written down anywhere.
  - **How to close the task.** `npx -y planmo task <id> --status DONE`. Two agent runs
    reported that no CLI could transition a task's status, because the command did not
    exist when their instructions were installed. The brief is generated per run, so it
    cannot go stale the same way.

## 1.4.0

### Minor Changes

- b2eb966: Add `planmo task` — record a task's status, and make it survive regeneration.
  
  The plan could not advance past its first task. `planning/tasks.csv` is a
  **generated** document, so hand-editing the status column is silently undone by the
  next `planmo generate` — verified, not assumed: append a status, regenerate, watch it
  revert. Every agent run reported the same wall, and the only remedy on offer was an
  edit that does not persist.
  
  **The durable home already existed and was never wired up.** `.planmo/state.yml`
  has carried a `tasks` map since the state document was defined:
  
  ```ts
  tasks: z.record(NonEmptyString, z.enum(TASK_STATUSES)).optional(),
  ```
  
  Nothing read it and nothing wrote it. So:
  
  ```
  $ planmo task P00-01 --status DONE
  P00-01: TODO → DONE
  Recorded in .planmo/state.yml — regeneration preserves it.
  ```
  
  - Status is recorded in state.yml and **survives regeneration** (tested).
  - The generator merges it over the generated default in `tasksForPhase` — the single
    place task status is decided — so `tasks.csv`, `TRACKER.md` and the phase documents
    cannot disagree.
  - `planmo task` with no arguments is interactive: pick a task, then a status, with
    DONE recommended and listed first.
  - `--dry-run` reports the change and writes nothing; an unknown id or status is an
    error, never a guess.
  
  Status is progress, not a planning input, so it is deliberately **not** part of
  `inputHash`: marking a task done must not make the workspace report as out of date.
  
  Two smaller fixes from the same run:
  
  - **Global installs now print where they actually go.** `hermes` and
    `hermes-global` both printed `✓ wrote .hermes/skills/…` — identical lines for two
    destinations, one of which leaves the repository. The global one now shows `~/`.
  - **The brief says what `validate` checks.** It ended with "run `planmo validate`",
    which reads as an acceptance gate. It is a structural check — state, tasks.csv,
    manifest, invariants — and an agent correctly pointed out that a green result is
    not proof a task is done.

## 1.3.0

### Minor Changes

- 60b39b1: The AI planning engine: `planmo plan` authors the plan document, and `generate`
  compiles from it. Determinism is preserved (ADR-0027).
  
  ## The decision everything rests on
  
  PlanMo's discipline is byte-stable output — goldens, `inputHash`, reproducible
  regeneration. A model call inside `generate` would destroy all of it. So the model
  authors **once**, and its output is pinned as a canonical document:
  
  ```
  planmo plan "<idea>"   →  model proposes  →  validated  →  .planmo/plan.yml   (once)
  planmo generate        →  compiles project.yml + plan.yml                     (always)
  ```
  
  `generate` performs no model call. A plan is an input, like `project.yml`.
  
  ## `planmo plan`
  
  ```
  $ planmo plan "Build a SaaS for freelancers" --dir shop
  plan generated.
    phases: 1   tasks: 1
    author: tokenharbor / deepseek/deepseek-v4-flash
    tokens: 532 in, 174 out
  
  Assumptions (not facts — review these): 1
    - ...
  Unresolved questions: 1
    - ...
  Workspace: .planmo/plan.yml
  
  Next step:
    planmo generate
  ```
  
  - **A plan that fails validation writes nothing.** The previous `plan.yml`, if any,
    is left byte-identical — a failed planning operation must not destroy the last
    valid plan.
  - **A plan you own is a collision** (exit 2), not a silent overwrite.
  - `assumptions` and `openQuestions` are required fields, so a plan cannot hide its
    own uncertainty.
  - `generatedAt` is `null`, enforced by the schema: a timestamp would make two
    identical plans differ byte-for-byte.
  - A missing provider explains how to set one and exits — it never falls back to fake
    output. `--provider mock` exists for offline exercise and says plainly that its
    output is simulated.
  
  ## Providers
  
  A registry, gateway-first — the way coding agents connect: one key across many
  vendors, models as `provider/model` slugs, OpenAI- **and** Anthropic-compatible
  wire formats.
  
  | Preset                          | Credential env var                                      |
  | ------------------------------- | ------------------------------------------------------- |
  | `tokenharbor`                   | `TOKENHARBOR_KEY`                                       |
  | `openai` / `anthropic`          | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`                  |
  | `deepseek` / `moonshot` / `xai` | `DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` / `XAI_API_KEY` |
  | `openrouter` / `custom`         | `OPENROUTER_API_KEY` / `PLANMO_AI_API_KEY`              |
  
  Credentials come from the environment, by convention, and **only** from there.
  PlanMo does not read the credential stores of the coding agents it detects —
  harvesting another tool's tokens is secret exfiltration, a stop condition in
  `AGENTS.md`.
  
  ## What the plan drives
  
  A plan **augments** the canonical spine: with one, its phases and tasks are the
  project's; without one, the canonical spine and the seeded tasks stand exactly as
  before. Verified on the real CLI — after `planmo plan` + `generate`, `tasks.csv`
  carries the plan's task and `planmo next` reports it, while `validate` stays clean.
  
  Every workspace generated before this feature, and every golden fixture, is
  **byte-identical**. The plan is included in the `inputHash` only when one exists, so
  a project without a plan does not report as out of date merely because this landed.
  
  ## Also
  
  - `@planmo/schema` gains the canonical task model (v2: acceptance criteria, a
    verification policy, and the `tasks.csv` codec) and `PlanDocument`.
  - `planning/testing/TEST-EVIDENCE.csv` is new: one row per check a
    `verification.required` task must satisfy. Recording a result is what clears
    `TRC-002` — evidence, not a claim.
  - `planmo trace` now reads that file; the warning count drops the moment a pass is
    recorded.
  - ADR-0027 records the decision and its alternatives.

### Patch Changes

- Updated dependencies [60b39b1]
  - @planmo/schema@1.2.0
  - @planmo/core@1.0.5
  - @planmo/packs@1.0.3

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
  - @planmo/packs@1.0.2

## 1.1.3

### Patch Changes

- 7d05587: Stop the generated `planning/README.md` advertising a `policies/` folder that was
  never written.
  
  Every generated workspace ships a `planning/README.md` whose folder table listed:
  
  ```
  | `policies/` | one document per standard class in use |
  ```
  
  That row was hardcoded. The folder itself is conditional — a policy document is
  emitted only for a standard class that actually has rules, which needs a pack
  selected. A default project selects none (`packs: []`), so **no project ever got a
  `policies/` directory**, and the generated README pointed at a folder that was not
  there. The table now reads "Only the folders that were actually generated are
  listed."
  
  The fix is one predicate, `policyClassesInUse(ir)`, used by both the policy
  renderer and the README. Deriving the row from the same condition that decides
  whether the folder exists is what stops the two drifting again; the test asserts
  the general invariant — every folder the README advertises must contain a document
  some renderer actually emits — rather than just this one row.
  
  That invariant is worth having: writing it immediately caught that the README
  describes the output of **three** renderers (the phase spine, the planning
  workspace, and the standards/policy set), which is exactly the kind of thing a
  hand-maintained table gets wrong.
  
  Goldens regenerated: `planning/README.md` only, for the three fixture levels. The
  `policies/` row is retained in the goldens because the fixture projects do select
  packs, so the folder is genuinely generated for them.

## 1.1.2

### Patch Changes

- 0c86cf5: Stop doubling the full stop after a phase objective.
  
  Objectives are already full sentences ending in a period, and the phase document
  and roadmap appended another one — `phase-03.md` read "Implement init, safe
  filesystem writer, dry-run/diff, ownership rules, status..". Both now use a
  `sentence()` helper that adds a full stop only when the text lacks one.

## 1.1.1

### Patch Changes

- 2cef618: Use the phase objective verbatim as the first task title.
  
  Phase objectives are already imperative sentences — "Implement init, safe
  filesystem writer, dry-run/diff, ownership rules, status." — so prefixing them
  with "Implement " produced titles like "Implement Implement init, safe filesystem
  writer…" in `planning/tasks.csv` and in every phase document's task table.

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
  - @planmo/packs@1.0.1
  - @planmo/schema@1.0.3

## 1.0.1

### Patch Changes

- 1cc0cf5: Fix `planning/tasks.csv` to the canonical five columns.
  
  The generated file had six columns (`id,phase,title,status,depends_on,acceptance`)
  while `@planmo/trace`'s validator requires exactly five
  (`id,phase,title,status,priority`), so every generated workspace failed
  `planmo validate` with `VLD-004`. Dependencies and acceptance criteria live in
  `REQUIREMENTS-TRACEABILITY.md` and the phase documents, where nothing constrains
  the column count.
  
  This shipped in `planmo@1.3.0` without taking effect: the fix is in
  `@planmo/generator`, which carried no changeset of its own, so the CLI kept
  resolving the previously published `@planmo/generator@1.0.0`. A change to an
  already-published package needs its own changeset — a changeset on the entry
  package alone does not republish its dependencies.

## 0.0.3

### Patch Changes

- Updated dependencies [5473462]
  - @planmo/shared@1.0.2
  - @planmo/schema@1.0.2
  - @planmo/core@1.0.2
  - @planmo/packs@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [15dcca6]
  - @planmo/shared@1.0.1
  - @planmo/schema@1.0.1
  - @planmo/core@1.0.1
  - @planmo/packs@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies [5ac4068]
  - @planmo/schema@1.0.0
  - @planmo/core@1.0.0
  - @planmo/packs@0.0.1
