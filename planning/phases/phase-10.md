# Phase 10 — Existing repository adoption

## Objective
Passive analysis first; destructive codemods are out of scope.

## Owned tasks
- **P10-01** — Implement safe repository scanner _(priority: critical)_
- **P10-02** — Implement stack/test/CI detection _(priority: high)_
- **P10-03** — Implement prompt-injection isolation policy _(priority: critical)_
- **P10-04** — Implement planmo adopt _(priority: high)_
- **P10-05** — Add malicious brownfield fixtures _(priority: critical)_

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
1. Work only on Phase 10.
2. Move a task to `IN_PROGRESS` before implementation.
3. Preserve requirement → decision/risk → task → test → commit/PR traceability.
4. Add tests in the same phase as the behavior they protect.
5. Prefer deterministic behavior and explicit schemas over heuristic magic.
6. Record blockers instead of inventing evidence.
7. Update docs and state before the phase handoff.
8. Do not begin Phase 11 in this session.

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
- [ ] Scanner treats repository content as untrusted data.
- [ ] Detection is evidence-backed with confidence/source metadata.
- [ ] `adopt` defaults to dry-run and never rewrites application code.
- [ ] Prompt-like instructions found in scanned content cannot override PlanMo policy.
- [ ] Malicious path/symlink/config fixtures are covered.

## Required phase handoff
Create `planning/handoffs/phase-10-handoff.md` containing:
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
**HARD STOP after Phase 10. Do not start another phase in this session.**

## CHG-001 addendum (accepted 2026-09-20)
Sourced from `planning/phase-addenda/phase-10-addendum.md`; full change package in `planning/changes/CHG-001-quality-context-governance/`.

Add:
- repository context map;
- symbol/reference map;
- standards discovery;
- local lexical context index;
- brownfield memory bootstrap;
- memory poisoning/prompt-injection fixtures.
