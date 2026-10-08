# Phase 04 — Pack & profile system

## Objective
Implement declarative packs, deterministic resolution, lockfile, profiles..

## Tasks
| Task | Title | Status |
|---|---|---|
| P04-01 | Implement Implement declarative packs, deterministic resolution, lockfile, profiles. | TODO |
| P04-02 | Tests & evidence for the phase exit gates | TODO |
| P04-03 | Docs & traceability for Pack & profile system | TODO |
| P04-04 | Record the phase handoff | TODO |

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
Create `planning/handoffs/phase-04-handoff.md` containing completed task IDs, task statuses and blockers, material changes, tests and evidence, security and reliability findings, decisions/ADRs, current Git state, known debt, and exact next-phase instructions.

## Stop rule
**HARD STOP after Phase 04. Do not start another phase in this session.**
