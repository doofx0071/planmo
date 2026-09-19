# Naming & Package Availability

Task: P00-02. Verified: **2026-09-19** (all lookups this date).

## npm registry (`registry.npmjs.org`)

| Name | Status | Evidence |
|---|---|---|
| `planmo` | FREE (no published versions, 0 maintainers) | registry metadata query 2026-09-19 |
| `planmo-cli` | FREE (no published versions, 0 maintainers) | registry metadata query 2026-09-19 |
| `@planmo` scope | FREE (no scoped package ever published; spot-checked `@planmo/core`) | registry metadata query 2026-09-19 |

## GitHub

- Product repository secured: **https://github.com/doofx0071/planmo** — PRIVATE, default branch `main`, created 2026-09-19.
- Public GitHub search for `planmo` returned only unrelated, low-significance projects (a Terraform plan-modifiers plugin, school/university projects, small personal apps). No active competing product under this exact name was found.

## Decision

1. Product name stays **PlanMo**.
2. Primary npm distribution name: **`planmo`** (verified free; claim at first publish).
3. Internal/monorepo packages: **`@planmo/*`** scope (verified free).
4. Fallback if `planmo` is lost before first publish: **`planmo-cli`**.
5. Implementation must not depend on unverified public names: no Phase 01+ code may hardcode assumptions about packages we do not own; the name must be reclaimed/claimed explicitly at first publish (Phase 11 release scaffolding).

## Residual risk

- The repo and npm name are not "registered trademarks"; while this repository stays private, a third party could create a public `planmo` repo/package. Mitigated by: private repo already secured, npm name checked free, fallback defined. Tracked as R-018.
- `planmo` is a natural-language word (Portuguese/Italian for "plan"); expect unrelated usage. Only exact-name conflicts in the same tooling niche matter for v1.

See ADR-0007.