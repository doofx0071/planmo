# Phase 09 — Trace, validate, doctor & drift

## Objective
Diagnostics must be deterministic and actionable.

## Owned tasks
- **P09-01** — Implement trace graph _(priority: high)_
- **P09-02** — Implement planmo validate _(priority: high)_
- **P09-03** — Implement planmo doctor _(priority: high)_
- **P09-04** — Implement planmo trace _(priority: medium)_
- **P09-05** — Create drift/orphan diagnostics fixtures _(priority: high)_

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
1. Work only on Phase 09.
2. Move a task to `IN_PROGRESS` before implementation.
3. Preserve requirement → decision/risk → task → test → commit/PR traceability.
4. Add tests in the same phase as the behavior they protect.
5. Prefer deterministic behavior and explicit schemas over heuristic magic.
6. Record blockers instead of inventing evidence.
7. Update docs and state before the phase handoff.
8. Do not begin Phase 10 in this session.

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
- [ ] Requirements can trace to tasks/tests/PR/release metadata where available.
- [ ] `validate` checks schemas and cross-document invariants.
- [ ] `doctor` identifies environmental/project health issues without mutating state.
- [ ] Orphaned requirements, stale tasks and missing test evidence are diagnosable.
- [ ] Diagnostics have stable codes suitable for CI.

## Required phase handoff
Create `planning/handoffs/phase-09-handoff.md` containing:
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
**HARD STOP after Phase 09. Do not start another phase in this session.**
