# ADR-0009 — Monorepo and Engineering Toolchain

**Status:** Accepted (2026-09-19)

## Context

Phase 01 must establish a reproducible monorepo and toolchain before feature work. Decisions below were verified against official sources on 2026-09-19 (see `docs/11-research/2026-source-notes.md`).

## Decision

- **Package manager**: pnpm, pinned via `packageManager: pnpm@10.33.0` + lockfile. pnpm 12.4.2 is latest on the registry; 10.33.0 is the verified-working install on the development machine (corepack is broken there) and satisfies all needs. Upgrading is a one-line change (documented debt).
- **Workspace**: pnpm workspace, `packages/*`. Scaffolded now: `shared`, `schema`, `core`, `cli` (the dependency spine). Remaining packages are created in their owning phases per `docs/02-architecture/repository-structure.md`.
- **Language**: TypeScript `7.0.2` (current stable — the native compiler line) with strict settings (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, NodeNext ESM). **`baseUrl` is removed in TS 7 and must not be used.**
- **Node baseline**: `engines: >=24.0.0` (Node 24 LTS verified current, v24.11.0). `@types/node@24`.
- **Tests**: Vitest `5.0.1`, Node-only environment, tests colocated in `src/**/*.test.ts`.
- **Lint**: ESLint `10.11.0` flat config with `@eslint/js` + `globals` (Node). **@typescript-eslint is NOT used yet**: TS 7.0.2 exposes no JS parsing API, so the parser cannot run against it (peer range caps at `<6.1.0`). TS quality is gated by strict `tsc` typecheck; TS-file linting returns with a TS7-capable typescript-eslint (risk R-019).
- **Format**: Prettier `3.9.8`; scope limited to code/config (product and planning docs excluded via `.prettierignore`).
- **Build**: plain `tsc` emit per package (`tsconfig.build.json`, tests excluded) — no bundler yet (see ADR-0010).
- **Releases**: Changesets `3.0.3` foundation; all packages private in 0.x, no publishing (ADR-0006).

## Consequences

- Fresh clone installs with `pnpm install --frozen-lockfile` (lockfile committed).
- Supported Node majors: 24 LTS (CI) and compatible newer lines per engines.
- Known deviations from the research baseline (pnpm 12) and from full TS linting (typescript-eslint) are recorded as debt/risk, not silent.