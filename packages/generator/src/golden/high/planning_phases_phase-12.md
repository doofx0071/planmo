# Phase 12 — Hardening, pilot & v1

## Objective
Hardening, security review, pilot, and v1 release..

## Tasks
| Task | Title | Status |
|---|---|---|
| P12-01 | Hardening, security review, pilot, and v1 release. | TODO |
| P12-02 | Tests & evidence for the phase exit gates | TODO |
| P12-03 | Docs & traceability for Hardening, pilot & v1 | TODO |
| P12-04 | Record the phase handoff | TODO |

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
Create `planning/handoffs/phase-12-handoff.md` containing completed task IDs, task statuses and blockers, material changes, tests and evidence, security and reliability findings, decisions/ADRs, current Git state, known debt, and exact next-phase instructions.

## Stop rule
**HARD STOP after Phase 12. Do not start another phase in this session.**
