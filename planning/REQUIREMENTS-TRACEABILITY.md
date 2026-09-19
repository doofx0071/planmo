# Requirements Traceability

Model:
`Requirement -> Decision/Risk/Threat -> Control -> Task -> Test -> PR -> Release`

Requirement families:
- `REQ-CLI-*`
- `REQ-MODEL-*`
- `REQ-PACK-*`
- `REQ-GEN-*`
- `REQ-AGENT-*`
- `REQ-DESIGN-*`
- `REQ-WORKFLOW-*`
- `REQ-TRACE-*`
- `REQ-ADOPT-*`
- `REQ-SEC-*`
- `REQ-OPS-*`

Example:
`REQ-GEN-004 No silent overwrite -> R-007 -> ownership/dry-run -> P03/P05 -> filesystem/generator tests -> PR -> release`

## Phase 00 trace

| Requirement family | Decision/artifact | Task | Test/evidence |
|---|---|---|---|
| Product positioning / non-goals | README, `docs/01-product/`, `planning/DECISIONS.md` | P00-01 | Consistency review 2026-09-19 |
| Naming / distribution | ADR-0007, `docs/11-research/naming-and-availability.md` | P00-02 | npm registry + GitHub verification 2026-09-19 |
| Support matrix (REQ-AGENT-001/002, REQ-DESIGN-003) | ADR-0008, `docs/11-research/support-matrix.md` | P00-03 | Official-source verification 2026-09-19 |
| Research baseline | `docs/11-research/2026-source-notes.md` | P00-04 | registry/nodejs.org/designtokens.org lookups 2026-09-19 |
| Licensing criteria | `docs/11-research/licensing.md` | P00-05 | Criteria review; final license deferred to Phase 12 |

## Phase 01 trace

| Requirement family | Decision/artifact | Task | Test/evidence |
|---|---|---|---|
| Reproducible install (REQ-OPS-001) | pnpm monorepo, `packageManager` pin, lockfile (ADR-0009) | P01-01 | `pnpm install --frozen-lockfile` + `pnpm check` on Node 24 |
| Quality gates | lint (ESLint), format-check, typecheck (tsc), Vitest tests | P01-02 | `pnpm check` exit 0; 8 unit/negative tests |
| Cross-platform CI | `.github/workflows/ci.yaml` (Linux/macOS/Windows × Node 24) | P01-03 | Workflow added; GitHub Actions BLOCKED by BuildFailed ghost registration (workflow_id 362348206, R-021) — re-run after GitHub-side purge or Settings toggle |
| Release scaffolding | Changesets config + README; private packages | P01-04 | `pnpm changeset status`; no publishing |
| Package boundaries | `docs/10-engineering/package-boundaries.md` + `scripts/check-boundaries.mjs` in CI | P01-05 | `pnpm boundary-check` exit 0; negative cases in script |
| CLI smoke | `@planmo/cli` bin `planmo` (ADR-0010) | P01-01/02 | `node packages/cli/dist/bin.js --version` → `planmo 0.0.0`; CLI unit tests |
