# Changelog

PlanMo uses SemVer.

## Unreleased
- Defined CLI-first + agent-native architecture.
- Defined canonical model, pack system, design engine, workflow engine, traceability, testing, and security plans.
- Phase 00 complete: product thesis + non-goals locked; npm naming verified (`planmo`, `@planmo/*`, fallback `planmo-cli`); private repo `doofx0071/planmo` created; support matrix locked (generic + OpenCode + Claude Code agents, Windows/macOS/Linux on Node 24 LTS, 8 design styles, npm-only distribution); research baseline refreshed 2026-09-19; licensing criteria recorded (final license deferred to Phase 12).
- Phase 01 complete: pnpm TypeScript monorepo (`@planmo/shared/schema/core/cli`), strict TS 7.0.2 + NodeNext ESM, Vitest 5 (8 tests), ESLint 10 + Prettier 3, Changesets 3 foundation, package boundary enforcement (`pnpm boundary-check`), GitHub Actions CI (Linux/macOS/Windows × Node 24), CLI smoke (`planmo --version` → 0.0.0), ADR-0009/0010. Note: Node 24.11.0 LTS added on the dev box; @typescript-eslint deferred until TS7 support (risk R-019).
