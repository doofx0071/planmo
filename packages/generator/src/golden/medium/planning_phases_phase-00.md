# Phase 00 — Product & research foundation

## Objective
Lock product boundaries, naming, licensing criteria, and non-goals..

## Tasks
| Task | Title | Status |
|---|---|---|
| P00-01 | Implement Lock product boundaries, naming, licensing criteria, and non-goals. | TODO |
| P00-02 | Tests & evidence for the phase exit gates | TODO |
| P00-03 | Docs & traceability for Product & research foundation | TODO |
| P00-04 | Record the phase handoff | TODO |

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
Create `planning/handoffs/phase-00-handoff.md` containing completed task IDs, task statuses and blockers, material changes, tests and evidence, security and reliability findings, decisions/ADRs, current Git state, known debt, and exact next-phase instructions.

## Stop rule
**HARD STOP after Phase 00. Do not start another phase in this session.**
