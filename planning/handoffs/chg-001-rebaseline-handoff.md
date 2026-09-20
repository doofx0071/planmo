# CHG-001 Rebaseline Handoff

## Status
COMPLETE — CHG-001 (Quality, Context, Memory & Governance) rebaseline accepted and merged into planning state. This was a **planning-only** rebaseline; Phase 04 product implementation was NOT started.

## What was verified first (source-of-truth re-check, per APPLY-CHG-001)
- Phase 03 is genuinely complete: `main` = `674c152` (merge of PR #3, `feat/phase-03-cli-foundation`), clean tree, 131 tests green, `planning/handoffs/phase-03-handoff.md` present.
- NOTE: the pack's own "known checkpoint" (`ea19fa3`, 35 tests) does not match real history — actual Phase 03 is merged via PR #3 (`674c152`, 131 tests). The rebaseline proceeded against the live repository, which is the source of truth.
- `planning/tasks.csv` P00-01..P03-05 statuses (DONE) are untouched, as required.

## Change decision
**ACCEPTED** with staged implementation across Phase 04–12. Full record: `planning/changes/CHG-001-quality-context-governance/`.

## ADR dispositions (each proposed ADR accepted/rejected explicitly)
The pack proposed ADR-0007..0012, but this repository ALREADY has ADR-0007..0011 for different topics. All six pack ADRs were therefore **ACCEPTED but renumbered** (no rejections; collision was a numbering artifact):

| Pack-proposed | Adopted as | Topic |
|---|---|---|
| ADR-0007 | **ADR-0012** | Standards and Quality Engines |
| ADR-0008 | **ADR-0013** | Context/Memory Authority Model |
| ADR-0009 | **ADR-0014** | Local-first, Rebuildable Memory/Context Index |
| ADR-0010 | **ADR-0015** | Change Packages and Requirement Deltas |
| ADR-0011 | **ADR-0016** | Managed File Ownership Classes |
| ADR-0012 | **ADR-0017** | Task Graph, Claims, and Execution Packets |

## What changed (material)
- **New docs directory trees** (copied as-is from the pack):
  - `docs/13-standards-quality/` — standards-engine, quality-engine, refactoring-technical-debt, architecture-fitness.
  - `docs/14-context-memory/` — architecture, memory-model, lifecycle, repo-context-map, retrieval-token-budget, security, storage-portability, evaluation.
  - `docs/15-change-governance/` — change-engine, managed-file-ownership, task-graph-execution-packets, context-quality-integration.
  - `docs/16-evals-trust/` — eval-engine, trust-engine-future.
  - `specs/` — context-bundle.example.md, context-request.example.yaml, engineering-policy.example.yaml, memory-record.example.yaml.
  - `docs/11-research/chg-001-inspiration-sources.md`, `docs/11-research/chg-001-research-summary.md`.
- **New ADRs 0012–0017** in `docs/12-adrs/` (renumbered; each records its pack-origin ID).
- **Change package archived**: `planning/changes/CHG-001-quality-context-governance/` (proposal, decision, requirements, tasks, risks, impact, roadmap-delta, acceptance-gates, migration-checklist, source-pack.zip).
- **Phase addenda**: `planning/phase-addenda/phase-04..12-addendum.md` created AND merged into each `planning/phases/phase-NN.md` as a `## CHG-001 addendum` section.
- **Task tracker**: 35 CHG-001 tasks appended (`planning/tasks.csv`, now 104 rows), one per proposed ID (P04-06..09, P05-06..09, P06-07..11, P07-07, P08-06..11, P09-06..10, P10-06..10, P11-06, P12-08..11). P07-07 and P11-06 were added beyond the pack's list to close the addenda gaps in Phases 07/11. All completed IDs unchanged.
- **Requirements**: 10 new families (REQ-STD, REQ-QLT, REQ-CTX, REQ-MEM, REQ-CHG, REQ-SYN, REQ-WRK, REQ-ARCH, REQ-EVAL, REQ-TRUST) added to `planning/REQUIREMENTS-TRACEABILITY.md` with a CHG-001 trace table mapping every family to tasks.
- **Risks**: 12 CHG-001 risks appended to `planning/RISKS.md` (R-CTX-01..09, R-QLT-01, R-CHG-01, R-WRK-01), namespaced to avoid collision with R-001..R-021.
- **Decisions/roadmap/master plan**: DECISIONS.md CHG-001 section; ROADMAP.md Phase 12 note + Change Governance record; MASTER-PLAN.md standards/quality/context/memory section; TRACKER.md CHG-001 line; CHANGELOG.md entry.
- **AGENTS.md**: Engineering Quality + Context/Memory Authority sections (merged per AGENTS-ADDITIONS).
- `.planmo/state.yml` unchanged: next implementation phase remains Phase 04 (`prompts/05-phase-04-pack-and-profile-system.md`).

## Constraints honored
- No completed Phase 00–03 task ID renumbered; Phase 03 history intact.
- Memory is local-first, agent-neutral, provenance-bearing, temporally valid, scope-filtered, secret-safe, token-budgeted, rebuildable (ADRs 0013/0014, `docs/14-context-memory/`).
- No hosted memory/vector/graph dependency introduced as a v1 requirement.
- Canonical repository state stays authoritative over memory.
- Raw chat transcripts are not durable memory by default.
- Tests/acceptance gates exist for each new capability: traceability rows + tracked tasks (P12-08..11 are the dedicated eval/poisoning/security/rebuild suites).

## Consistency checks (run and passed)
- `planning/tasks.csv`: 104 rows parse; all statuses valid (TODO/DONE); every ID unique; P00–P03 statuses unchanged.
- New task IDs are unique and phase-consistent (P04-06..09 etc.).
- ADR numbers 0001–0017 unique; no filename collisions in `docs/12-adrs/`.
- `planning/REQUIREMENTS-TRACEABILITY.md` families list + CHG-001 table consistent with `tasks.csv`.
- `MANIFEST.md` regenerated; equality with `git ls-files` verified.
- Secret scan (qualified patterns) clean.
- `pnpm check` on a planning-only change: still exit 0 (131 tests; no code touched).

## Git
- Branch: `chg-001-quality-context-memory-rebaseline` (GitHub Flow; PR to `main`).
- Planned commits: focused Conventional Commits (docs/ADRs, planning merge, change archive, close-out).
- PR: created after this handoff; CI still blocked by R-021 ghost (unchanged external issue).

## Known debt / next-session notes
- The pack's listed checkpoint (`ea19fa3`/35 tests) was stale relative to real history; treat pack numbers as proposals only, repo as truth.
- `docs/14-context-memory/storage-portability.md` defers concrete local storage driver choice (SQLite/FTS strong candidate) to an ADR after cross-platform benchmarking — that ADR belongs to a later phase (likely Phase 05/08 work), not this rebaseline.
- Prompts themselves were NOT edited; addenda are explicit in `planning/phase-addenda/` and merged into phase files (acceptance gate allows "updated OR explicit addenda").
- The after-rebaseline Phase 04 entry prompt from the pack (`prompts/AFTER-REBASELINE-PHASE-04.md`) is archived verbatim in `planning/changes/CHG-001-quality-context-governance/source-pack.zip`; the essential instruction is: implement Phase 04 ONLY, including standards-pack/engineering-policy/provenance additions (P04-06..09), no premature memory storage engine.

## Next phase
- Phase: **04 — Pack & profile system** (`prompts/05-phase-04-pack-and-profile-system.md`, `planning/phases/phase-04.md` incl. CHG-001 addendum).
- Read first: root AGENTS.md, this handoff, CHG-001 decision/requirements, accepted ADRs 0012–0017, tracker/tasks/risks/traceability, current Git state.
- HARD STOP after Phase 04.