# Phase 04 — Pack & profile system

## Objective
Local/trusted declarative packs first; remote ecosystem remains gated.

## Owned tasks
- **P04-01** — Implement declarative pack loader _(priority: high)_
- **P04-02** — Implement deterministic resolution and conflicts _(priority: high)_
- **P04-03** — Implement lockfile generation _(priority: high)_
- **P04-04** — Create planning-depth profiles _(priority: medium)_
- **P04-05** — Add malicious/conflicting pack fixtures _(priority: high)_

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
1. Work only on Phase 04.
2. Move a task to `IN_PROGRESS` before implementation.
3. Preserve requirement → decision/risk → task → test → commit/PR traceability.
4. Add tests in the same phase as the behavior they protect.
5. Prefer deterministic behavior and explicit schemas over heuristic magic.
6. Record blockers instead of inventing evidence.
7. Update docs and state before the phase handoff.
8. Do not begin Phase 05 in this session.

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
- [ ] Pack resolution is deterministic for identical inputs.
- [ ] Compatibility conflicts produce actionable diagnostics.
- [ ] Resolved pack versions/checksums are locked.
- [ ] v1 packs are declarative and cannot execute arbitrary code.
- [ ] Lean/Standard/Production/High-Assurance profiles compile predictably.

## Required phase handoff
Create `planning/handoffs/phase-04-handoff.md` containing:
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
**HARD STOP after Phase 04. Do not start another phase in this session.**
