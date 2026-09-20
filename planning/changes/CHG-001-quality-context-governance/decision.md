# CHG-001 Decision

## Recommended decision
ACCEPT, with staged implementation.

## Rebaseline decision (2026-09-20)
**Verdict: ACCEPTED.** All ten upgrade themes are accepted and mapped into
Phase 04–12 as staged tasks; no completed Phase 00–03 task ID was changed.

**ADR dispositions (each pack-proposed ADR explicitly accepted/rejected):**
- Pack ADR-0007 standards-and-quality-engines → **ACCEPTED** as **ADR-0012** (renumbered: existing ADR-0007 covers naming/distribution)
- Pack ADR-0008 context-memory-authority-model → **ACCEPTED** as **ADR-0013** (renumbered: existing ADR-0008 covers supported agents/platforms/styles)
- Pack ADR-0009 local-first-rebuildable-memory-index → **ACCEPTED** as **ADR-0014** (renumbered: existing ADR-0009 covers monorepo toolchain)
- Pack ADR-0010 change-engine-delta-model → **ACCEPTED** as **ADR-0015** (renumbered: existing ADR-0010 covers CLI routing)
- Pack ADR-0011 managed-file-ownership → **ACCEPTED** as **ADR-0016** (renumbered: existing ADR-0011 covers strict versioned schemas)
- Pack ADR-0012 task-graph-and-execution-packets → **ACCEPTED** as **ADR-0017** (number free; adopted unchanged topic/filename)

No pack-proposed ADR was rejected. The renumbering is required because the
pack was authored against a hypothetical earlier ADR numbering; the live
repository has distinct ADR-0007..0011. Filenames below the pack manifest
were adapted accordingly.

## Architectural decisions

1. Canonical repository state is authoritative; memory is not.
2. PlanMo memory is project-centric and local-first.
3. v1 uses deterministic/rebuildable retrieval as the baseline.
4. Embeddings are optional adapters.
5. Temporal graph memory is a future adapter, not a core dependency.
6. Session handoffs remain Git-tracked durable evidence.
7. Memory stores distilled facts/events/procedures, not raw chat by default.
8. Context compilation uses explicit token/size budgets and progressive disclosure.
9. Every durable memory has provenance and temporal validity.
10. Quality/standards are structured PlanMo concepts, not only prose in AGENTS.md.
