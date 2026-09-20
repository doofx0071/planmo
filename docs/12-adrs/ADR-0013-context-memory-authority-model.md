# ADR-0013 — Context/Memory Authority Model

**Status:** Accepted (CHG-001; originally proposed as pack ADR-0008, renumbered to avoid collision with existing ADR-0008 initial-supported-agents)

Canonical repository/project artifacts outrank memory.

Memory is derived context with provenance and temporal validity. If memory conflicts with current source, schemas, accepted ADRs, requirements, tracker, state, or handoff, the canonical artifact wins.

This prevents persistent memory from becoming an invisible second database of truth.

See `docs/14-context-memory/architecture.md` (Layer A canonical authority vs Layer B durable memory).