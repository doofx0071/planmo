# Phase 01 — Repository & engineering foundation

## Objective
Foundation only; no feature implementation beyond a CLI smoke command.

## Owned tasks
- **P01-01** — Create pnpm TypeScript monorepo _(priority: high)_
- **P01-02** — Add lint format typecheck and Vitest _(priority: high)_
- **P01-03** — Add GitHub Actions cross-platform CI _(priority: high)_
- **P01-04** — Add Changesets release foundation _(priority: medium)_
- **P01-05** — Create package boundary rules _(priority: high)_

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
1. Work only on Phase 01.
2. Move a task to `IN_PROGRESS` before implementation.
3. Preserve requirement → decision/risk → task → test → commit/PR traceability.
4. Add tests in the same phase as the behavior they protect.
5. Prefer deterministic behavior and explicit schemas over heuristic magic.
6. Record blockers instead of inventing evidence.
7. Update docs and state before the phase handoff.
8. Do not begin Phase 02 in this session.

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
- [ ] Fresh clone installs reproducibly with the pinned package manager.
- [ ] lint, format-check, typecheck and unit test commands run successfully.
- [ ] CI covers Linux, macOS and Windows for supported Node LTS versions where practical.
- [ ] Package dependency boundaries are documented and enforced.
- [ ] Release/versioning scaffolding exists without publishing anything.

## Required phase handoff
Create `planning/handoffs/phase-01-handoff.md` containing:
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
**HARD STOP after Phase 01. Do not start another phase in this session.**
