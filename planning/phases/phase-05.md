# Phase 05 — Planning compiler & artifact generator

## Objective
Core generation only; AI remains an upstream proposal source.

## Owned tasks
- **P05-01** — Implement planning compiler IR _(priority: critical)_
- **P05-02** — Implement artifact renderers _(priority: high)_
- **P05-03** — Implement generation manifest/checksums _(priority: high)_
- **P05-04** — Create golden generated-repository fixtures _(priority: critical)_
- **P05-05** — Test idempotent regeneration _(priority: critical)_

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
1. Work only on Phase 05.
2. Move a task to `IN_PROGRESS` before implementation.
3. Preserve requirement → decision/risk → task → test → commit/PR traceability.
4. Add tests in the same phase as the behavior they protect.
5. Prefer deterministic behavior and explicit schemas over heuristic magic.
6. Record blockers instead of inventing evidence.
7. Update docs and state before the phase handoff.
8. Do not begin Phase 06 in this session.

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
- [ ] Same normalized model + locked packs produce byte-stable or intentionally normalized output.
- [ ] Generated ownership is recorded in a manifest.
- [ ] Regeneration preserves unmanaged content.
- [ ] Golden fixtures cover at least low-, medium-, and high-assurance projects.
- [ ] Second generation with unchanged inputs produces no unintended diff.

## Required phase handoff
Create `planning/handoffs/phase-05-handoff.md` containing:
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
**HARD STOP after Phase 05. Do not start another phase in this session.**

## CHG-001 addendum (accepted 2026-09-20)
Sourced from `planning/phase-addenda/phase-05-addendum.md`; full change package in `planning/changes/CHG-001-quality-context-governance/`.

Add:
- generated/merged/seeded/user ownership;
- artifact lineage;
- safe synth/update preview;
- standards/context docs generation;
- golden tests for preserving user-owned files and merged sections.
