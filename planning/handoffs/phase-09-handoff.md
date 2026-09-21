# Phase 09 Handoff — Trace, validate, doctor & drift

- **Status:** COMPLETE (2026-09-21)
- **Branch:** `feat/phase-09-trace-validate-doctor`
- **Merge:** PR (implementation `744aee6` + close-out commit)
- **Gate:** `pnpm run check` exit 0 — build · typecheck · **617 tests** (73 new) · lint · format:check · boundary-check · smoke; E2E `node scripts/e2e-phase09.mjs` → `PHASE 09 E2E OK`
- **PlanMo state:** `.planmo/state.yml` → `currentPhase: "10"`, `completedPhases: ["00".."09"]`, next `prompts/11-phase-10-existing-repository-adoption.md`
- **Tasks:** P09-01..10 all DONE (77 total done across phases)

## What shipped

New package **`@planmo/trace`** (boundary widened to `['core','shared','schema','workflow']`; `cli` gained `trace` for future thin shells) — all diagnostics carry stable CI codes:

| Task | Module | Codes / surface |
|---|---|---|
| P09-01/04 | `trace-graph.ts`, `trace-render.ts` | TRC-001 orphaned requirement · TRC-002 untested task · TRC-003 dangling evidence · TRC-004 missing link target; byte-stable plain-text renderer (`TRACE REPORT - <label>`, counts line, PASS/WARN/FAIL) — 15 tests |
| P09-02 | `validate.ts` | VLD-001 phase gap · VLD-002 blocked-task mismatch · VLD-003 handoff next-phase drift · VLD-004 schema-parse failures — 12 tests (23 in shared file) |
| P09-03 | `doctor.ts` | DOC-001 node<24 error · DOC-002 node≥25 ahead-of-LTS warn · DOC-003 non-pnpm error · DOC-004 dirty worktree warn · DOC-005 fresh gate info · DOC-006 missing prompts — never mutates |
| P09-06 | `quality.ts` | QLT-001 size · QLT-002 nesting · QLT-003 duplication · QLT-004 missing test coverage (error) · QLT-005 doc coverage · QLT-006 side effects; **NO aggregate score** (asserted) |
| P09-07 (lead) | `fitness.ts` | FIT-001 undeclared edge · FIT-002 cycle · FIT-003 dist-import; failures carry rule/path/remediation |
| P09-08 (lead) | `standards-drift.ts` + schema/design-engine | DRF-001 declared-missing · DRF-002 selected-undeclared · DRF-003 unknown class; **`design` added to `STANDARD_CLASSES`** + `designStandardsFor` prunes web rules on backendOnly and touch-target floor on spacious — closes Phase 07 flagged item |
| P09-09 | `debt.ts` | DEBT-001 overdue · DEBT-002 scheduled · DEBT-003 pathless · DEBT-004 unknown status; `countsByStatus` |
| P09-10 | `memory-health.ts` | MEM-001 stale hash · MEM-002 dangling provenance · MEM-003 empty · MEM-004 duplicate pairs (error) · MEM-005 rebuild-eligible + `rebuildRecommended` |
| P09-05 (lead) | `fixtures/drift.ts` | canonical drift fixture: orphan REQ-C, untested P03-01, dangling test, missing target — consumed by trace-graph tests + E2E |

`contracts.ts` — frozen contracts for trace/validate/doctor/quality/debt/memory-health/fitness/standards-drift + shared Diagnostic/DiagnosticReport/sortDiagnostics/severityRank/countsOf. Lead reconciled a stale freeze (briefs specified factory engines, frozen file carried old `Validator.run` shapes) by updating contracts to the brief-accurate shapes and pointing duplicate type definitions at the worker modules.

## Architecture decisions

- **Stable diagnostic codes are the contract** — CI can gate on `[VLD-001]` etc. Codes are frozen per family; new diagnostics get new codes, existing codes never repurposed.
- **Quality emits findings, never a score** (quality-engine.md): no aggregate, evidence string on every finding.
- **Doctor never mutates** — pure function over injected env facts; the future CLI shell resolves env and passes it in.
- **Trace-graph evidence rule**: a task counts as tested only with PASSING test rows (drift-gate conservative); canonical lists remain authoritative (ADR-0013).
- **Boundary widening recorded**: `trace: ['core','shared','schema','workflow']` (memory health reuses workflow's consolidated rows), `cli: [..., 'trace']` (thin shells later).
- **Latent Phase 08 packaging fix**: `@planmo/workflow` lacked `main`/`types`/`exports` — no consumer existed until trace imported it; added matching schema-package shape.
- Engines stay pure/deterministic: no filesystem, no clock, no randomness; all diagnostics sorted (severity > code > target) and byte-stable.

## Verification

- E2E (`scripts/e2e-phase09.mjs`): trace graph on drift fixture (REQ-C orphan, P03-01 untested, counts), renderer header+counts+result, validate clean canonical input, doctor clean env, quality no-score, debt clean, memory MEM-003-only, standards drift clean, fitness clean boundary → 17/17 checks.
- Gate 617/617; boundary-check green; Prettier clean; secret scan clean.
- Worker discipline: 3/3 landed files (A 15 tests, B 23, C 21 + lead 14); 3 accidental duplicate-C agents from Phase 08 were stopped before writing (no collision in this phase; dispatch was 3 clean tasks).

## For Phase 10 (Existing-repository adoption)

- `@planmo/trace` dist import-ready: `createTraceGraphEngine`, `validatorEngine`, `doctorEngine`, `qualityEngine`, `debtEngine`, `memoryHealthEngine`, `standardsDriftEngine`, `fitnessEngine` + shared `DiagnosticReport`.
- CLI shells (`planmo validate/doctor/trace/quality`) remain unwired — thin adapters calling these engines, exit code from worst severity.
- Phase 10's safe scanner can emit `QualityFile[]` for `qualityEngine` (loc/nesting/exports/side-effects) and feed `fitnessEngine` observed edges — designed for exactly that.
- `designStandardsFor(profile)` now prunes by profile — Phase 10 standards injection can consume it directly.
- Keep code-family table in `docs/12-adrs/ADR-0023` in sync when adding diagnostic codes.

## Docs updated

ADR-0023 · `planning/REQUIREMENTS-TRACEABILITY.md` (Phase 09 trace + REQ-QLT/REQ-ARCH rows) · `planning/DECISIONS.md` · `planning/TRACKER.md` · `planning/tasks.csv` (P09 DONE) · `.planmo/state.yml` · `CHANGELOG.md` · `.changeset/phase-09-trace-validate-doctor-drift.md` · `scripts/check-boundaries.mjs` (trace + cli edges) · MANIFEST regenerated.