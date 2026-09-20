# Phase 11 — Ecosystem & integrations

## Objective
No arbitrary remote code execution in v1.

## Owned tasks
- **P11-01** — Define remote pack trust model _(priority: critical)_
- **P11-02** — Implement catalog/source abstraction _(priority: high)_
- **P11-03** — Implement checksums/pinning/reversibility _(priority: high)_
- **P11-04** — Document pack authoring _(priority: medium)_
- **P11-05** — Prototype GitHub export integration _(priority: low)_

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
1. Work only on Phase 11.
2. Move a task to `IN_PROGRESS` before implementation.
3. Preserve requirement → decision/risk → task → test → commit/PR traceability.
4. Add tests in the same phase as the behavior they protect.
5. Prefer deterministic behavior and explicit schemas over heuristic magic.
6. Record blockers instead of inventing evidence.
7. Update docs and state before the phase handoff.
8. Do not begin Phase 12 in this session.

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
- [ ] Remote sources are opt-in and integrity-checked.
- [ ] Pack provenance and trust status are visible.
- [ ] Install/update operations are reversible or diffable.
- [ ] Authoring docs define compatibility/versioning rules.
- [ ] GitHub export is additive and does not become a core dependency.

## Required phase handoff
Create `planning/handoffs/phase-11-handoff.md` containing:
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
**HARD STOP after Phase 11. Do not start another phase in this session.**

## CHG-001 addendum (accepted 2026-09-20)
Sourced from `planning/phase-addenda/phase-11-addendum.md`; full change package in `planning/changes/CHG-001-quality-context-governance/`.

Add:
- standards/context pack authoring;
- context export/import;
- optional MemoryProvider adapters;
- provenance/trust metadata.

Remote executable hooks remain out of scope.
