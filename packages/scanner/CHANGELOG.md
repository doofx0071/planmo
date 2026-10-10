# @planmo/scanner

## 1.0.4

### Patch Changes

- Updated dependencies [da9ad6a]
  - @planmo/schema@1.1.0
  - @planmo/core@1.0.4

## 1.0.3

### Patch Changes

- Updated dependencies [47d5859]
  - @planmo/shared@1.1.0
  - @planmo/core@1.0.3
  - @planmo/schema@1.0.3

## 1.0.2

### Patch Changes

- 5473462: Add a README to every published package and fill in npm metadata (repository,
  homepage, bugs, keywords), and enable npm provenance attestation.
  
  The published tarballs previously contained only `dist/`, `package.json` and
  `LICENSE`, so the npm pages rendered empty with no usage information. No runtime
  change.
- Updated dependencies [5473462]
  - @planmo/shared@1.0.2
  - @planmo/schema@1.0.2
  - @planmo/core@1.0.2

## 1.0.1

### Patch Changes

- 15dcca6: Validate npm Trusted Publishing (OIDC) for the v1 release line.
  
  No functional change: this release exists to prove the release workflow publishes
  with no npm token, via OIDC (`id-token: write`) and the trusted-publisher
  configuration on each package. A real publish is required because npm only
  validates a trusted-publisher configuration once it sees an authenticated publish
  from the configured repository and workflow.
- Updated dependencies [15dcca6]
  - @planmo/shared@1.0.1
  - @planmo/schema@1.0.1
  - @planmo/core@1.0.1

## 1.0.0

### Major Changes

- 5ac4068: Phase 12 (release candidate prep): upgrade/migration validation E2E, representative pilots on the real CLI, and new-user docs — hardening evidence, no behavioural regressions.
  
  - `@planmo/schema`: `upgrade-migration-e2e.test.ts` (NEW, 24 tests) migrates every chain-covered legacy fixture (project/state/handoff v0 → v1) to the current schema with strict-parse + round-trip stability + `extensions` preservation; asserts v1-only kinds (lockfile, manifest, pack, design profile, trace graph, work packet) keep golden fixtures parseable (incl. pre-Phase 11 lockfiles and legacy ownership aliases) and reject future/unknown versions; records the downgrade policy: migration is upgrade-only (no engine-supported downgrade), v0 → v1 is additive and pure, legacy rollback is legacy-only (original v0 file always untouched).
  - `@planmo/core` / `@planmo/scanner` / `@planmo/cli`: exercised end-to-end by `scripts/e2e-phase12-pilots.mjs` (8 pilots, 63/63 checks) driving the real built CLI — greenfield init + HEALTHY status, dry-run writes nothing, collision exit 2 + `--force`, brownfield `adopt --dry-run` confined to `.planmo/adopt/` with `rewritesApplicationCode: false` on a hostile fixture, `--depth high-assurance` validation, exit-code surface 0/1/2/3, byte-identical determinism across runs. No code changes in this phase — hardening is evidence + docs only.
  - Docs: `docs/10-engineering/pilots.md` (NEW — pilot report, findings incl. the documented-vs-real CLI surface mismatch), `docs/03-cli/examples.md` (NEW — new-user walkthrough matching the actual v1 surface), `docs/09-testing/release-test-gates.md` (Phase 12 evidence section).

### Patch Changes

- Updated dependencies [5ac4068]
  - @planmo/schema@1.0.0
  - @planmo/core@1.0.0
