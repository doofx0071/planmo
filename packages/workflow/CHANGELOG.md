# @planmo/workflow

## 1.1.4

### Patch Changes

- Updated dependencies [60b39b1]
  - @planmo/schema@1.2.0
  - @planmo/agent-bridge@1.3.3

## 1.1.3

### Patch Changes

- Updated dependencies [da9ad6a]
  - @planmo/schema@1.1.0
  - @planmo/agent-bridge@1.3.2

## 1.1.2

### Patch Changes

- Updated dependencies [9fede71]
  - @planmo/agent-bridge@1.3.1

## 1.1.1

### Patch Changes

- Updated dependencies [5666d75]
  - @planmo/agent-bridge@1.3.0

## 1.1.0

### Minor Changes

- 0d9d79f: `planmo next` — the command file PlanMo installs into every agent now works.
  
  Since 1.5.0, all 31 supported agents receive a `planmo-next` command whose body
  says _"Run `npx planmo next --print` and follow the directive it prints."_ That
  command did not exist. It does now.
  
  ```console
  $ npx planmo next --print
  Phase 03 — CLI foundation
  
  Next task  P03-01   MUST   TODO
    Implement the planmo CLI: init, status, adopt, generate, validate.
  
  Read before you start:
    planning/phases/phase-03.md
    planning/CONTEXT.md
    planning/STANDARDS.md
    planning/TRACKER.md
  
  Progress  7 of 28 tasks done · 21 ready
  
  Change only what this task requires, and add no adjacent edits.
  When you are done, run `npx planmo validate`.
  ```
  
  The selection is delegated to the task DAG that already existed in
  `@planmo/workflow` (`task-dag.ts`), so "next" is the lowest-id task that is ready.
  Because task ids are phase-major and zero-padded, that is also the earliest phase
  with work left — **phase gating falls out of the identifier scheme** rather than
  needing a second rule, which is what the fixed width was made load-bearing for.
  
  `BLOCKED` is never ready, so a blocked task is stepped over and then reported in a
  `Blocked (n):` section — never silently skipped. A row in `tasks.csv` that cannot
  be read is reported as a warning rather than dropped, and a phase whose document
  is missing simply omits its title instead of failing the brief.
  
  `@planmo/workflow` gains `parseTaskList` / `composeNextBrief` / `phaseDocPath` /
  `phaseTitleFromDoc` (all pure) and a declared dependency on `@planmo/shared` for
  the RFC 4180 CSV reader — so a task title containing a comma does not split the
  row. `planmo next` itself is a thin adapter, the same shape as `validate` over
  `@planmo/trace`: read the documents, hand them to the engine, print what it
  returns. Nothing about the selection lives in the CLI.
  
  Flags: `--dir <path>`, `--print` (the default — print and write nothing; it exists
  because the installed command file passes it), and `--json` for agents and CI.
  Exit codes: `0` ok, `1` a workspace that exists but has no planning tree yet,
  `3` no workspace at all.

## 1.0.3

### Patch Changes

- Updated dependencies [2356d99]
  - @planmo/agent-bridge@1.2.0

## 1.0.2

### Patch Changes

- Updated dependencies [47fc9e8]
  - @planmo/agent-bridge@1.1.0

## 1.0.1

### Patch Changes

- @planmo/agent-bridge@1.0.1
  - @planmo/schema@1.0.3

## 0.0.3

### Patch Changes

- Updated dependencies [5473462]
  - @planmo/schema@1.0.2
  - @planmo/agent-bridge@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [15dcca6]
  - @planmo/schema@1.0.1
  - @planmo/agent-bridge@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies [5ac4068]
  - @planmo/schema@1.0.0
  - @planmo/agent-bridge@0.0.1
