# Release Test Gates

## Per-PR minimum
- targeted unit/integration tests;
- lint + format-check + typecheck;
- relevant negative-path tests;
- deterministic snapshot/golden updates reviewed explicitly.

## CLI/filesystem changes
Must additionally test:
- Windows + Linux path semantics;
- path traversal rejection;
- symlink/junction handling;
- collisions/ownership;
- dry-run parity with actual write;
- interruption/retry safety where relevant.

## Schema/persisted-format changes
Must additionally test:
- old fixture -> migration -> new schema;
- invalid/unknown versions;
- round-trip serialization;
- downgrade/rollback policy documented.

## Pack/resolution changes
Must additionally test:
- dependency cycles;
- conflicts;
- incompatible versions;
- deterministic ordering;
- tampered checksum/provenance cases.

## Scanner/adoption changes
Must additionally test malicious repositories containing:
- prompt-injection text;
- symlink escape attempts;
- huge/noisy trees;
- malformed package/config files;
- misleading stack indicators;
- binary/generated/vendor directories.

## Before release candidate
- full unit/integration suite;
- golden repositories;
- property/fuzz tests on parsers/resolvers/path normalization;
- supported OS matrix;
- supported Node LTS matrix;
- clean-install E2E;
- upgrade/migration E2E;
- npm pack/install smoke test;
- security audit and dependency review.

## Before 1.0
All Phase 12 gates plus successful representative pilots.

## Phase 12 evidence (2026-09-22)

Evidence gathered for the release-candidate gates above (upgrade/migration
E2E, clean-install E2E, representative pilots). Real numbers from the
passing runs on Windows 11 / Node v24.11.0 / pnpm 10.33.0.

### Upgrade/migration E2E — `packages/schema/src/upgrade-migration-e2e.test.ts`
`pnpm exec vitest run packages/schema/src/upgrade-migration-e2e.test.ts` →
**1 file, 24 tests passed**; `pnpm --filter @planmo/schema typecheck` exit 0.
Covers every persisted doc kind in `packages/schema/src/migrations.ts`:

- migration chains (v0 legacy → current v1): project config
  (`project.v0.legacy.yml`), state (`state.v0.legacy.yml`), handoff
  (inline legacy) — migrate → strict parse → round-trip stable (YAML and
  JSON), user `extensions` preserved, re-migration idempotent, migration is
  pure (legacy input never mutated);
- v1-only document kinds with **no migration chain** (born versioned):
  lockfile (`lock.v1.golden.yml`, pre-Phase 11 lockfiles without
  `trustLevel` still parse), manifest (`manifest.v1.golden.json`, legacy
  `managed`/`merge` ownership aliases still parse), pack, design profile,
  trace graph, work packet — the current parser rejects unversioned
  documents (no legacy path) and rejects future major versions;
- future-major rejection at the versioning layer for every kind
  (`schemaVersion > 1` → `UnsupportedSchemaVersionError`, strict schema
  parse also fails), and the downgrade policy below.

**P12-04 downgrade finding (engine-supported vs legacy-only).**
The migration engine supports **upgrades only**: `SchemaMigrations.migrate`
moves a document 0 → current (v1) and there is no API to lower a
`schemaVersion`, so **no engine-supported downgrade exists**. The only
"older format" is unversioned legacy (v0), and downgrades to it are
**legacy-only**: the v0 → v1 step is additive (stamps `schemaVersion: 1`,
preserves every field and `extensions` verbatim) and migration is pure —
it never mutates its input, so a user who wants the legacy form keeps the
original v0 file untouched; no in-engine downgrade path exists, and a
pre-versioning build cannot read v1 documents at all. Asserted in
`upgrade-migration-e2e.test.ts` ("downgrade policy" block): no downgrade
writer on the registry, output pinned to the current `SCHEMA_VERSION`, and
input purity. Consistent with `docs/02-architecture/schema-versioning.md`
(reject future major versions, explicit migrations, no silent user-data
discard); the downgrade policy itself is recorded here and in
`docs/10-engineering/pilots.md`.

### Representative pilots — `scripts/e2e-phase12-pilots.mjs`
Drives the real built CLI (`node packages/planmo/dist/bin.js`, after
`pnpm -r build` — 13/13 packages compiled clean). **8 pilots, 63/63 checks
PASS, runner exit 0.** Deterministic: no AI key, no network; byte-identity
asserted across identical runs. Exit-code surface exercised: 0, 1
(unknown command), 2 (collision refused), 3 (no project). Greenfield
init + HEALTHY status; init `--dry-run` writes nothing; re-init refuses
(exit 2) and `--force` succeeds; brownfield `adopt --dry-run` on a hostile
fixture is confined to `.planmo/adopt/` with `rewritesApplicationCode:
false`, classification Poisoned 1 / Suspicious 1 / Benign 9, and no side
effects; `--depth high-assurance` workspace validates; surface honesty
(`--help` lists exactly the implemented commands — plan/generate/next are
wired — asserted, not fabricated).

### Docs/examples
- `docs/03-cli/examples.md` (NEW) — new-user walkthrough of the actual
  v1 CLI surface (`init`/`status`/`adopt`, flags, dry-run, collision
  handling, exit codes).
- `docs/10-engineering/pilots.md` (NEW) — full pilot report: commands,
  real output, findings (incl. the documented-surface mismatch and the
  Windows/MSYS path pitfall), follow-ups.
