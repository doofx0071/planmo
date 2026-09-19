# Phase 02 — Canonical project model & schemas

## Objective
Schemas and migrations only; do not build full CLI workflows.

## Owned tasks
- **P02-01** — Implement project config schema _(priority: high)_
- **P02-02** — Implement state lock manifest schemas _(priority: high)_
- **P02-03** — Implement pack and design schemas _(priority: high)_
- **P02-04** — Implement trace handoff work-packet schemas _(priority: high)_
- **P02-05** — Create schema versioning/migration tests _(priority: high)_

## Required inputs
- Root `AGENTS.md`
- `prompts/MASTER-GUARDRAILS.md`
- `planning/MASTER-PLAN.md`
- `planning/ROADMAP.md`
- `planning/TRACKER.md`
- `planning/tasks.csv`
- `planning/RISKS.md`
- `planning/DECISIONS.md`
- relevant docs and ADRs
- previous phase handoff, when one exists
- current Git status/history

## Execution rules
1. Work only on Phase 02.
2. Move a task to `IN_PROGRESS` before implementation.
3. Preserve requirement → decision/risk → task → test → commit/PR traceability.
4. Add tests in the same phase as the behavior they protect.
5. Prefer deterministic behavior and explicit schemas over heuristic magic.
6. Record blockers instead of inventing evidence.
7. Update docs and state before the phase handoff.
8. Do not begin Phase 03 in this session.

## Test & evidence gate
Tests depend on the task, but this phase must include all applicable:
- unit tests;
- integration tests;
- schema/snapshot/golden tests;
- negative/error-path tests;
- cross-platform tests where filesystem/CLI behavior is involved;
- security tests for untrusted inputs;
- migration/upgrade tests for persisted formats;
- reproducibility/idempotency tests for generation.

No critical behavior may rely only on a manual happy-path check.

## Exit gates
- [ ] Every persisted PlanMo document has an explicit schema version.
- [ ] Invalid and unknown fields follow a deliberate policy.
- [ ] Round-trip serialization tests exist.
- [ ] Schema migrations are deterministic and covered by fixtures.
- [ ] No generator behavior depends on untyped arbitrary AI prose.

## Required phase handoff
Create `planning/handoffs/phase-02-handoff.md` containing:
- completed task IDs;
- task statuses and blockers;
- files/packages materially changed;
- commands/tests actually executed and results;
- security/reliability findings;
- ADRs/decisions created;
- current Git branch and commits/PR;
- known debt;
- exact next phase;
- instructions needed for the next fresh session.

## Stop rule
**HARD STOP after Phase 02. Do not start another phase in this session.**
