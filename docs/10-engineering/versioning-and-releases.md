# Versioning and Releases

Use SemVer.

Initial recommendation:
- unified PlanMo CLI/core release during 0.x;
- internal packages can remain private;
- public package split only when useful.

Pre-1.0 breaking changes still require changelog and migration notes for persistent `.planmo` schemas.

`1.0.0` requires stable migration/compatibility policy.

## v1.0.0 npm distribution

One published CLI package plus its runtime closure; the remaining engines stay
private. ADR-0009/0010 keep plain `tsc` emit (no bundler), so the CLI's
`workspace:*` dependencies must be published for `npm i planmo` to resolve.

Published (public):
- `planmo` — the CLI (`packages/planmo`), provides the `planmo` bin (ADR-0007)
- `@planmo/shared`, `@planmo/schema`, `@planmo/core`, `@planmo/scanner` — the
  CLI's runtime dependency closure

Private (never published): `adapters`, `agent-bridge`, `design-engine`,
`generator`, `packs`, `trace`, `workflow` (plus the `planmo-monorepo` root).

Access: scoped packages carry `publishConfig.access: public`; `.changeset/config.json`
sets `access: public`. The boundary checker allows the single unscoped CLI name
(`packages/planmo` → `planmo`) and enforces `@planmo/<dirname>` for the rest.

Release mechanics:
- feature PRs add a Changeset (`pnpm changeset`).
- `.github/workflows/release.yml` runs on `main`: it opens/updates a
  "Version Packages" PR; merging that PR runs `pnpm changeset publish`.
- required repository secret: `NPM_TOKEN` — an npm automation token with publish
  rights for the `planmo` name and the `@planmo` scope (claim both at first publish).
- the release job runs the full `pnpm check` gate before publishing.
- the `planmo` name and `@planmo` scope must be claimed on npm before the first
  publish (naming-and-availability.md, R-018).
