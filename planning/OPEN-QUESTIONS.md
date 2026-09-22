# Open Questions

Deferred to owning phases:
1. ~~public npm package name (`planmo`, scoped package, fallback)~~ — **RESOLVED** in Phase 00: ADR-0007, `docs/11-research/naming-and-availability.md`.
2. final open-source license — criteria locked in Phase 00 (P00-05, `docs/11-research/licensing.md`); **recommendation confirmed at Phase 12 go/no-go: MIT** ( **SELECTED MIT 2026-09-23** by maintainer — LICENSE + SPDX identifiers + CONTRIBUTING trademark note added on `release/v1.0.0-prep`; publish itself still requires npm credentials — `planning/go-no-go-phase12.md`).
3. ~~CLI router choice~~ — **RESOLVED** in Phase 01: ADR-0010 (zero-dependency internal command registry in v1).
4. ~~package build tool~~ — **RESOLVED** in Phase 01: ADR-0010 (plain `tsc` emit; bundler/npm packaging at Phase 11).
5. direct LLM adapters in v1 vs post-v1 (Phase 06).
6. remote pack publishing in v1 vs later (Phase 11).
7. exact GitHub integration depth (Phase 11).
8. hosted public registry timing (Phase 11).
9. telemetry default-off vs none in v1 (Phase 09/12).
10. exact external agent support versions — initial matrix locked in Phase 00 (ADR-0008); exact CLI surfaces/versions pinned in Phase 06.