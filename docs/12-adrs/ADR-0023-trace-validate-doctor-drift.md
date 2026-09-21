# ADR-0023: Trace, Validate, Doctor & Drift — Stable Diagnostic Codes

- **Status:** Accepted
- **Date:** 2026-09-21
- **Phase:** 09 (trace/validate/doctor/drift)
- **Extends:** ADR-0012 (quality), ADR-0013/0014 (memory/context)

## Context

Diagnostics must be deterministic and actionable. Requirements need traceability to tasks/tests; validate must check schemas and cross-document invariants; doctor must report environment health without mutating state; orphaned requirements, stale tasks and missing test evidence must be diagnosable — with stable codes suitable for CI.

## Decision

New package **`@planmo/trace`** (boundary: core/shared/schema/workflow) owning all diagnostic engines. Every finding carries a stable code families:

- `TRC-001..004` — trace graph: orphaned requirement, missing test evidence, dangling evidence, missing link target.
- `VLD-001..004` — validate: phase gap, blocked-task mismatch, handoff next-phase drift, schema-parse failure of canonical docs.
- `DOC-001..006` — doctor: node < 24 (error), node ≥ 25 ahead-of-LTS (warning), non-pnpm (error), dirty worktree (warning), fresh gate check (info), missing prompts (error). Doctor NEVER mutates state.
- `QLT-001..006` — quality: oversized file (info), deep nesting (warning), duplication (warning), missing test coverage (error), low API doc coverage (info), side effects (warning). **No aggregate score** (quality-engine.md).
- `DEBT-001..004` — debt: overdue past target phase (warning), scheduled (info), missing affected-paths (warning), unknown status (error).
- `MEM-001..005` — memory health: stale source hash (warning), dangling provenance (warning), empty set (info), duplicate (source, provenance) pairs (error), rebuild-eligible info + `rebuildRecommended`.
- `DRF-001..003` — standards drift: declared-missing, selected-undeclared, unknown class.
- `FIT-001..003` — architecture fitness: undeclared dependency edge, dependency cycle, dist-import instead of source.

Codified rules:
- Diagnostics are sorted (severity rank error > warning > info, then code, then target) and byte-deterministic.
- `design` was added to `STANDARD_CLASSES` (schema, additive per ADR-0011) and `designStandardsFor` now drops web-domain rules for `backendOnly` and the touch-target floor for `spacious` density (wiring flagged by Phase 07 handoff).
- Engines stay PURE: no filesystem, no clock, no randomness; callers (future CLI shells) resolve environment facts and pass them in.
- Builder `createTraceGraphEngine().build` returns a `TraceGraphReport` (nodes/edges + per-kind counts).

## Consequences

- CI can match `[VLD-001]` etc. to gate phases; `planmo validate/doctor/trace/quality` CLI shells wire these engines in a later phase (thin adapters, no logic).
- `@planmo/trace` is the natural home for `planmo validate` output; renderer is byte-stable plain text.
- A latent Phase 08 packaging defect was fixed here: `@planmo/workflow` lacked `main`/`types`/`exports` in package.json — nothing imported it before, so it never surfaced; now resolvable (recorded in DECISIONS).
- Trace graph emphasises evidence: a task is "tested" only with passing test rows (drift-gate semantics); canonical lists remain authoritative (ADR-0013).