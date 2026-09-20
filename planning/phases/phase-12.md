# Phase 12 — Hardening, pilot & v1

## Objective
Release/hardening only; defer new feature scope.

## Owned tasks
- **P12-01** — Run security review and threat-model validation _(priority: critical)_
- **P12-02** — Run property/fuzz tests on high-risk parsers _(priority: critical)_
- **P12-03** — Run cross-platform E2E matrix _(priority: critical)_
- **P12-04** — Validate upgrades/migrations _(priority: high)_
- **P12-05** — Pilot PlanMo on representative projects _(priority: critical)_
- **P12-06** — Publish docs/examples/package release candidate _(priority: high)_
- **P12-07** — Conduct 1.0 go/no-go review _(priority: critical)_

## Required inputs
- Root `AGENTS.md`
- `prompts/MASTER-GUARDRAILS.md`
- all roadmap/tracker/risk/decision documents
- all prior handoffs
- current Git status/history
- release/security/test evidence

## Execution rules
1. Work only on Phase 12.
2. Move a task to `IN_PROGRESS` before work.
3. Preserve traceability.
4. Do not waive failed release gates to publish.
5. Update all final documentation and evidence.


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
- [ ] No unresolved critical security finding.
- [ ] Cross-platform E2E passes on the supported matrix.
- [ ] Schema and pack upgrade paths are tested from supported prior versions.
- [ ] Representative greenfield and brownfield pilots complete successfully.
- [ ] Documentation is sufficient for a new user to initialize and continue a project.
- [ ] 1.0 release is explicitly approved against the release checklist.

## Required phase handoff
Create `planning/handoffs/phase-12-handoff.md` containing:
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
**HARD STOP after Phase 12. Do not start another phase in this session.**

## CHG-001 addendum (accepted 2026-09-20)
Sourced from `planning/phase-addenda/phase-12-addendum.md`; full change package in `planning/changes/CHG-001-quality-context-governance/`.

Add:
- context retrieval evals;
- token-usage benchmark;
- poisoning/staleness tests;
- corruption/rebuild tests;
- optional semantic adapter eval;
- trust metadata pilot.
