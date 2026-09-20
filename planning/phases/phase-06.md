# Phase 06 — Agent bridge

## Objective
No direct provider billing/API integration required for v1.

## Owned tasks
- **P06-01** — Define agent capability contract _(priority: high)_
- **P06-02** — Implement generic adapter _(priority: high)_
- **P06-03** — Implement OpenCode adapter _(priority: medium)_
- **P06-04** — Implement Codex adapter _(priority: medium)_
- **P06-05** — Implement Claude Code adapter _(priority: medium)_
- **P06-06** — Validate structured AI proposal schema _(priority: critical)_

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
1. Work only on Phase 06.
2. Move a task to `IN_PROGRESS` before implementation.
3. Preserve requirement → decision/risk → task → test → commit/PR traceability.
4. Add tests in the same phase as the behavior they protect.
5. Prefer deterministic behavior and explicit schemas over heuristic magic.
6. Record blockers instead of inventing evidence.
7. Update docs and state before the phase handoff.
8. Do not begin Phase 07 in this session.

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
- [ ] Agent integrations translate PlanMo workflows without changing canonical semantics.
- [ ] Generic prompt output always works without a proprietary agent.
- [ ] AI proposals are schema-validated before affecting project state.
- [ ] Unsupported capabilities degrade explicitly rather than silently.
- [ ] Adapters have snapshot/golden tests.

## Required phase handoff
Create `planning/handoffs/phase-06-handoff.md` containing:
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
**HARD STOP after Phase 06. Do not start another phase in this session.**

## CHG-001 addendum (accepted 2026-09-20)
Sourced from `planning/phase-addenda/phase-06-addendum.md`; full change package in `planning/changes/CHG-001-quality-context-governance/`.

Add:
- Context Bundle contract;
- Standards Injector;
- ContextProvider and MemoryProvider interfaces;
- portable agent-neutral context serialization;
- Execution Packet rendering.

A hosted/vector memory service is not required.
