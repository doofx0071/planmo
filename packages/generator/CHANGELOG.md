# @planmo/generator

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
