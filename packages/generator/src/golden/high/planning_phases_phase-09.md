# Phase 09 — Trace, validate, doctor & drift

## Objective
Implement trace graph, validation, drift detection, doctor command..

## Tasks
| Task | Title | Status |
|---|---|---|
| P09-01 | Implement Implement trace graph, validation, drift detection, doctor command. | TODO |
| P09-02 | Tests & evidence for the phase exit gates | TODO |
| P09-03 | Docs & traceability for Trace, validate, doctor & drift | TODO |
| P09-04 | Record the phase handoff | TODO |

## Phase mode
Phases are gated: each phase finishes with a recorded handoff before the next begins.

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
Create `planning/handoffs/phase-09-handoff.md` containing completed task IDs, task statuses and blockers, material changes, tests and evidence, security and reliability findings, decisions/ADRs, current Git state, known debt, and exact next-phase instructions.

## Stop rule
**HARD STOP after Phase 09. Do not start another phase in this session.**
