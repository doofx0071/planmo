# Decision Log

Confirmed:
- Product name: **PlanMo**.
- Product: project planning/execution workspace generator.
- Architecture: CLI-first + agent-native.
- AI: optional and outside deterministic core.
- Repository is durable source of truth.
- Fresh AI session per phase.
- Max recommended parallel workers: 3 + coordinator.
- Canonical frontend tokens: DTCG-compatible.
- Initial styles: Minimal, Editorial, Neobrutalism, Soft Product, Dense Dashboard, Developer Tool, Luxury, Playful.
- UI/component registries are sources, not styles.
- Packs are declarative in v1.
- Existing repo scanning is passive/static by default.
- SemVer + Conventional Commits + GitHub Flow.

Phase 00 confirmations (2026-09-19):
- Product thesis and v1 non-goals locked; internally consistent across README, MASTER-PLAN, and `docs/01-product/` (P00-01).
- Source repository: **https://github.com/doofx0071/planmo** — PRIVATE, `main` created 2026-09-19 (P00-02, ADR-0007).
- npm targets: primary **`planmo`**, internals **`@planmo/*`**, fallback **`planmo-cli`**; all verified free 2026-09-19 (P00-02, ADR-0007).
- Support matrix locked: agents = generic + OpenCode CLI + Claude Code (Codex CLI not targeted in v1); platforms = Windows 10/11, macOS, Linux on Node.js 24 LTS; styles = the 8 listed; distribution = npm only (P00-03, ADR-0008).
- Research baseline finalized against official sources, retrieved 2026-09-19; Node 24 LTS baseline confirmed (P00-04).
- Licensing criteria recorded (permissive, dependency-compatible, clear patent terms, low overhead, ecosystem norm, trademark separation); final license deferred to Phase 12, default recommendation MIT (P00-05).

Phase 01 confirmations (2026-09-19):
- pnpm monorepo with pinned `packageManager: pnpm@10.33.0` + committed lockfile; packages `@planmo/shared`, `@planmo/schema`, `@planmo/core`, `@planmo/cli` scaffolded (ADR-0009).
- Toolchain: TypeScript 7.0.2 (strict, NodeNext ESM; `baseUrl` removed in TS7), Vitest 5.0.1, ESLint 10.11.0 flat (@eslint/js + globals; ts lint deferred — R-019), Prettier 3.9.8, Changesets 3.0.3, Node >=24 engines (ADR-0009).
- CLI routing: zero-dependency internal command registry in v1 core; build tool: plain `tsc` emit, no bundler yet (ADR-0010 — resolves OPEN-QUESTIONS #3 and #4).
- Package boundary rules documented in `docs/10-engineering/package-boundaries.md` and enforced by `scripts/check-boundaries.mjs` in CI (P01-05).
- GitHub Actions CI: Linux/macOS/Windows × Node 24.x with frozen install, lint, format-check, typecheck, build, tests, boundaries, CLI smoke (P01-03).