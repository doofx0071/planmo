# ADR-0014 — Local-first, Rebuildable Memory/Context Index

**Status:** Accepted (CHG-001; originally proposed as pack ADR-0009, renumbered to avoid collision with existing ADR-0009 monorepo-toolchain)

PlanMo's core context/memory capability must work locally without a hosted service.

Derived indexes must be disposable/rebuildable. Semantic embeddings and temporal graph services are optional adapters.

The concrete local storage/search driver will be chosen after cross-platform benchmarking; the architectural contract must not depend on one vendor.

See `docs/14-context-memory/storage-portability.md` and `retrieval-token-budget.md`.