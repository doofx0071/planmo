# ADR-0008 — Initial Supported Agents, Platforms, Styles

**Status:** Accepted (2026-09-19)

## Context

The initial support matrix bounds Phase 01 CI, Phase 06 adapter scope, and Phase 07 style scope. It must be locked before those phases can plan concretely.

## Decision

- **Agents** (agent bridge, Phase 06): generic agent-neutral adapter (always), OpenCode CLI, Claude Code. Codex CLI is explicitly **not** targeted in v1 (maintainer decision); the generic contract allows adding it later without architecture change.
- **Platforms**: Windows 10/11, macOS (Intel + Apple Silicon), Linux (x86_64 + arm64), on Node.js 24 LTS.
- **Design styles** (Phase 07): minimal, editorial, neobrutalism, soft-product, dense-dashboard, developer-tool, luxury, playful.
- **Distribution**: npm only (`planmo` + `@planmo/*`, see ADR-0007); no native binaries in v1.

## Consequences

- Phase 01 P01-03 CI matrix covers Windows/macOS/Linux on Node 24 LTS.
- Phase 06 adapter work is limited to generic + OpenCode + Claude Code with exact CLI surfaces verified then.
- Phase 07 style catalog is bounded to the 8 styles; new styles are extensions, not v1 scope.
- See `docs/11-research/support-matrix.md`.