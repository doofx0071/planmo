# Phase 00 — Product & research foundation

## Objective
Research and product decisions only; no product implementation.

## Owned tasks
- **P00-01** — Confirm product positioning and non-goals _(priority: high)_
- **P00-02** — Verify naming/package/repository availability and fallback naming _(priority: high)_
- **P00-03** — Lock initial agent/platform/style support matrix _(priority: high)_
- **P00-04** — Finalize official-source research baseline _(priority: medium)_
- **P00-05** — Record licensing decision criteria _(priority: medium)_

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
1. Work only on Phase 00.
2. Move a task to `IN_PROGRESS` before implementation.
3. Preserve requirement → decision/risk → task → test → commit/PR traceability.
4. Add tests in the same phase as the behavior they protect.
5. Prefer deterministic behavior and explicit schemas over heuristic magic.
6. Record blockers instead of inventing evidence.
7. Update docs and state before the phase handoff.
8. Do not begin Phase 01 in this session.

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
- [ ] Product thesis and non-goals are explicit and internally consistent.
- [ ] Initial supported agents, platforms, design styles, and package targets are recorded.
- [ ] Freshness-sensitive technical assumptions have authoritative source notes with retrieval dates.
- [ ] Naming/package availability risk is recorded; implementation does not depend on an unverified public name.
- [ ] Phase 01 can begin without unresolved architecture-defining questions.

## Required phase handoff
Create `planning/handoffs/phase-00-handoff.md` containing:
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
**HARD STOP after Phase 00. Do not start another phase in this session.**
