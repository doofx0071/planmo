# CHG-001 Rebaseline Acceptance Gates

Verified during rebaseline (2026-09-20):

- [x] Phase 03 completion remains intact and traceable. — Verified: `674c152` (Merge PR #3, `feat/phase-03-cli-foundation`); 131 tests green; handoff `planning/handoffs/phase-03-handoff.md` untouched.
- [x] No completed Phase 00–03 task ID is renumbered. — `planning/tasks.csv` P00-01..P03-05 unchanged; 35 CHG-001 tasks appended as new IDs.
- [x] New REQ-STD/QLT/CTX/MEM/CHG/SYN/WRK/ARCH/EVAL/TRUST families exist. — Listed in `planning/REQUIREMENTS-TRACEABILITY.md`; CHG-001 trace table added.
- [x] New requirements map to future phase tasks. — CHG-001 trace table maps every family to P04–P12 task IDs; `tasks.csv` carries the 35 appended tasks.
- [x] Memory authority hierarchy is explicit. — ADR-0013 + `docs/14-context-memory/architecture.md` (Layer A canonical > Layer B durable memory > derived indexes).
- [x] Local-first v1 memory decision is recorded. — ADR-0014 + `docs/14-context-memory/storage-portability.md`; no hosted/vector/graph dependency.
- [x] Raw chat is not the default durable memory format. — `docs/14-context-memory/lifecycle.md`; DECISIONS CHG-001 section.
- [x] Token-budgeted context bundle concept is accepted. — ADR-0014 + `docs/14-context-memory/retrieval-token-budget.md` (progressive disclosure levels, budget allocation).
- [x] Memory poisoning/secrets/staleness risks are in the risk register. — R-CTX-02/03/04 in `planning/RISKS.md` CHG-001 additions.
- [x] Phase 04–12 prompts are updated or have explicit addenda. — `planning/phase-addenda/phase-04..12-addendum.md` merged into each `planning/phases/phase-NN.md`; prompts unchanged (addenda explicit).
- [x] New ADRs are accepted/rejected explicitly. — All six pack ADRs ACCEPTED; renumbered 0012–0017 (collision with existing ADR-0007..0011); dispositions in `decision.md`.
- [x] Rebaseline itself has a handoff and commit/PR. — `planning/handoffs/chg-001-rebaseline-handoff.md`; branch `chg-001-quality-context-memory-rebaseline` → PR.