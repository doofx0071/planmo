# Identifier Scheme

Every PlanMo identifier is fixed-width and zero-padded. Padding is not cosmetic:
the task DAG orders ready work by comparing task-id strings, so `P07-10` must
sort after `P07-09`.

| Thing          | Format                  | Example               | Where it appears                                                            |
| -------------- | ----------------------- | --------------------- | --------------------------------------------------------------------------- |
| Phase id       | `NN` (2 digits)         | `00`, `07`, `12`      | `state.yml` `currentPhase` / `completedPhases`, `planning/phases/phase-07.md` |
| Task id        | `P<NN>-<NN>`            | `P07-03`              | `planning/tasks.csv` `id`, `state.yml` `tasks` / `blockedTasks`             |
| Requirement id | `REQ-<NNN>`             | `REQ-003`             | `planning/REQUIREMENTS-TRACEABILITY.md`                                     |
| Work packet id | `WP-<taskId>`           | `WP-P07-03`           | work packets — derived, never hand-written                                  |
| Handoff file   | `phase-<NN>-handoff.md` | `phase-07-handoff.md` | `planning/handoffs/`                                                        |

## Rules

1. A task id is `P`, the 2-digit phase id, `-`, then the 2-digit task number:
   `P07-03` is the third task of phase `07`.
2. Task numbers restart at `01` in every phase. `P01-01` and `P02-01` are
   different tasks.
3. An id is never reused and never renumbered. Status changes; ids do not.
4. Fixed width: pad to 2 digits. `P7-3` is invalid.
5. `T01`, `T-01` and `Phase 01` are not used anywhere in PlanMo.
6. The `phase` column of a `tasks.csv` row must equal the phase inside its id.
7. The patterns live in `@planmo/shared` (`PHASE_ID_PATTERN`,
   `TASK_ID_PATTERN`, `REQUIREMENT_ID_PATTERN`, `taskId()`, `isTaskId()`,
   `taskPhase()`) so the emitter and the checker share one definition.
   `planmo validate` reports `VLD-005` for a malformed id and `VLD-006` for an
   id whose phase disagrees with its phase column.

## Task list

`planning/tasks.csv` is the canonical task list. Since schema v2 it has eight
columns: acceptance criteria and the verification checks are `;`-separated lists
inside one RFC 4180 quoted cell, so a criterion containing a comma cannot split a
row. `@planmo/trace`'s validator accepts this width and the five-column v1 width,
so a workspace generated before v2 keeps validating.

```text
id,phase,title,status,priority,acceptance,verification,checks
```

- `status` is one of `TODO`, `IN_PROGRESS`, `BLOCKED`, `REVIEW`, `DONE`.
- `priority` is one of `MUST`, `SHOULD`, `MAY` (MoSCoW). Deliberately not
  `P1`/`P2`, which would collide visually with the `P` id prefix.

The generator seeds four rows per phase — implement, tests & evidence,
docs & traceability, handoff — mirroring the product's own definition of done.
That seed is a starting point for a human or agent, not a real breakdown.
