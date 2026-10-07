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
- `.github/workflows/release.yml` runs on `main` with `changesets/action@v2`
  (Changesets v3). With pending changesets it opens/updates a "Version Packages"
  PR; with none it publishes immediately.
- credentials: `NPM_TOKEN` repository secret (npm Granular Access Token with
  read+write). Set it before merging a publishable change — otherwise the release
  job runs `changeset publish` with no auth and fails.
- **Preferred: npm Trusted Publishing (OIDC).** Granular tokens expire (max 90
  days) and 2FA-bypass tokens will no longer publish directly after Jan 2027.
  Trusted Publishing needs no secret. It can only be configured on a package that
  already exists, so bootstrap the first publish with the token, then per package
  on npmjs.com → Package → Settings → Trusted Publisher → GitHub Actions
  (repo `doofx0071/planmo`, workflow `release.yml`), and remove `registry-url`
  plus the `NODE_AUTH_TOKEN` env from the workflow (`id-token: write` stays).
- the release job runs the full `pnpm check` gate before publishing.
- the `planmo` name and `@planmo` scope must be claimed on npm before the first
  publish (naming-and-availability.md, R-018).
