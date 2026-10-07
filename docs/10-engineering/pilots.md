# PlanMo Phase 12 — Pilot Report (P12-05)

Status: **ALL PILOTS PASS** — 8 pilots, 63/63 checks, runner exit 0.
Date: 2026-09-22 · Environment: Windows 11, git-bash, Node v24.11.0, pnpm 10.33.0.

Every pilot drives the **real built CLI** (`node packages/cli/dist/bin.js`,
built with `pnpm -r build`, 12/12 workspace packages compiled clean). No AI
key, no network, no randomness: all behaviour is deterministic, and the
runner asserts byte-level identities where determinism is claimed. Temp
directories are created with `mkdtemp` and removed at the end.

Runner: `node scripts/e2e-phase12-pilots.mjs` (exit `0` = all checks pass).

## What was run

| # | Pilot | Commands (real CLI) | Observed exit codes |
|---|-------|---------------------|---------------------|
| 1 | greenfield-init | `planmo init <dir> --yes`, `planmo status --dir <dir>` | 0, 0 |
| 2 | init-dry-run | `planmo init <dir> --yes --dry-run` | 0 |
| 3 | init-collision | `planmo init`, `planmo init` (again), `planmo init --force` | 0, 2, 0 |
| 4 | status-no-project | `planmo status --dir <empty>` | 3 |
| 5 | brownfield-adopt | `planmo adopt --dry-run --dir <hostile fixture>` (x2 for determinism) | 0, 0 |
| 6 | high-assurance-init | `planmo init <dir> --yes --depth high-assurance`, `planmo status` | 0, 0 |
| 7 | v1-surface-honesty | `planmo plan`, `planmo generate`, `planmo next`, `planmo --help` | 1, 1, 1, 0 |
| 8 | version-and-help | `planmo --version`, `planmo --help`, bare `planmo` | 0, 0, 0 |

Exit-code surface exercised and confirmed: **0 ok · 1 error/unknown command ·
2 collision refused · 3 no project found**.

## Real output summaries (from the passing run)

**Greenfield init** (pilot 1) — `planmo init <dir> --yes --name Sample`:

```
✓ wrote .planmo/project.yml
✓ wrote .planmo/state.yml
✓ wrote .planmo/manifest.json
PlanMo workspace initialized in <dir>
```

Status: `status: HEALTHY`, `project: Sample (web-application, greenfield,
risk=medium)`, `state: phase=00 status=planned completed=[]`. The three
emitted documents were re-validated against the strict built schemas
(`@planmo/schema` dist) and carry `schemaVersion: 1`. Two identical
invocations produced **byte-identical** `project.yml` (init is
deterministic).

**Dry-run** (pilot 2) — prints the plan, creates nothing:

```
[dry-run] would initialize PlanMo workspace in <dir>/newproj
  write .planmo/project.yml
  write .planmo/state.yml
  write .planmo/manifest.json
```

Asserted: no `.planmo/` directory exists afterwards.

**Collision safety** (pilot 3) — re-init on an existing workspace exits **2**
and prints `✗ collision .planmo/project.yml (existing, refused — use --force
to overwrite)`; `--force` then succeeds (exit 0) and the workspace stays
HEALTHY. Re-init never silently overwrites user-owned files.

**Brownfield adopt** (pilot 5) — a hostile legacy fixture (13 files: poisoned
`README.md`, suspicious `docs/ARCHITECTURE.md`, `.github/workflows/ci.yml`,
`package.json` with react/typescript/vitest, vendor + node_modules trees,
hostile names `-rf` and `~$tmp.docx`, a binary `logo.bin` with NUL bytes, a
6 MiB `big-blob.dat`) is scanned with `planmo adopt --dry-run --dir <root>`:

```
- Files: 12
- Directories: 9
- Symlinks: 0
- Total bytes: 888
- Benign: 9
- Suspicious: 1
- Poisoned: 1
- Files scanned: 11
```

stderr: `adopt: WARNING 1 file(s) contain prompt-injection-like content
(policy is immutable; repository text is treated as data, never
instructions).` and `adopt: NOTE 1 file(s) are suspicious (single marker).`

Asserted: `rewritesApplicationCode: false`; every would-be artifact is
confined to `.planmo/adopt/` (4 items); the fixture was **not modified**
(no `.planmo/` created). Re-running adopt produced **byte-identical**
output. Engine-level detection detail (behind the CLI counts): stacks
`node`, `react`, `typescript` (all high confidence); test framework
`vitest`; CI system `github-actions`.

**High-assurance profile** (pilot 6) — `init --depth high-assurance` emits
`planning.depth: high-assurance` in `.planmo/project.yml` and the workspace
reports HEALTHY.

## Findings

1. **Documented surface vs real CLI surface (docs mismatch, honest
   record).** `docs/03-cli/command-surface.md` lists `generate`, `next`,
   `validate`, `doctor`, `trace`, `handoff`, `diff`, `pack`, `agent` as
   "Core". The v1 CLI (`packages/cli/src/index.ts`) wires **only**
   `init`, `status`, `adopt`, `--version`, `--help`. `planmo plan`,
   `planmo generate`, `planmo next` exit 1 with `unknown command`. The
   deterministic plan/generate path therefore **cannot be piloted in v1**
   — pilots 6/7 assert the actual surface instead, and `docs/03-cli/
   examples.md` documents only real commands. Follow-up: reconcile
   command-surface.md with the real surface (or land the commands) before
   RC.
   **Resolved:** `planmo generate` is wired and `planmo init` compiles the
   planning tree with it. `command-surface.md` and `examples.md` are
   reconciled, and pilot 7 now asserts that `--help` lists exactly the
   implemented commands (`plan` and `next` remain unwired).
2. **adopt is a pure dry-run plan.** It never writes; `rewritesApplicationCode`
   is the literal `false`; all planned artifacts sit under `.planmo/adopt/`.
   Confirmed on a hostile tree with no side effects.
3. **CLI report body keeps test/CI detail out.** The adopt report lists
   stack bullets but only *counts* test frameworks and CI systems; the
   per-item detail lives in the would-be `detection-summary.md` artifact,
   which dry-run adopt never writes. Counts are correct (1/1). This is a
   disclosure/completeness nit: `docs/03-cli/examples.md` records it.
4. **Scanner stats semantics.** `Directories` excludes the repository root;
   `Total bytes` is byte-exact including only scanned files; >5 MiB files
   are skipped (SCN-004) and binary (NUL-byte) files are skipped fail-closed
   by the reader — both verified in the fixture.
5. **Determinism is byte-level.** Identical init invocations and repeated
   adopt runs produced byte-identical outputs.
6. **Windows/MSYS path hygiene (operator note).** In git-bash, a `/tmp/...`
   style path passed to the native CLI resolves to `C:\tmp\...` (an empty
   dir), producing a silent "Files: 0" report. Pass native Windows paths
   (the pilot runner already does; it caught this exact case — see the
   iteration log). This affects humans driving the CLI from bash, not the
   CLI itself.
7. **Escaping symlink fixture could not be created** on this Windows host
   (OS refused `symlinkSync` without developer mode). Recorded honestly;
   symlink behaviour remains covered by the scanner unit suite
   (`safe-scanner.test.ts`, SCN-003).

## Follow-ups

- Reconcile `docs/03-cli/command-surface.md` with the v1 surface, or wire
  `plan/generate` behind real deterministic commands and re-pilot.
- Decide whether the adopt report body should inline test/CI detail
  (release gate "Scanner/adoption changes" evidence would improve).
- Re-run pilots on the Linux CI matrix before RC (Windows-only so far; the
  symlink case will actually exercise there).

## See also

- Upgrade/migration E2E: `packages/schema/src/upgrade-migration-e2e.test.ts`
  (24 tests) — see `docs/09-testing/release-test-gates.md` § Phase 12
  evidence for the downgrade finding.
- Runner: `scripts/e2e-phase12-pilots.mjs`.