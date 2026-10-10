# Phase 04 — Pack & profile system

## Objective
Implement declarative packs, deterministic resolution, lockfile, profiles.

## Tasks
| Task | Title | Priority | Status |
|---|---|---|---|
| P04-01 | Implement declarative packs, deterministic resolution, lockfile, profiles. | MUST | TODO |
| P04-02 | Tests & evidence for the phase exit gates | MUST | TODO |
| P04-03 | Docs & traceability for Pack & profile system | SHOULD | TODO |
| P04-04 | Record the phase handoff | SHOULD | TODO |

### Acceptance criteria

A task is DONE only when every criterion below holds. A task whose verification
is `required` also needs a recorded result in `planning/testing/TEST-EVIDENCE.csv`.

**P04-01** — verification **required**
- [ ] The phase objective is met: Implement declarative packs, deterministic resolution, lockfile, profiles.
- [ ] Every exit gate named in planning/phases/phase-04.md passes

**P04-02** — verification **required**
- [ ] Each exit gate has a recorded result in planning/testing/TEST-EVIDENCE.csv
- [ ] Any check that was not run is marked as not run, not left blank

**P04-03** — verification optional
- [ ] planning/TRACKER.md and planning/REQUIREMENTS-TRACEABILITY.md reflect phase 04

**P04-04** — verification optional
- [ ] planning/handoffs/phase-04-handoff.md is recorded and names the next phase

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
