# Phase 05 — Planning compiler & artifact generator

## Objective
Generate plan documents with an ownership manifest and reproducible regeneration..

## Tasks
| Task | Title | Status |
|---|---|---|
| P05-01 | Generate plan documents with an ownership manifest and reproducible regeneration. | TODO |
| P05-02 | Tests & evidence for the phase exit gates | TODO |
| P05-03 | Docs & traceability for Planning compiler & artifact generator | TODO |
| P05-04 | Record the phase handoff | TODO |

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
Create `planning/handoffs/phase-05-handoff.md` containing completed task IDs, task statuses and blockers, material changes, tests and evidence, security and reliability findings, decisions/ADRs, current Git state, known debt, and exact next-phase instructions.

## Stop rule
**HARD STOP after Phase 05. Do not start another phase in this session.**
