# Phase 11 — Ecosystem & integrations

## Objective
Packs registry, templates, agent ecosystem integrations.

## Tasks
| Task | Title | Priority | Status |
|---|---|---|---|
| P11-01 | Packs registry, templates, agent ecosystem integrations. | MUST | TODO |
| P11-02 | Tests & evidence for the phase exit gates | MUST | TODO |
| P11-03 | Docs & traceability for Ecosystem & integrations | SHOULD | TODO |
| P11-04 | Record the phase handoff | SHOULD | TODO |

### Acceptance criteria

A task is DONE only when every criterion below holds. A task whose verification
is `required` also needs a recorded result in `planning/testing/TEST-EVIDENCE.csv`.

**P11-01** — verification **required**
- [ ] The phase objective is met: Packs registry, templates, agent ecosystem integrations.
- [ ] Every exit gate named in planning/phases/phase-11.md passes

**P11-02** — verification **required**
- [ ] Each exit gate has a recorded result in planning/testing/TEST-EVIDENCE.csv
- [ ] Any check that was not run is marked as not run, not left blank

**P11-03** — verification optional
- [ ] planning/TRACKER.md and planning/REQUIREMENTS-TRACEABILITY.md reflect phase 11

**P11-04** — verification optional
- [ ] planning/handoffs/phase-11-handoff.md is recorded and names the next phase

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
Create `planning/handoffs/phase-11-handoff.md` containing completed task IDs, task statuses and blockers, material changes, tests and evidence, security and reliability findings, decisions/ADRs, current Git state, known debt, and exact next-phase instructions.

## Stop rule
**HARD STOP after Phase 11. Do not start another phase in this session.**
