# PlanMo CLI — Quick Examples (new user)

The PlanMo CLI is **deterministic and works without an AI key**. v1 exposes
three commands — `planmo init`, `planmo status`, `planmo adopt` — plus
`--version`/`--help`. Everything below was verified against the real built
CLI (see `docs/10-engineering/pilots.md`, 63/63 checks passing).

Exit codes: `0` ok · `1` error/unknown command · `2` collision refused ·
`3` no project found.

## 1. Start a new project: `planmo init`

```console
$ planmo init hello --yes
✓ wrote .planmo/project.yml
✓ wrote .planmo/state.yml
✓ wrote .planmo/manifest.json
PlanMo workspace initialized in C:\Users\you\hello
```

`--yes` accepts defaults for anything you do not pass. Without it, init asks
a short wizard (name, type, lifecycle, risk, primary agent). `init [dir]`
creates the directory if missing and writes only the three canonical
documents under `.planmo/`, all schema-validated **before** a single byte
is written:

- `.planmo/project.yml` — project config (strict schema, `schemaVersion: 1`)
- `.planmo/state.yml` — phase state (`currentPhase: "00"`, `status: planned`)
- `.planmo/manifest.json` — artifact provenance (revision 0, empty entries)

Useful flags (see `planmo --help` for the full list):
`--name`, `--type`, `--lifecycle`, `--risk`, `--agent`, `--style`,
`--depth`, `--phase-mode`, `--yes`, `--dry-run`, `--force`.

A planning depth example:

```console
$ planmo init security-core --yes --depth high-assurance --risk high
✓ wrote .planmo/project.yml
✓ wrote .planmo/state.yml
✓ wrote .planmo/manifest.json
PlanMo workspace initialized in C:\Users\you\security-core
```

`.planmo/project.yml` carries `planning.depth: high-assurance`, and
`planmo status` reports the workspace HEALTHY.

### Dry run first

`--dry-run` prints the exact plan and writes nothing:

```console
$ planmo init hello2 --yes --dry-run
[dry-run] would initialize PlanMo workspace in C:\Users\you\hello2
  write .planmo/project.yml
  write .planmo/state.yml
  write .planmo/manifest.json
```

Nothing is created. This is the safe default habit: PlanMo's write path is
dry-run/diff-first by design, so `--force` is only needed when you
deliberately re-run init onto an existing workspace.

### Existing files are never silently overwritten

```console
$ planmo init hello --yes
✗ collision  .planmo/project.yml (existing, refused — use --force to overwrite)
✗ collision  .planmo/state.yml (existing, refused — use --force to overwrite)
✗ collision  .planmo/manifest.json (existing, refused — use --force to overwrite)
```
exit code `2`. Re-running with `--force` performs a managed overwrite
(exit `0`) — the content is regenerated deterministically and stays
schema-valid.

## 2. Check a workspace: `planmo status`

```console
$ planmo status
PlanMo workspace: C:\Users\you\hello
project: hello (web-application, greenfield, risk=medium)
state: phase=00 status=planned completed=[]
status: HEALTHY
```

`status` start from your current directory and walks up to the nearest
`.planmo/`; use `planmo status --dir <path>` for another location. HEALTHY
means every canonical document parses against its **strict** schema
(unknown keys are rejected, `schemaVersion` must be present and current).
Outside any workspace:

```console
$ planmo status --dir C:\empty
planmo status: no PlanMo project found from "C:\empty" (no .planmo/ directory walks up); run 'planmo init' first
```
exit code `3`.

## 3. Look at an existing codebase: `planmo adopt`

`adopt` is a **pure dry-run**: it scans a repository, detects stacks, test
frameworks and CI systems, classifies text for prompt-injection-like
content, and prints an adoption plan — it never writes and never rewrites
application code.

```console
$ planmo adopt --dir C:\repo\legacy-mess
# PlanMo adoption plan

Root: C:\repo\legacy-mess

Dry run: yes — planning writes nothing; only the caller may write under .planmo/adopt/.

## Scan summary
- Files: 12
- Directories: 9
- Symlinks: 0
- Total bytes: 888

## Detection summary
- Stacks: 3
  - node (runtime, high)
  - react (framework, high)
  - typescript (toolchain, high)
- Test frameworks: 1
- CI systems: 1

## Injection summary
- Benign: 9
- Suspicious: 1
- Poisoned: 1
- Files scanned: 11

## Would-be artifacts
- .planmo/adopt/detection-summary.md (detection-summary)
- .planmo/adopt/injection-summary.md (injection-summary)
- .planmo/adopt/manifest-record.md (manifest-record)
- .planmo/adopt/plan-report.md (plan-report)

## Notes
- rewritesApplicationCode: false
- adopt never rewrites application code in v1; .planmo/adopt/ is the only writable surface.
```

This is the actual output of the hostile-fixture run in
`scripts/e2e-phase12-pilots.mjs` (12 scanned files: a poisoned `README.md`,
a suspicious design doc, a `package.json` with react/typescript/vitest, a
GitHub Actions workflow, vendor/node_modules trees, hostile names `-rf`
and `~$tmp.docx`, a binary file, and a 6 MiB blob skipped by the size cap).

Notes on the report:

- **Poisoned/suspicious files** also print warnings on stderr — repository
  text is treated as *data*, never as instruction authority
  (policy is immutable), and adopt still exits `0`.
- The report body lists stack bullets but only *counts* test frameworks and
  CI systems; the per-item detail is in the would-be
  `detection-summary.md` artifact.
- The scan is deterministic: run it twice and you get byte-identical
  output. Files larger than 5 MiB are skipped (SCN-004) and binary
  (NUL-byte) files are skipped fail-closed, so hostile or noisy trees
  cannot hang or poison the run.

## 4. What is NOT in v1 (yet)

`planmo plan`, `planmo generate`, `planmo next`, `planmo validate`,
`planmo doctor`, `planmo diff`, `planmo pack`, `planmo agent` are **not
wired in the v1 CLI**:

```console
$ planmo plan
planmo: unknown command 'plan'
Run 'planmo --help' for usage.
```
exit code `1`. The deterministic planning/generation engines exist in
`@planmo/core`/`@planmo/generator` (and are exercised by the test suite),
but their CLI wiring is a post-v1 (or RC) surface. `docs/03-cli/
command-surface.md` currently lists them as "Core" — treat that document as
aspirational until the commands land.

## 5. Environment notes

- Git-bash on Windows: pass **native Windows paths** (e.g. `C:\repo`) to
  the CLI. A `/tmp/...` style path resolves to `C:\tmp\...`, which silently
  scans the wrong (empty) directory.
- Everything here works offline; no API key is required.