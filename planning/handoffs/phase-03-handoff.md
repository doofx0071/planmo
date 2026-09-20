# Phase 03 Handoff

## Status
COMPLETE

## Completed tasks
- P03-01 Safe project-root and path utilities — DONE
- P03-02 Managed file writer with dry-run and diff — DONE
- P03-03 planmo init wizard — DONE
- P03-04 planmo status — DONE
- P03-05 Collision/symlink/path traversal tests — DONE

## Remaining / blocked
- None. No tasks blocked; no fabricated evidence. (GitHub Actions remains blocked from Phase 01 — R-021, identical external cause: GitHub-side orphaned `BuildFailed` registration workflow_id 362348206 intercepts every event as `startup_failure`. Local `pnpm check` exit 0 is the authoritative gate meanwhile; workflow file on `main` is valid.)

## Material changes
- `packages/core` (implemented — was an empty scaffold):
  - `src/errors.ts` — typed error taxonomy: `PlanMoError` base + `PathTraversalError`, `UnsafeSymlinkError`, `FileCollisionError`, `BrokenSymlinkError`, `ProjectNotFoundError`, `MissingDocumentError`, `InvalidDocumentError`, `NoPlanError` (each with a distinct exit code).
  - `src/paths.ts` — `findProjectRoot` (walks up for `.planmo/`, realpath-resolved), `resolveInsideRoot` (path.relative containment — immune to prefix attacks like `/proj-other`), `isInsideRoot`, `realpathWithinRoot`, `ensureNoSymlinkEscape` (segment-wise lstat walk, junctions included).
  - `src/diff.ts` — zero-dependency deterministic LCS unified diff (`diffLines`, `unifiedDiff`).
  - `src/writer.ts` — `ManagedWriter`: pure `plan()` (containment + symlink + collision + sha256 + diff, NO fs side effects) and atomic `apply()` (temp+rename in target dir, TOCTOU re-check, dry-run returns the identical result without touching disk); `writeManaged` one-shot.
  - `src/init.ts` — `initWorkspace` emits `.planmo/project.yml` + `state.yml` + `manifest.json`, each validated against its strict schema before any byte is written; defaults from options/basename; `allowOverwrite`/`dryRun`.
  - `src/status.ts` — `readStatus` (read-only; explicit root must carry `.planmo/` or `ProjectNotFoundError`; collects ALL doc issues, never writes).
  - Tests: `paths.test.ts`, `writer.test.ts`, `init.test.ts`, `status.test.ts`, `diff.test.ts`, `test-utils.ts` (auto-cleaned temp roots).
  - `package.json` — added `yaml@2.9.1` (runtime: YAML emit/parse in init/status); `tsconfig.build.json` excludes `src/**/*.test.ts` + `src/test-utils.ts`.
- `packages/cli` (extended):
  - `src/index.ts` — `run()` now async; `init` (wizard: prompts only for unprovided values; `--yes` skips all; `--name/--type/--lifecycle/--risk/--agent/--style/--depth/--phase-mode`; `--dry-run`; `--force`; positional/`--dir` root) and `status` (`--dir`); exit codes 0 ok · 1 error · 2 collision · 3 no project; zero-dep flag parser.
  - `src/bin.ts` — awaits `run` (ESM top-level await).
  - `index.test.ts` — rewritten for async API + init/status suites.
  - `package.json` — added `@planmo/core` + `@planmo/schema` (type-only) workspace deps.
- `.changeset/phase-03-cli-foundation.md` — new changeset (core + cli patches).
- planning: DECISIONS (Phase 03 confirmations), REQUIREMENTS-TRACEABILITY (Phase 03 rows), RISKS (R-005/R-007 mitigations updated), TRACKER, tasks.csv (P03 DONE), CHANGELOG (Phase 03 bullet), `.planmo/state.yml` (→ Phase 04, nextPrompt `prompts/05-phase-04-pack-and-profile-system.md`).

## Tests & evidence
| Command/Test | Result | Notes |
|---|---|---|
| `pnpm --filter @planmo/core typecheck` | PASS | TS 7.0.2 strict, zero errors |
| `pnpm --filter @planmo/cli typecheck` | PASS | strict; `exactOptionalPropertyTypes` handled (conditional option spread) |
| `vitest run packages/core packages/cli` | PASS | 63 tests (47 core + 16 cli), 6 files |
| `pnpm build` | PASS | all packages emit (tests + test-utils excluded from dist) |
| `pnpm check` (full gate) | PASS | exit 0: build → typecheck → test (total workspace) → lint → format:check → boundary-check → smoke (`planmo 0.0.0`) |
| `pnpm boundary-check` | PASS | `package boundaries: OK` (core→shared/schema+yaml, cli→core/schema/shared; external deps ungoverned) |
| End-to-end CLI round-trip | PASS | `planmo init --yes` writes 3 schema-valid docs; `planmo status` → HEALTHY (project/state parsed); re-init → exit 2 collision refused; `planmo init --dry-run` writes nothing |
| GitHub Actions CI | BLOCKED | R-021 ghost (unchanged; see phase-01/02 handoffs) |

## Security / reliability findings
- All generated writes go through ONE writer; `plan()` is provably side-effect-free, so `--dry-run` shows the exact bytes/shals/diffs that apply() will land — no drift between preview and effect.
- Containment uses `path.relative` + boundary checks, not string prefixing — verified immune to `/proj` vs `/proj-other` prefix attacks (dedicated test).
- Symlink escape guards run segment-wise through existing ancestors AND re-check the target; Windows junctions are caught (lstat reparse) — verified by junction tests that self-skip only when the OS forbids link creation.
- Collision refusal happens both at plan time and again at apply time (TOCTOU) — a file appearing between plan and apply is never clobbered (dedicated test).
- Atomic writes (temp file + rename in the same directory) leave no partial artifacts on failure (temp cleanup test covers the happy path; failure path deletes the temp file).
- No secrets introduced; fixtures are synthetic.

## Decisions / ADRs
- No new ADR needed: Phase 03 implements ADR-0010 (thin CLI adapters over deterministic core) and docs/08-security/secure-filesystem.md (single writer). Decisions logged in DECISIONS.md: writer guarantees, init exit codes, status read-only, zero-dep diff, `.gitattributes` LF.

## Git
- Branch: `feat/phase-03-cli-foundation` (GitHub Flow; PR to `main`).
- Commits: focused Conventional Commits — see `git log` (core paths/writer/init/status + tests, cli commands + tests, changeset, planning close-out).
- PR: created after this handoff; CI will still hit the R-021 ghost.

## Known debt / next-phase notes
- Interactive wizard uses a thin readline prompt (no external TUI lib). If Phase 10 UX work wants @clack/prompts styling, swap it behind the `WizardIO` interface — the core wizard contract (`--yes` defaultable, deterministic order) is already stabilised.
- `status` is the read path; Phase 09 `planmo doctor` (mixed-state diagnostics) and Phase 08 workflow engine will build on `readStatus`/`WorkspaceStatus`.
- `ManifestSchema` entries are written with revision 0 (empty) at init; the manifest OWNERSHIP ledger (registering every generated artifact with checksum + generator) is Phase 05's job — the writer already computes sha256 for every write, so registration is a later-phase concern.
- `unifiedDiff` is O(n·m) LCS — fine for PlanMo-sized documents; not for giant files (documented in diff.ts).
- `.gitattributes` (LF) must stay; never revert to CRLF working copies or `format:check` breaks on Windows.

## Next phase
- Phase: **04 — Pack & profile system** (prompts/05-phase-04-pack-and-profile-system.md, planning/phases/phase-04.md)
- Read first: the phase prompt/phase file, `docs/02-architecture/canonical-project-model.md`, ADR-0004 (declarative packs), `packages/schema/src/pack-design.ts` (existing `PackSchema`/`DesignProfileSchema`/`DesignTokensSchema`).
- Preconditions: `@planmo/core` writer + `@planmo/schema` pack/design schemas are in place; `planmo init`/`status` prove the writer path; packs package is a reserved empty name (`@planmo/packs`) in the boundary graph.
- Instructions: run repo commands with Node 24 on PATH; keep `.gitattributes`; do not re-add `@typescript-eslint`; follow the `plan()`-pure / `apply()`-atomic writer contract for any new writes; validate every emitted document against its schema before writing (the init template pattern).