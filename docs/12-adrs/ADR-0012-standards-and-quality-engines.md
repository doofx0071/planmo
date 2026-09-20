# ADR-0012 — Standards and Quality Engines

**Status:** Accepted (CHG-001; originally proposed as pack ADR-0007, renumbered to avoid collision with existing ADR-0007 naming-and-distribution)

PlanMo will model engineering standards and maintainability checks as first-class concepts.

Standards are selected based on task/stack/domain rather than injecting every rule into every prompt.

Quality findings must be concrete and evidence-backed. Refactoring should be justified by correctness, maintainability, testability, architecture, security, or measurable performance—not stylistic preference alone.

See `docs/13-standards-quality/` (standards-engine.md, quality-engine.md, refactoring-technical-debt.md, architecture-fitness.md).