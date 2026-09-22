# Phase 10 Handoff — Existing-repository adoption

**Status:** COMPLETE (2026-09-22)
**Branch:** feat/phase-10-existing-repository-adoption (merged to `main` via PR)
**ADR:** ADR-0024 — Safe existing-repository adoption (scanner package)
**Next phase:** Phase 11 — do not start in this session; fresh session required after maintainer instruction.

## What shipped

New package **`@planmo/scanner`** (boundary `core/shared/schema`; `cli` widened to
include `scanner` in `scripts/check-boundaries.mjs`) plus the **`planmo adopt`**
CLI thin shell (dry-run; writes nothing).

Engines (all pure + deterministic; filesystem ONLY via injected `FileReader`):

- **Safe scanner** (P10-01) — `scan/safe-scanner.ts`. Untrusted-content posture:
  depth/entry/size caps (SCN-001/002/004), escaping AND unverifiable symlinks
  refused fail-closed by default (SCN-003), path traversal / NUL / backslash /
  absolute / drive-letter rejection, binary files rejected, deterministic
  depth-first order, `exclude`/`include` narrowing filters.
  - `node-reader.ts` — the ONLY node:fs module (lstat never follows links).
  - `constructor-reader.ts` — virtual trees + failure injection (`readDir`/
    `readFile`/`stat`/`linkTarget` failures) + optional `symlinks` map for
    escape verification.
- **Detection** (P10-02) — `detect/stack-detector.ts`. Evidence-backed
  stack/test/CI detection: `detect(manifests: Map<posix-path, text>)`; DET-001
  manifest (package.json deps/bin/engines + dep rules map), DET-002 test script
  conventions, DET-003 config files, DET-004 tests/ dir heuristic, DET-005 CI
  declarations (github-actions, gitlab-ci, circleci, azure-pipelines, jenkins);
  confidence high (manifest/config/ci-declaration) → medium (lockfile) →
  heuristic (convention); evidence deduped + sorted (path, code, match);
  stacks/testFrameworks/ciSystems sorted by id.
- **Prompt-injection isolation** (P10-03) — `security/prompt-isolation.ts`.
  Immutable marker list; poisoned = 2+ markers OR any INJ-003; suspicious = 1;
  benign = 0; word-boundary case-insensitive matching; deterministic per-line
  markers; `policyIsImmutable: true`; scanned content is DATA, never
  instructions (test proves it cannot override the policy).
- **Adopt engine** (P10-04) — `adopt/adopt.ts`. PURE planning:
  `rewritesApplicationCode: false` always; would-be artifacts confined to
  `.planmo/adopt/` (detection-summary, injection-summary, manifest-record,
  plan-report); deterministic markdown (`# PlanMo adoption plan`); byte lengths
  via TextEncoder.
- **Repository context map** (P10-06) — `context/context-map.ts` — entry points,
  dir/profile stats, scripts, evidence-convention per ADR-0024 (DET-001/DET-002
  manifest conventions documented in module header).
- **Symbol/reference index** (P10-07) — `context/symbol-index.ts` — JS/TS
  (import/export/require), Python (import), Go (import); sorted; bounded.
- **Standards discovery** (P10-08) — `context/standards-discovery.ts` — path-ONLY,
  zero content reads: AGENTS.md rank 0 < nested AGENTS.md (rank=depth) <
  CLAUDE.md (1000+depth) < .cursorrules (2000+depth) < README (informational,
  3000+depth); ties by path asc.
- **Lexical context index** (P10-09) — `context/lexical-context.ts` — token
  histogram capped at 512/file (count desc, token asc), TODO/FIXME/HACK markers
  (case-insensitive, deduped, sorted), files by path.
- **Memory bootstrap** (P10-10) — `context/memory-bootstrap.ts` — durable facts
  with provenance/source paths (repo text is never authority).
- **Fixtures** (P10-05, P10-11) — real on-disk trees:
  - `fixtures/trees/brownfield/` — 21 files, hostile names (`scripts/-rf`,
    `tools/--upload.txt`, `src/..hidden.ts`), package.json + pnpm-lock,
    Python helper, static assets, GitHub Actions workflow, placeholder-only
    secrets (`.env.example`); deliberately NO symlinks (constructed at runtime).
  - `fixtures/trees/poisoning/` — benign README, authority-override
    instructions file, comment-injection source file.
  - Note: the poisoned policy document is named `AGENTS.instructions.md` — a
    file literally named `AGENTS.md` cannot be created by the platform
    (protected filename); intent and content are identical, documented in the
    fixture index (`fixtures/poisoning.ts`). If a literal `AGENTS.md` fixture is
    ever required, a maintainer session must create it with consent.
  - Fixture files avoid `*.test.*`/`*.spec.*` names so vitest never collects
    them as suites (Worker A hardening).

**Lead integration** — `pipeline.ts` `analyzeRepository(root, reader, opts)`:
safe scan → manifest+CI text feeding detection → path-only standards discovery →
injection classification of EVERY scanned text file (bounded by scan caps;
binary skipped fail-closed) → pure adopt plan. CLI `planmo adopt [dir]`
(dry-run report to stdout; poisoned/suspicious notes to stderr; exit 0/1).

## Contract freeze history

- `f8fefe0` — contracts.ts (12 KiB) + package scaffold + ADR-0024 + boundary
  widening + tasks P10-01..11 IN_PROGRESS (P10-11 row added; was missing).
- Contracts backfilled at integration: `LinkTargetReader` (canonical def in
  `scan/safe-scanner.ts`, method `linkTarget`) and Standards discovery types
  (Worker B exported module-local; lead moved them into contracts).

## Validation evidence (all actually run, Node 24.11.0)

- `vitest run` — **61 files, 813 passed, 2 skipped** (2 skips = Windows
  symlink-creation guards in node-reader tests; symlink POLICY fully covered via
  constructor-reader + safe-scanner suites).
- `tsc -p <pkg>/tsconfig.json --noEmit` — all 9 packages clean.
- `node scripts/check-boundaries.mjs` — package boundaries: OK.
- `tsc -p packages/scanner/tsconfig.build.json` + cli build — OK.
- `node scripts/e2e-phase10.mjs` — 35/35 checks (path safety, escape math,
  fail-closed symlinks w/ and w/o linkTarget capability, detection evidence,
  adoption invariants incl. `.planmo/adopt/` confinement + never-rewrites,
  injection isolation incl. poisoned comment file, standards precedence).
- CLI smoke: `node packages/cli/dist/bin.js adopt <poisoning tree>` → report +
  `WARNING 2 file(s) ...` on stderr; brownfield → node/typescript/python stacks,
  github-actions CI, Poisoned: 0.

## Integration fixes made by the lead (recorded for future sessions)

1. The frozen scaffold `src/index.ts` carried an unterminated block comment
   (write truncation artifact: literal `Nothin…[truncated]`); Worker A repaired
   the comment close (`0e7b33d`), lead replaced the file with the real export
   surface.
2. `adopt.ts` `plan({...})` destructured params had no contextual type through
   `Object.freeze` → explicit input type; the changes array needed a typed
   variable (contextual typing does not flow through `.sort()` chains).
3. Pipeline read relative entry paths against the process CWD (got the planmo
   repo's own README instead of the fixture) → `joinRoot(root, rel)` before
   `reader.readFile`; entries are POSIX-relative by contract.
4. CI declarations were not fed to the detector → pipeline now includes
   `.github/workflows/*.ya?ml` + CI_BASENAMES in the manifest text map.
5. Injection classification now covers EVERY scanned text file (was: policy
   docs + CI only) — the poisoning comment file is flagged; cost is bounded by
   scan caps.
6. e2e assertions aligned to actual contracts (`ciSystems: string[]`, markdown
   headings, standardsDiscovery is an object, symlink fixture needs the
   `symlinks` map).

## Known debt / follow-ups

- `planmo validate|doctor|quality|trace` remain unwired shells (Phase 09 note)
  — trace/quality engines exist; wiring deferred to a later phase per plan.
- `pnpm --filter <pkg> test/typecheck` script-runner is flaky in this git-bash
  session (cmd.exe PATH injection); direct `./node_modules/.bin/*` works. CI
  (ubuntu) unaffected.
- R-019 stands: root eslint config lints only JS/MJS; TS gated by tsc.
- A literal `AGENTS.md` under `fixtures/trees/poisoning/` cannot be created by
  this platform; documented above.

## Required by the next fresh session

1. READ `planning/TRACKER.md`, `tasks.csv`, `planning/ROADMAP.md`, the Phase 11
   prompt, `prompts/MASTER-GUARDRAILS.md`, `docs/12-adrs/` (ADR-0024 + newest).
2. Verify `git status` clean on `main`, then begin Phase 11 once the maintainer
   instructs. Do not auto-advance.