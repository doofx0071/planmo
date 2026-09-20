# Phase 07 — Frontend design engine

## Objective
Planning/design outputs only; PlanMo is not a component library.

## Owned tasks
- **P07-01** — Implement design profile schema/model _(priority: high)_
- **P07-02** — Implement DTCG token generation _(priority: high)_
- **P07-03** — Create 8 initial design packs _(priority: medium)_
- **P07-04** — Implement shadcn source/registry adapter _(priority: medium)_
- **P07-05** — Implement frontend design docs generator _(priority: medium)_
- **P07-06** — Add accessibility/motion design validation _(priority: high)_

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
1. Work only on Phase 07.
2. Move a task to `IN_PROGRESS` before implementation.
3. Preserve requirement → decision/risk → task → test → commit/PR traceability.
4. Add tests in the same phase as the behavior they protect.
5. Prefer deterministic behavior and explicit schemas over heuristic magic.
6. Record blockers instead of inventing evidence.
7. Update docs and state before the phase handoff.
8. Do not begin Phase 08 in this session.

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
- [ ] Design style, component system, source registry, tokens, type, icons, density, motion and accessibility are independent dimensions.
- [ ] DTCG-format tokens are canonical; framework outputs are adapters.
- [ ] Eight initial style packs are documented and testable.
- [ ] Generated design guidance includes anti-patterns and responsive/accessibility requirements.
- [ ] Third-party registry suggestions carry trust/review metadata.

## Required phase handoff
Create `planning/handoffs/phase-07-handoff.md` containing:
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
**HARD STOP after Phase 07. Do not start another phase in this session.**

## CHG-001 addendum (accepted 2026-09-20)
Sourced from `planning/phase-addenda/phase-07-addendum.md`; full change package in `planning/changes/CHG-001-quality-context-governance/`.

Add:
- design standards as structured standards;
- anti-pattern policies;
- accessibility/motion requirements to applicable-standards injection;
- design-quality validation fixtures.
