# Phase 01 — Repository & engineering foundation

## Objective
Create monorepo toolchain, strict types, lint/format/test, CI, boundaries.

## Tasks
| Task | Title | Priority | Status |
|---|---|---|---|
| P01-01 | Create monorepo toolchain, strict types, lint/format/test, CI, boundaries. | MUST | TODO |
| P01-02 | Tests & evidence for the phase exit gates | MUST | TODO |
| P01-03 | Docs & traceability for Repository & engineering foundation | SHOULD | TODO |
| P01-04 | Record the phase handoff | SHOULD | TODO |

### Acceptance criteria

A task is DONE only when every criterion below holds. A task whose verification
is `required` also needs a recorded result in `planning/testing/TEST-EVIDENCE.csv`.

**P01-01** — verification **required**
- [ ] The phase objective is met: Create monorepo toolchain, strict types, lint/format/test, CI, boundaries.
- [ ] Every exit gate named in planning/phases/phase-01.md passes

**P01-02** — verification **required**
- [ ] Each exit gate has a recorded result in planning/testing/TEST-EVIDENCE.csv
- [ ] Any check that was not run is marked as not run, not left blank

**P01-03** — verification optional
- [ ] planning/TRACKER.md and planning/REQUIREMENTS-TRACEABILITY.md reflect phase 01

**P01-04** — verification optional
- [ ] planning/handoffs/phase-01-handoff.md is recorded and names the next phase

## Phase mode
Phases run continuously; a handoff is still recorded at every phase boundary.

## Test & evidence gate
- unit tests
- typecheck
- lint
- format:check

## Exit gates
- [ ] Generation is byte-stable for identical inputs.
- [ ] Generated artifacts are recorded in `.planmo/manifest.json`.
- [ ] Regeneration preserves user-owned content.

## Required phase handoff
Create `planning/handoffs/phase-01-handoff.md` containing completed task IDs, task statuses and blockers, material changes, tests and evidence, security and reliability findings, decisions/ADRs, current Git state, known debt, and exact next-phase instructions.

## Stop rule
**Record the phase handoff at the phase boundary before starting the next phase.**
