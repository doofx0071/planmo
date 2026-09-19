# ADR-0007 — Naming and Distribution Targets

**Status:** Accepted (2026-09-19)

## Context

Before implementation can depend on any public name, the product name, source repository, and npm package targets must be verified available and recorded.

## Decision

- Product name: **PlanMo** (unchanged).
- Source repository: **https://github.com/doofx0071/planmo** — PRIVATE, default branch `main` (created 2026-09-19).
- npm primary distribution name: **`planmo`**.
- Internal monorepo packages: scoped under **`@planmo/*`**.
- Fallback (only if `planmo` is lost before first publish): **`planmo-cli`**.

## Evidence (all 2026-09-19)

- `planmo`, `planmo-cli`: no published versions, 0 maintainers (npm registry).
- `@planmo` scope: never published to (`@planmo/core` absent).
- Public GitHub `planmo` search: only unrelated small projects; no competing product found.

## Consequences

- Name/package availability risk largely retired; residual risk tracked as R-018.
- Phase 01+ must not hardcode reliance on unowned names; names are claimed explicitly at first publish (release scaffolding, Phase 11).
- See `docs/11-research/naming-and-availability.md`.