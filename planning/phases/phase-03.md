# Phase 03 — CLI foundation

## Objective
Safe deterministic CLI primitives; no pack ecosystem yet.

## Owned tasks
- **P03-01** — Implement safe project-root and path utilities _(priority: critical)_
- **P03-02** — Implement managed-file writer dry-run and diff _(priority: critical)_
- **P03-03** — Implement planmo init wizard _(priority: high)_
- **P03-04** — Implement planmo status _(priority: medium)_
- **P03-05** — Add collision/symlink/path traversal tests _(priority: critical)_

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
1. Work only on Phase 03.
2. Move a task to `IN_PROGRESS` before implementation.
3. Preserve requirement → decision/risk → task → test → commit/PR traceability.
4. Add tests in the same phase as the behavior they protect.
5. Prefer deterministic behavior and explicit schemas over heuristic magic.
6. Record blockers instead of inventing evidence.
7. Update docs and state before the phase handoff.
8. Do not begin Phase 04 in this session.

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
- [ ] `planmo init` can create a minimal valid PlanMo workspace.
- [ ] Dry-run shows intended changes without writing.
- [ ] Existing unmanaged files are never silently overwritten.
- [ ] Path traversal and unsafe symlink cases fail closed.
- [ ] `planmo status` reads state without mutating the repository.

## Required phase handoff
Create `planning/handoffs/phase-03-handoff.md` containing:
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
**HARD STOP after Phase 03. Do not start another phase in this session.**
