# Phase 02 Handoff

## Status
COMPLETE

## Completed tasks
- P02-01 Implement project config schema — DONE
- P02-02 Implement state lock manifest schemas — DONE
- P02-03 Implement pack and design schemas — DONE
- P02-04 Implement trace handoff work-packet schemas — DONE
- P02-05 Create schema versioning/migration tests — DONE

## Remaining / blocked
- None. No tasks blocked; no fabricated evidence. (GitHub Actions remains blocked from Phase 01 — see R-021 and phase-01 handoff; identical external cause.)

## Material changes
- `packages/schema` (implemented — was a placeholder):
  - `src/common.ts` — shared primitives: `SCHEMA_VERSION`, `NonEmptyString`, `SemVerString`, `PackRef`, `Checksum`, `Extensions`, `versionedObject()` (strict + versioned + extendable document factory).
  - `src/schema-versioning.ts` — `SchemaMigrations` framework, `readSchemaVersion`, `assertSupportedVersion`, `UnsupportedSchemaVersionError`/`MissingSchemaVersionError`; chained deterministic migrations, idempotent re-migrate, future-major rejection.
  - `src/migrations.ts` — v0->v1 registries for project/state/handoff (legacy documents get stamped).
  - `src/project.ts` — `ProjectConfigSchema`: project info + stack/design/planning/agents blocks + packs; axis enums (types, lifecycles, risks, 8 styles, densities, WCAG-2.2, depths, phase modes, agent ids).
  - `src/state-lock-manifest.ts` — `StateSchema` (state.yml), `LockfileSchema` (lock.yml, pack/adapter integrity), `ManifestSchema` (manifest.json, artifact kinds, ownership modes).
  - `src/pack-design.ts` — `PackSchema` (declarative packs), `DesignProfileSchema`, `DesignTokensSchema` (DTCG `$schema`).
  - `src/trace-handoff-workpacket.ts` — `TraceGraphSchema`, `HandoffSchema` (mirrors `planning/handoffs/TEMPLATE.md`), `WorkPacketSchema`.
  - `src/index.ts` — public re-exports.
  - `src/fixtures/` — golden v1 + legacy v0 fixtures with README.
  - Tests: `project.test.ts`, `state-lock-manifest.test.ts`, `pack-design.test.ts`, `trace-handoff-workpacket.test.ts`, `migrations.test.ts`, `golden.test.ts`, `test-utils.ts` (round-trip helpers).
- `packages/schema/package.json` — `zod@4.6.5` (runtime), `yaml@2.9.1` (dev, tests only).
- `packages/schema/tsconfig.build.json` — exclude `test-utils.ts` from emit.
- `.gitattributes` (new) — `* text=auto eol=lf` normalizes line endings: fixes Prettier CRLF churn on Windows dev boxes (autocrlf=true was re-materializing tracked files as CRLF and breaking `format:check`).
- docs: `docs/12-adrs/ADR-0011-strict-versioned-schemas.md` (new), `docs/11-research/2026-source-notes.md` (Zod/yaml pins 2026-09-20).
- planning: DECISIONS (Phase 02 confirmations), REQUIREMENTS-TRACEABILITY (Phase 02 rows), RISKS (R-014 mitigation updated), TRACKER, tasks.csv (P02 DONE), CHANGELOG (Phase 02 bullet), `.planmo/state.yml` (→ Phase 03).

## Tests & evidence
| Command/Test | Result | Notes |
|---|---|---|
| `pnpm --filter @planmo/schema typecheck` | PASS | TS 7.0.2 strict, NodeNext, zero errors |
| `vitest run` (@planmo/schema) | PASS | 6 files, 65 tests (incl. negative, round-trip JSON+YAML, golden/legacy fixtures, migrations) |
| `pnpm build` | PASS | tsc emit per package (tests + test-utils excluded) |
| `pnpm check` (full gate) | PASS | exit 0: build → typecheck → test (73 total workspace) → lint → format:check → boundary-check → smoke (`planmo 0.0.0`) |
| `pnpm boundary-check` | PASS | `package boundaries: OK` (schema→shared+zod only) |
| `npm view zod/yaml dist-tags.latest` | PASS | zod 4.6.5, yaml 2.9.1 (2026-09-20, registry) |
| GitHub Actions CI | BLOCKED | Same R-021 ghost registration as Phase 01 (workflow_id 362348206); not repo-side fixable — unblocked via GitHub Support purge or Settings → Actions → General toggle |
| `pnpm changeset status` | PASS | no publishable changes (private packages) |

## Security / reliability findings
- Strict schemas fail closed on unknown fields (`z.strictObject`); the only free-form field is the optional `extensions` map, preserved verbatim through migrations (ADR-0011). This is the "deliberate policy" the phase exit gate required.
- Future schemaVersion majors are rejected at parse time (`UnsupportedSchemaVersionError`) — no silent partial reads; `planmo doctor` mixed-state diagnostics are Phase 09 but the rejection primitive exists now.
- Migration chain is deterministic and fixture-covered; re-migrating an already-current document is idempotent; a gap in the chain throws instead of guessing.
- No secrets introduced; fixtures are synthetic (fake checksum hex, no user data).
- `.gitattributes` fixes a cross-platform determinism bug (Prettier gate was failing on Windows due to CRLF re-materialization).

## Decisions / ADRs
- ADR-0011 — Strict versioned schemas + user-extension policy: every persisted PlanMo doc carries `schemaVersion`, strict objects reject unknown keys, `extensions` is the only free-form field and migrations preserve it, migrations are deterministic chains covered by fixtures.
- DECISIONS.md Phase 02 confirmations (2026-09-20) — Zod 4.6.5 runtime, yaml 2.9.1 test-only, axis sets locked, DTCG tokens versioned by `$schema`.

## Git
- Branch: `feat/phase-02-canonical-project-model` (GitHub Flow; PR to `main`).
- Commits: focused Conventional Commits (schema implementation, tests, ADR, planning/state) — see `git log`.
- PR: created after this handoff; CI will still hit the Phase-01 R-021 ghost until GitHub clears it.

## Known debt
- GitHub Actions CI blocked by external BuildFailed ghost (R-021) — same as Phase 01; local `pnpm check` (exit 0) is the authoritative gate meanwhile.
- `Content` of packs is `Record<string, unknown>` today; per-category deep pack-content validation belongs to Phase 04 (pack loader).
- Work-packet/parallel semantics (Phase 08) may extend `WorkPacketSchema`; strict schema means that is an additive v1 key or a v2 migration.
- `requirements` normalized subdocument (canonical-project-model.md "requirements, decisions, risks, workflows") is represented by `TraceGraphSchema` links now; a standalone requirements doc schema can be added in Phase 09 trace work if needed.
- DesignProfile `tokens` field is a pass-through record; full DTCG token schema validation lands in Phase 07 design engine.

## Next phase
- Phase: **03 — CLI foundation** (prompts/04-phase-03-cli-foundation.md, planning/phases/phase-03.md)
- Read first: the phase prompt/phase file, docs/08-security/secure-filesystem.md, docs/02-architecture/state-and-manifest.md, ADR-0009/0010.
- Preconditions: monorepo gates green (verified); `@planmo/schema` exposes the strict document schemas for `init`/`status` to validate against; `@planmo/core` is an empty scaffold ready to host core utilities; Node 24 on PATH for repo commands.
- Instructions: run repo commands with Node 24 on PATH; keep `.gitattributes` as-is (LF everywhere, do not remove); do not re-add `@typescript-eslint`; when a doc needs new fields, additive v1 keys are fine, else write a v2 migration in `schema-versioning.ts` with fixtures per `packages/schema/src/fixtures/README.md`.