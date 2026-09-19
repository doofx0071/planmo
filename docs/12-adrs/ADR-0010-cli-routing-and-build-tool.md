# ADR-0010 — CLI Routing and Build Tool

**Status:** Accepted (2026-09-19)

## Context

OpenQuestion #3 (CLI router choice, Phase 01) and #4 (package build tool, Phase 01) require resolution before Phase 03 can build the real command surface.

## Decision

- **CLI routing**: no third-party command-router dependency in the v1 deterministic core. The CLI uses a tiny internal, zero-dependency command registry (`run(argv, io)` in `@planmo/cli`, see packages/cli smoke implementation). Rationale: the deterministic core must work without network/registry and stay auditable; the command surface is small (see `docs/03-cli/command-surface.md`). Revisit `yargs`/`commander`/`@clack` bundles only if the surface outgrows this (a future ADR would supersede this one).
- **Build tool**: plain `tsc` emit (ESM, declaration maps) per package for the 0.x foundation. No bundler, no code-splitting, no minification yet. Distribution concerns (single-binary/tarball, npm package contents, provenance) are Phase 11 scope. `@clack/prompts` is a runtime dependency candidate for the Phase 03 wizard, not a build-system choice.

## Consequences

- Zero-dependency CLI keeps install surface minimal and deterministic.
- Replacing build tooling later (if needed) is contained to package scripts and CI, not to product schemas.