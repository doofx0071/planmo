# Risk Register

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| R-001 | Becomes a Spec Kit clone | High | Differentiate via whole-project governance, design engine, risk-adaptive planning, handoffs, traceability |
| R-002 | CLI and agent commands diverge | High | Canonical model + adapter contract |
| R-003 | AI emits unsafe/unstructured artifacts | Critical | Schema-validated proposal + deterministic generator |
| R-004 | Existing-repo prompt injection | Critical | Treat repo prose as data; never implicit authority |
| R-005 | Path traversal/symlink overwrite | Critical | Canonical path validation + negative tests — Phase 03: `resolveInsideRoot`/`ensureNoSymlinkEscape`/`realpathWithinRoot` containment + symlink-escape guards, 20 negative tests (`packages/core/src/paths.test.ts`, `writer.test.ts`) |
| R-006 | Third-party pack code execution | Critical | Declarative-only v1 packs |
| R-007 | Generated file destroys user content | Critical | Manifest ownership, diff/dry-run, conflict policy — Phase 03: `ManagedWriter` refuses unmanaged overwrites, atomic temp+rename, sha256 checksums, unified diff preview, TOCTOU re-check (`packages/core/src/writer.ts`) |
| R-008 | Pack conflicts | High | SemVer compatibility, resolver, lockfile |
| R-009 | Too many generated docs | High | Risk-adaptive profiles/artifact budgets |
| R-010 | Style harms accessibility | High | WCAG constraints override design |
| R-011 | Cross-platform drift | High | Windows/macOS/Linux E2E |
| R-012 | Brittle snapshots | Medium | Semantic normalization + targeted snapshots |
| R-013 | Remote supply-chain attack | Critical | Trust metadata, checksums, pinning |
| R-014 | Schema evolution breaks projects | High | schemaVersion + migrations + fixtures — framework implemented in Phase 02: strict versioned Zod schemas, per-document-kind migration chains (v0->v1), fixture coverage, future-major rejection, extension preservation (ADR-0011, `packages/schema/src/schema-versioning.ts`) |
| R-015 | Agent upstream changes | High | Capability adapters + contract fixtures |
| R-016 | Requires AI API costs | Medium | AI optional; agent-native default |
| R-017 | CLI overwhelms beginners | Medium | Progressive disclosure/recommended defaults |
| R-018 | Name/package conflict | Medium | Availability verified 2026-09-19 (`planmo`, `planmo-cli`, `@planmo/*` free on npm); private repo `doofx0071/planmo` secured; fallback `planmo-cli` + scoped `@planmo/*` defined (ADR-0007) |
| R-019 | Toolchain churn in the TS 7 native-compiler era | Medium | TypeScript 7.0.2 has no JS parsing API; @typescript-eslint cannot run against it (peer cap `<6.1.0`); TS gate = strict `tsc` typecheck. Mitigation: pinned versions + lockfile, cross-OS CI matrix, ADR-0009 records the decision. Unblock: enable typescript-eslint when a TS7-capable release lands; re-add to stack then |
| R-020 | Version-manager/corepack availability on dev boxes | Low | corepack is broken on the dev machine; pnpm pinned via `packageManager` + GitHub Actions setup; upgrade path to pnpm 12 recorded in ADR-0009 |
| R-021 | GitHub Actions ghost `BuildFailed` registration blocks all CI | High | Orphaned workflow record (workflow_id 362348206, `state=deleted`, `name=""`) intercepts every push/PR/dispatch event as `startup_failure` with zero jobs, before any YAML parse; proven with minimal probe workflows; all repo-side remedies (rename, re-add, close/reopen, workflow toggle, registry re-index commits) exhausted. Mitigation: valid workflow kept on `main` at `.github/workflows/ci.yaml` with `workflow_dispatch`; local gate `pnpm check` exit 0 remains the authoritative signal. Unblock: GitHub Support purge of workflow_id 362348206, or manual Settings → Actions → General disable/enable toggle, then re-run CI |
