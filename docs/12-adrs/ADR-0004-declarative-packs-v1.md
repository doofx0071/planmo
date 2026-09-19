# ADR-0004 — Declarative packs only in v1

**Status:** Accepted

PlanMo v1 packs may contribute structured metadata/templates/rules but may not execute arbitrary installation-time code.

Remote packs are untrusted input and require provenance, integrity and compatibility checks.
