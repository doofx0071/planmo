# Phase 08 — Workflow/session engine

## Objective
One phase at a time remains the default execution model.

## Owned tasks
- **P08-01** — Implement phase/state transition engine _(priority: critical)_
- **P08-02** — Implement handoff contract and generator _(priority: high)_
- **P08-03** — Implement planmo next _(priority: high)_
- **P08-04** — Implement parallel work packet compiler _(priority: medium)_
- **P08-05** — Implement human/blocking gates _(priority: high)_

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
1. Work only on Phase 08.
2. Move a task to `IN_PROGRESS` before implementation.
3. Preserve requirement → decision/risk → task → test → commit/PR traceability.
4. Add tests in the same phase as the behavior they protect.
5. Prefer deterministic behavior and explicit schemas over heuristic magic.
6. Record blockers instead of inventing evidence.
7. Update docs and state before the phase handoff.
8. Do not begin Phase 09 in this session.

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
- [ ] Phase transitions are validated against dependency and gate rules.
- [ ] Hard-stop/fresh-session workflow is representable.
- [ ] Handoffs are schema-valid and sufficient to resume from repository state.
- [ ] Parallel work packets have non-overlapping ownership metadata.
- [ ] Human gates and blockers prevent unsafe automatic progression.

## Required phase handoff
Create `planning/handoffs/phase-08-handoff.md` containing:
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
**HARD STOP after Phase 08. Do not start another phase in this session.**
