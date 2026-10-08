# Phase 02 — Canonical project model & schemas

## Objective
Schema-version every persisted PlanMo document and add migration tests..

## Tasks
| Task | Title | Status |
|---|---|---|
| P02-01 | Schema-version every persisted PlanMo document and add migration tests. | TODO |
| P02-02 | Tests & evidence for the phase exit gates | TODO |
| P02-03 | Docs & traceability for Canonical project model & schemas | TODO |
| P02-04 | Record the phase handoff | TODO |

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
Create `planning/handoffs/phase-02-handoff.md` containing completed task IDs, task statuses and blockers, material changes, tests and evidence, security and reliability findings, decisions/ADRs, current Git state, known debt, and exact next-phase instructions.

## Stop rule
**Record the phase handoff at the phase boundary before starting the next phase.**
