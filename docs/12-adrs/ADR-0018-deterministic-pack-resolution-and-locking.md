# ADR-0018 — Deterministic Pack Resolution and Locking

**Status:** Accepted (Phase 04, 2026-09-20)

## Context
Phase 04 introduces the declarative pack system. v1 packs are local, trusted
declarative `pack.yml` documents (ADR-0004); remote packs arrive in Phase 11.
The resolver must be deterministic, surface conflicts instead of silently
resolving them, and lock resolved versions/checksums (Phase 04 exit gates).

## Decision
- **Resolution is deterministic.** Given the same catalog and requested refs,
  the resolver produces byte-identical output: highest valid version per ref,
  deterministic traversal of `requires`, and a topological order with
  ref-sorted tie-breaks.
- **Conflicts are surfaced, never silently resolved.** Duplicate rule-id
  definitions at the same standards-precedence tier with differing content,
  capability conflicts (two distinct packs providing the same capability with
  different integrity), dependency cycles, unknown refs, and missing requires
  all produce actionable `ResolutionDiagnostic`s. An LLM never picks a winner
  implicitly.
- **Resolved packs are locked.** `buildLockfile` emits a strict
  `LockfileSchema` document pinning ref, version, source, and sha256 integrity
  of every resolved pack (P04-03).
- **Executable constructs are rejected at load.** Beyond strict schema
  validation, the loader fails closed on any `scripts`/`hooks`/`exec`/`run`/
  `install`/etc. key anywhere in pack content, at any nesting depth (ADR-0004).
- **Policy content is strict and category-discriminated.** Standards, policy,
  and context categories validate against dedicated content schemas
  (`StandardsPackContentSchema`, `EngineeringPolicyContentSchema`,
  `ContextMemoryPolicySchema`); non-policy categories defer content-shape
  validation to their owning phases.
- **Standards selection honors deterministic precedence** (explicit project
  policy > package-local > project > security > stack/framework > language >
  global default). Same-id rules at different tiers shadow deterministically;
  same-id at the same tier with different content is a surfaced conflict.
- **Planning-depth profiles compile predictably.** `compilePlanningProfile`
  maps the four predefined depths to fixed document/gate/phase-mode sets
  (P04-04).

## Consequences
- Downstream phases (generator, workflow engine, memory) consume the
  resolver/lockfile outputs with guaranteed determinism.
- Any future remote-pack support (Phase 11) must preserve these semantics and
  add provenance/integrity/trust metadata (REQ-TRUST-001, ADR-0004).
- Conflict diagnostics are the contract for actionable user-visible errors.