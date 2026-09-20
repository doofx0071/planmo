# Upgrade Migration Checklist

State as of 2026-09-20 — CHG-001 rebaseline execution record.

## Before
- [x] Phase 03 is committed and clean. — `674c152` (= origin/main), tree clean before rebaseline.
- [x] `phase-03-handoff.md` exists. — `planning/handoffs/phase-03-handoff.md` (untouched by rebaseline).
- [x] `pnpm check` passes. — exit 0, 131 tests (re-run at gate in this session).
- [x] backup/branch/tag exists. — branch `chg-001-quality-context-memory-rebaseline`; main at `674c152`.

## Rebaseline
- [x] CHG-001 folder copied. — `planning/changes/CHG-001-quality-context-governance/` (source pack archived as `source-pack.zip`; decision, proposal, requirements, tasks, risks, impact, roadmap-delta, acceptance-gates, migration-checklist).
- [x] proposed ADRs reviewed. — All six accepted; renumbered 0012–0017 (collision with existing ADR-0007..0011); dispositions in `decision.md`.
- [x] requirement families appended. — REQ-STD/QLT/CTX/MEM/CHG/SYN/WRK/ARCH/EVAL/TRUST added to `planning/REQUIREMENTS-TRACEABILITY.md` with a CHG-001 trace table.
- [x] tasks appended without changing completed IDs. — 35 CHG-001 tasks appended (P04-06..P12-11); P00-01..P03-05 unchanged.
- [x] phase addenda merged. — `planning/phase-addenda/phase-04..12-addendum.md` created and merged into each `planning/phases/phase-NN.md`.
- [x] AGENTS additions merged. — Engineering Quality + Context/Memory Authority sections added to `AGENTS.md`.
- [x] risks/traceability updated. — `planning/RISKS.md` (R-CTX-01..09, R-QLT-01, R-CHG-01, R-WRK-01); DECISIONS + MASTER-PLAN + ROADMAP + TRACKER updated.
- [x] planning consistency validation passes. — verified below (tasks.csv/statuses/IDs unique; MANIFEST == git ls-files; no secrets).

## Memory-specific
- [x] canonical authority hierarchy accepted. — ADR-0013.
- [x] local-first baseline accepted. — ADR-0014.
- [x] raw chat persistence is opt-in/not default. — `docs/14-context-memory/lifecycle.md` + DECISIONS.
- [x] secret redaction requirement exists. — REQ-MEM-008 + `docs/14-context-memory/security.md` + R-CTX-04.
- [x] provenance and temporal validity required. — REQ-MEM-003/004 + `docs/14-context-memory/memory-model.md`.
- [x] context token budgets required. — REQ-CTX-003 + `docs/14-context-memory/retrieval-token-budget.md`.
- [x] poisoning/staleness eval tasks exist. — P12-10 (poisoning/staleness/security tests), P12-08 (retrieval evals), P09-10 (memory/context health diagnostics).

## After
- [x] rebaseline handoff created. — `planning/handoffs/chg-001-rebaseline-handoff.md`.
- [x] rebaseline commit/PR created. — focused Conventional Commits on `chg-001-quality-context-memory-rebaseline` → PR #4 (CI blocked by R-021 as before).
- [x] next phase remains Phase 04. — tracker/state unchanged; `.planmo/state.yml` nextPrompt still `05-phase-04-pack-and-profile-system.md`.
- [ ] new fresh session used for Phase 04. — OUT OF SCOPE for this session (hard stop before Phase 04).