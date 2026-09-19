# Risk Register

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| R-001 | Becomes a Spec Kit clone | High | Differentiate via whole-project governance, design engine, risk-adaptive planning, handoffs, traceability |
| R-002 | CLI and agent commands diverge | High | Canonical model + adapter contract |
| R-003 | AI emits unsafe/unstructured artifacts | Critical | Schema-validated proposal + deterministic generator |
| R-004 | Existing-repo prompt injection | Critical | Treat repo prose as data; never implicit authority |
| R-005 | Path traversal/symlink overwrite | Critical | Canonical path validation + negative tests |
| R-006 | Third-party pack code execution | Critical | Declarative-only v1 packs |
| R-007 | Generated file destroys user content | Critical | Manifest ownership, diff/dry-run, conflict policy |
| R-008 | Pack conflicts | High | SemVer compatibility, resolver, lockfile |
| R-009 | Too many generated docs | High | Risk-adaptive profiles/artifact budgets |
| R-010 | Style harms accessibility | High | WCAG constraints override design |
| R-011 | Cross-platform drift | High | Windows/macOS/Linux E2E |
| R-012 | Brittle snapshots | Medium | Semantic normalization + targeted snapshots |
| R-013 | Remote supply-chain attack | Critical | Trust metadata, checksums, pinning |
| R-014 | Schema evolution breaks projects | High | schemaVersion + migrations + fixtures |
| R-015 | Agent upstream changes | High | Capability adapters + contract fixtures |
| R-016 | Requires AI API costs | Medium | AI optional; agent-native default |
| R-017 | CLI overwhelms beginners | Medium | Progressive disclosure/recommended defaults |
| R-018 | Name/package conflict | Medium | Availability verified 2026-09-19 (`planmo`, `planmo-cli`, `@planmo/*` free on npm); private repo `doofx0071/planmo` secured; fallback `planmo-cli` + scoped `@planmo/*` defined (ADR-0007) |
| R-019 | Toolchain churn in the TS 7 native-compiler era | Medium | TypeScript 7.0.2 has no JS parsing API; @typescript-eslint cannot run against it (peer cap `<6.1.0`); TS gate = strict `tsc` typecheck. Mitigation: pinned versions + lockfile, cross-OS CI matrix, ADR-0009 records the decision. Unblock: enable typescript-eslint when a TS7-capable release lands; re-add to stack then |
| R-020 | Version-manager/corepack availability on dev boxes | Low | corepack is broken on the dev machine; pnpm pinned via `packageManager` + GitHub Actions setup; upgrade path to pnpm 12 recorded in ADR-0009 |
