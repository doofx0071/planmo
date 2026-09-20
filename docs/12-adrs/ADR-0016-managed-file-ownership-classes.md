# ADR-0016 — Managed File Ownership Classes

**Status:** Accepted (CHG-001; originally proposed as pack ADR-0011, renumbered to avoid collision with existing ADR-0011 strict-versioned-schemas)

PlanMo-generated files use explicit ownership classes:
- generated
- merged
- seeded
- user

Generation/update behavior must respect ownership and expose diffs before destructive changes.

See `docs/15-change-governance/managed-file-ownership.md` (lineage + `planmo update --preview`).