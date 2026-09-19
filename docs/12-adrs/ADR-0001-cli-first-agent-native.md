# ADR-0001 — CLI-first, agent-native architecture

**Status:** Accepted

PlanMo uses a deterministic CLI/core as the control plane and agent-specific commands/skills as reasoning interfaces.

The CLI owns schemas, state, filesystem writes, validation, packs, manifests and deterministic generation. AI agents propose structured changes and perform reasoning-heavy discovery/planning.

This avoids tying PlanMo to one model/provider while preserving agent-native UX.
