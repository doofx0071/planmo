# Phase 08 Handoff — Workflow/session engine

- **Status:** COMPLETE (2026-09-21)
- **Branch:** `feat/phase-08-workflow-session-engine`
- **Merge:** PR (implementation `fc303e3` + close-out commit)
- **Gate:** `pnpm run check` exit 0 — build · typecheck · **544 tests** (79 new) · lint · format:check · boundary-check · smoke; E2E `node scripts/e2e-phase08.mjs` → `PHASE 08 E2E OK`
- **PlanMo state:** `.planmo/state.yml` → `currentPhase: "09"`, `completedPhases: ["00".."08"]`, next `prompts/10-phase-09-trace-validate-doctor-and-drift.md`
- **Tasks:** P08-01..11 all DONE (67 total done across phases)

## What shipped

New package **`@planmo/workflow`** — boundary **widened** from the pre-registered `['core','shared']` to `['core','shared','schema','agent-bridge']` (P08-10 `planmo next` compiles its budgeted context bundle via agent-bridge's `compileContextBundle`). Schema addition `ChangePackageSchema` (`packages/schema/src/change-engine.ts`, 5 tests).

| Task | Module | Surface |
|---|---|---|
| P08-01 (critical) | `src/transition.ts` | `transitionEngine` — `advance(state, nextPhase, gates)` requires ALL exit gates passed, refuses double-advance/SKIP, enforces strict continuity (next fully-unblocked phase or current); `freshSession` pins active phase/prompt/status — hard-stop representable, never auto-advances. 6 tests |
| P08-02 | `src/handoff.ts` | `handoffBuilder` — deterministic schema-valid `HandoffDocument` via `HandoffSchema`; `missingForResume` lists exactly what a fresh session lacks. 4 tests |
| P08-03 + P08-10 | `src/next.ts` | `nextComposer` — directive (phase/tasks/steps) + budgeted L0/L1/L2 bundle (structural `ContextBundleView`, agent-neutral) + RED-gate blockers surfaced from a prior phase. 3 tests |
| P08-04 | `src/packets.ts` | `packetCompiler` — `WorkPacketSchema`-valid packets, `WP-<taskId>` deterministic ids, assignee from ownership claim, shared inputs/sorted owned outputs; ownership overlap (exact or glob-prefix) THROWS with offending pairs — never ambiguous. 12 tests (incl. DAG file) |
| P08-05 | `src/gates.ts` | `gateEvaluator` — pure; caller attests artifact presence via `approvals`; blocked verdicts always carry reason + unblock steps; sorted by gate id. 10 tests |
| P08-06 | `src/task-dag.ts` | `createTaskDag` — DFS cycle detection (visited/in-stack), `ready` (deps all DONE, own status allows work, BLOCKED/missing-dep never ready → returns `string[]`), Kahn + min-heap deterministic `ordered`. Cover 30 tests total w/ packets |
| P08-07 | `src/leases.ts` | `leaseManager(now: TimeProvider)` — injected clock, one ACTIVE lease per task, `expired()` pure query, reclaim always caller's decision, sorted copies. 16 tests |
| P08-08 | `src/session-memory.ts` | `sessionMemory` — lifecycle over REQ-MEM-005: `beginSession` = [] (no raw chat, no storage engine in v1), `candidatesFromHandoff` maps only `lifecycle.md` capture sources, `pruneStale` by sourceHash. 12 tests (with consolidate) |
| P08-09 | `src/consolidate.ts` | `memoryConsolidator` — handoff → rows: provenance, source mapping (task-evidence/decision/blocker-resolution), blocked = `internal` sensitivity, dedupe (source, provenance), supersede by later sort position, `capturedAt` stamped |
| P08-11 | `src/change.ts` | `changeEngine` — `newChange` (ChangePackageSchema-valid, ADDED/MODIFIED/REMOVED), `apply` stamps decision + refuses double-apply/invalid decision, `archive` preserves. 4 tests |

Lead-owned: contracts.ts, transition/handoff/next/change, schema ChangePackageSchema, index wiring, E2E, gates, docs. Lead + worker tests: 73 in package.

## Architecture decisions

- **Boundary widening is deliberate and recorded:** `workflow` gained `agent-bridge` (REQ-CTX-001..005 budgeted bundle for `planmo next`); nothing else changed (core/shared/schema still root). ADR-0022 records it; DECISIONS too.
- **Time is ALWAYS injected** (`TimeProvider`), never `Date.now()` — every lease/gate/memory test is fully deterministic.
- **Ownership overlap fails loud:** exact-string or glob-prefix (`packages/a/**` vs `packages/a/b.ts`) overlap THROWS listing the offending owner/path pairs — the compiler never silently splits work. Exit gate "packets have non-overlapping ownership" is enforced in code.
- **Gate evaluator is pure:** artifact presence is attested by the caller through the approvals map (documented in the module docblock) — the engine holds no filesystem.
- **Reclaim is always the caller's decision:** `expired()` returns candidates; the lease manager never auto-claims. Blocks doc: "Expired claims can be reclaimed after explicit checks" — honored.
- **Consolidation supersedes by position:** one row per (source, provenance); identical statements collapse keeping first, changed statements supersede with later sorted position winning. Full task list stays canonical in tasks.csv (ADR-0013 canonical-outranks-memory). Flagged by Worker C; accepted.
- **Session begin is empty:** raw chat/transcripts are NOT durable (REQ-MEM-005); no hosted storage engine in v1 — same no-op-row precedent as Phase 06.
- Worker A overreached scope (claimed writing Worker C's `session-memory.ts`/`consolidate.ts` + the lead's E2E). Verified: disk content is Worker C's (finished later) and the E2E is lead's; A's failed patch to C's test file landed nowhere. No content was lost or mixed — 73/73 package tests confirm.

## Verification

- E2E (`scripts/e2e-phase08.mjs`): 17 checks — red gate blocks transition, green gates advance; handoff resume-sufficient; next directive + budgeted bundle; change new/apply/archive; DAG ready/acyclic/topological; packets non-overlapping + schema-valid; gate auto-pass + human block; lease claim + expiry via injected time; consolidation maps handoff. One E2E bug was MINE (called `.map(n=>n.id)` on `ready()`'s `string[]`) — fixed; no worker defect.
- Gate 544/544 across 38+ test files; boundary-check green with widened `workflow` edge; Prettier clean; secret scan clean.
- Worker discipline: 3/3 delivered (A 30 tests but scope overreach + unreliable self-report verified harmless, B 26, C 12); no collisions on disk.

## For Phase 09 (Trace, validate, doctor & drift)

- `@planmo/workflow` dist is import-ready: `transitionEngine`, `handoffBuilder`, `nextComposer`, `packetCompiler`, `gateEvaluator`, `createTaskDag`, `leaseManager`, `sessionMemory`, `memoryConsolidator`, `changeEngine` all exported from `src/index.ts`.
- Phase 09 owns `@planmo/trace` (boundary `['core','shared']` — widen if it must read schema docs; same pattern as Phase 08). Per CHG-001: `planmo quality` (REQ-QLT-001..004, P09-06/09), architecture fitness (P09-07), standards selection refinement (P09-08 — add `design` class to `STANDARD_CLASSES` + wire `appliesTo` in `designStandardsFor`, flagged in Phase 07 handoff), CLI `planmo doctor`/`drift`.
- CLI commands (`planmo ready/claim/release/change/next`) are NOT yet wired — engines exist; the thin CLI shells land in Phase 09+ (cli boundary `['shared','schema','core']` must widen to include workflow when that happens).
- `ChangePackageSchema` is strict; new fields land via schema extension policy (ADR-0011) + rebuild schema dist before workspace-wide consumption.
- Keep `docs/15-change-governance/*` and `docs/14-context-memory/lifecycle.md` in sync: they are the canonical sources the engines mirror.

## Docs updated

ADR-0022 · `planning/REQUIREMENTS-TRACEABILITY.md` (REQ-WRK/CHG/CTX/MEM rows + ADR-0022) · `planning/DECISIONS.md` · `planning/TRACKER.md` · `planning/tasks.csv` (P08 DONE) · `.planmo/state.yml` · `CHANGELOG.md` · `.changeset/phase-08-workflow-session-engine.md` · MANIFEST regenerated.