# planmo

## 1.3.4

### Patch Changes

- Updated dependencies [0c86cf5]
  - @planmo/generator@1.1.2

## 1.3.3

### Patch Changes

- Updated dependencies [2cef618]
  - @planmo/generator@1.1.1

## 1.3.2

### Patch Changes

- Updated dependencies [47d5859]
  - @planmo/shared@1.1.0
  - @planmo/generator@1.1.0
  - @planmo/trace@1.1.0
  - @planmo/core@1.0.3
  - @planmo/packs@1.0.1
  - @planmo/scanner@1.0.3
  - @planmo/schema@1.0.3

## 1.3.1

### Patch Changes

- Updated dependencies [1cc0cf5]
  - @planmo/generator@1.0.1

## 1.3.0

### Minor Changes

- 7797153: Add `planmo validate`, and fix `tasks.csv` so a generated workspace passes it.
  
  `validate` checks a workspace's canonical documents and their cross-document
  invariants and exits `1` when the report contains an error, so it can gate CI. It
  is a thin adapter over `@planmo/trace`'s validator — no validation logic in the
  CLI. Diagnostics carry stable codes (`VLD-001` phase gap, `VLD-002` blocked task
  with no row, `VLD-003` handoff next-phase, `VLD-004` document fails schema parse)
  and an actionable remediation line.
  
  Fixed: the generated `planning/tasks.csv` had six columns
  (`id,phase,title,status,depends_on,acceptance`) while the validator requires
  exactly five (`id,phase,title,status,priority`), so a freshly generated workspace
  failed its own validator with `VLD-004`. Dependencies and acceptance criteria now
  live in `REQUIREMENTS-TRACEABILITY.md` and the phase documents, where they are not
  constrained to a fixed column count.
  
  Publishing is now tokenless: all twelve packages exist on the registry and carry a
  trusted publisher, so the `NPM_TOKEN` fallback is gone from the release workflow.
  Adding a brand-new package will need a bootstrap token again.

## 1.2.0

### Minor Changes

- 72c9457: `planmo init` now produces the full planning workspace, and user-owned documents
  survive regeneration.
  
  `init` previously wrote the plan spine only (roadmap, tracker, phase docs, handoff
  template, standards, context). It now also emits the documents an agent needs to
  work the plan:
  
  - `planning/README.md`, `MASTER-PLAN.md`, `REQUIREMENTS-TRACEABILITY.md` and the
    canonical `tasks.csv`
  - `planning/architecture/{ARCHITECTURE,DOMAIN-MODEL,SECURITY-PRIVACY,STATE-MACHINES}.md`
  - `planning/compliance/POLICY-REGISTER.md`
  - `planning/design/{DESIGN-BRIEF,DESIGN-SYSTEM}.md`
  - `planning/prompts/{README,phase-prompt}.md`
  - `planning/requirements/PRODUCT-REQUIREMENTS.md`
  - `planning/testing/TEST-STRATEGY.md`
  
  A standard-depth project now generates 30 documents (was 12).
  
  Ownership is per document, not per folder. Documents derived from the project model
  are regenerated; documents that accumulate decisions (`DECISIONS.md`,
  `OPEN-QUESTIONS.md`, `RISKS.md`, `prompts/`) are written once and then belong to the
  user.
  
  Fixed: seeded documents were rewritten on every `generate`, silently discarding user
  edits. `compileWorkspace` now writes only what the preview marks writable, so a
  `seeded` file that already exists is never touched again.

## 1.1.1

### Patch Changes

- 106b470: Publish the seven remaining workspace packages, so all twelve are on npm.
  
  `planmo@1.1.0` shipped depending on `@planmo/generator` and `@planmo/packs`, which were
  still private — `npm install planmo@1.1.0` failed with a 404 resolving
  `@planmo/generator`. Every package in the CLI's runtime closure is now published, so the
  CLI installs again.
  
  The seven were bumped to `1.0.0` directly rather than through a changeset: a `major`
  changeset on a `0.x` package cascades patch bumps to every dependent and would have
  shipped the whole release as `1.0.1`.

## 1.1.0

### Minor Changes

- 73cdd31: Add `planmo generate`, and make `planmo init` produce the planning workspace.
  
  `init` previously wrote only the three `.planmo/` documents, leaving a workspace with
  nothing for an agent to work from. It now also compiles the planning tree
  (`planning/ROADMAP.md`, `TRACKER.md`, `STANDARDS.md`, `CONTEXT.md`, `handoffs/TEMPLATE.md`
  and `phases/phase-NN.md`) through the same generator that powers regeneration, and records
  every artifact in `.planmo/manifest.json` with ownership and lineage.
  
  New command: `planmo generate [--dir <path>] [--dry-run] [--force]` recompiles the planning
  documents from the canonical project model. Manifest-owned files are refreshed without
  `--force`; unmanaged files are never overwritten.

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
  - @planmo/scanner@1.0.2

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
  - @planmo/scanner@1.0.1

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
  - @planmo/scanner@1.0.0
