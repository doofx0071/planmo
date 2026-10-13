# PlanMo — repository audit, fixes, and tracker

Stages 0–7 of the reliability pass. Baseline commit `0de291d`; branch
`fix/agent-audit-doctor-hermeticity`. Environment: Windows 11, git-bash,
Node 26.7.0 (test runner), pnpm 10.33.0.

Statuses: `CONFIRMED` · `FIXED` · `VERIFIED` · `ALREADY FIXED` · `NOT REPRODUCED` ·
`NOT A DEFECT` · `DEFERRED` · `BLOCKED`.

## 1. Issue register

| ID | Sev | Lead | Status | Summary |
| -- | --- | ---- | ------ | ------- |
| F-01 | P1 | A | ALREADY FIXED | Task status / evidence durability across regeneration |
| F-02 | P1 | B | FIXED | README and CLI docs advertised only 3 of 14 commands |
| F-03 | P1 | C | FIXED | Package inventory: `@planmo/ai` missing from the README (13 ship, not 12) |
| F-04 | P2 | C | VERIFIED | Internal dependency graph has no undeclared/missing/cyclic edges |
| F-05 | P1 | E | FIXED | `generate`/`diff`/`validate`/`doctor` returned `3` on any error |
| F-06 | P2 | F | FIXED | CLI entry point oversized (1213 lines) |
| F-07 | P1 | G | VERIFIED | Security / filesystem protections present and retained |
| F-08 | P1 | — | FIXED | Doctor tests were host-Node-dependent (red on Node >= 25) |
| F-09 | P2 | — | FIXED | `format:check` failed on an untracked working file |
| F-10 | P2 | — | FIXED | `planmo task <id>` hung forever when stdin is not a TTY |
| F-11 | P3 | — | NOT REPRODUCED | Suspected missing README in published tarballs |
| F-12 | P1 | — | FIXED | No isolated-install or lifecycle e2e in the gate |
| F-13 | P2 | B | FIXED | Stale "not CLI-wired" claims in testing/pilot docs |
| F-14 | P1 | D | NOT A DEFECT | Reported version mismatch (repo vs third-party index) |
| F-15 | P1 | H | FIXED | `--help` ignored below the top level — `init --help` ran the wizard, `adopt --help` scanned the repo |
| F-16 | P1 | H | FIXED | Unknown options silently ignored — a typo dropped the flag and the write never happened |
| F-17 | P1 | H | FIXED | Interactive commands with no terminal exited `13` with a Node internal warning |
| F-18 | P2 | H | FIXED | `init --dry-run` reported 3 of the ~34 files the real run writes |
| F-19 | P2 | H | FIXED | `status` reported HEALTHY on a workspace `validate` called FAILED |
| F-20 | P3 | H | FIXED | `init` printed "workspace initialized" when every write collided |
| F-21 | P2 | H | FIXED | Manifest checksums were recorded but never verified |

## 2. Detail

### F-01 — State/evidence durability (Lead A) — ALREADY FIXED
Status is recorded in `.planmo/state.yml` (`packages/planmo/src/task.ts:107`) and
merged into every generated surface (`packages/planmo/src/generate.ts:72` ->
`@planmo/generator` `ir.taskStatus` -> `render.ts:193`). Evidence lives in the
user-owned `planning/testing/TEST-EVIDENCE.csv`, which regeneration never rewrites.
Landed in #79/#81. Regression tests already existed and were confirmed green:
`generate.test.ts:83` ("preserves recorded evidence across a regeneration"),
`task.test.ts:50` ("survives a full regeneration"). No duplicate test added.

### F-02 / F-13 — Documentation drift (Lead B) — FIXED
`README.md` ("What v1 ships" + command table), `ROADMAP.md`,
`docs/03-cli/command-surface.md`, `docs/03-cli/examples.md`,
`docs/09-testing/release-test-gates.md` and `docs/10-engineering/pilots.md` all
described the CLI as `init`/`status`/`adopt` only. `packages/planmo/src/index.ts`
wires 14 commands. All updated to the verified surface; `docs/03-cli/exit-codes.md`
now documents the shipped 0/1/2/3 contract instead of a proposed 0-9 band.

### F-03 / F-04 — Package inventory (Lead C) — FIXED / VERIFIED
The README listed 12 packages and omitted `@planmo/ai` (a declared dependency of the
CLI, `packages/planmo/package.json:49`). Fixed. A new `scripts/check-inventory.mjs`
audits the graph and reports **OK (13 packages)**: no undeclared internal imports, no
missing entry point, `files` covers `dist`, no cycles, README table matches the
workspace. Wired into `pnpm check:inventory` and CI.

### F-05 — Misleading exit code (Lead E) — FIXED
`runGenerate`/`runDiff`/`runValidate`/`runDoctorCommand` returned a bare `3` on any
error, while the documented contract is `3` = *no project found* and every other
handler mapped `ProjectNotFoundError ? 3 : 1`. Now consistent; regression test in
`index.test.ts` ("maps a broken workspace to exit 1..."). Existing tests that assert
`3` for a genuinely missing workspace still pass.

### F-06 — Oversized CLI entry (Lead F) — FIXED
`packages/planmo/src/index.ts` was 1213 lines mixing the router, handlers, arg
parsing, the wizard and output formatting. Stage 6 split it behaviour-preservingly,
one boundary at a time, with the full suite green after each move:

| Module | Lines | Contents |
| --- | --- | --- |
| `index.ts` | 80 | imports + the `run()` router only |
| `usage.ts` | 133 | the `--help` text (was inline) |
| `cli-io.ts` | 108 | `CliIO`, `WizardIO`, `parseArgs`, `defaultIO`, `terminalWizard` |
| `commands/workspace.ts` | 425 | `init`, `status`, `adopt`, `generate`, `diff`, `validate`, `doctor` |
| `commands/agent.ts` | 233 | `agent init` / `agent list` / `agent apply` |
| `commands/tasks.ts` | 191 | `next`, `task`, `trace`, `handoff`, `pack` |
| `commands/plan.ts` | 110 | `plan` |

No public behaviour change: the same argv produces the same output and exit code,
`USAGE` is byte-identical, and `./index.js` still exports `run` and `USAGE`.
Verified by the full unit suite plus every real-CLI e2e script
(`e2e-phase12-pilots` 69/69, `e2e-cli-generate`, `e2e-cli-agent`, `e2e:lifecycle`,
`e2e:install`). A dead import (`renderHandoffDocument`) was removed in the process.

### F-07 — Security / filesystem protections (Lead G) — VERIFIED
Retained unchanged: the managed writer (`packages/core/src/writer.ts`, atomic
temp+rename, collision refusal), path/symlink guards (`packages/core/src/paths.ts`,
`PathTraversalError`/`UnsafeSymlinkError`), prompt-injection isolation
(`@planmo/scanner`), dry-run/diff, ownership manifest.

### F-08 — Host-dependent doctor tests — FIXED
The tests asserted `doctor: OK` while `runDoctor` read the host's `process.version`;
DOC-002 warns on an ahead-of-LTS major, so the suite was red on Node >= 25 (which the
engines permit) and green only on CI's 24.x. `DoctorOptions.nodeVersion` is now
injectable (defaults to the running Node); tests pin a supported version, and a new
test proves an injected version is judged.

### F-09 — Gate hygiene — FIXED
`PLANMO_AGENT_FIX_PROMPT.md` (an untracked working file) failed `format:check`. It is
now in `.prettierignore`.

### F-10 — `task` hangs on a non-TTY — FIXED
`planmo task <id>` with no `--status` awaited a clack prompt that can never be
answered when stdin is not a terminal, hanging forever. Now guarded like `agent`
(`nodeStdin.isTTY === true && nodeStdout.isTTY === true`): it fails fast with usage
and exit `1`. Regression test in `index.test.ts`.

### F-11 — Suspected missing README in tarballs — NOT REPRODUCED
An early check suggested the tarballs carried no README, but the listing had been
truncated with `head`. Re-verified: every package has a README at its root and npm
includes it (`package/README.md`, `package/LICENSE`) regardless of `files: ["dist"]`.
No change made. An initial write that would have overwritten the 13 package READMEs
was caught in the pre-commit diff review and reverted.

### F-12 — Missing end-to-end gates — FIXED
Added `scripts/e2e-lifecycle.mjs` (init -> validate -> diff -> next -> task ->
evidence -> generate -> durability assertions -> trace -> handoff -> validate ->
doctor, every step a fresh process) and `scripts/e2e-install-smoke.mjs` (packs all 13
packages, installs the CLI from tarballs in isolation, drives it). Both wired into
`package.json` and CI (ubuntu only).

### F-14 — Version mismatch (Lead D) — NOT A DEFECT
At audit time the local source was `planmo@1.14.0` while official npm `latest` was
`1.14.1` — one release ahead, because the `Version Packages` commit (#82) landed on
`main` after this branch was cut. The "1.7.0" figure came from a third-party index
and is contradicted by the registry. `main` now carries `planmo@1.14.1`, matching
npm; this work changed no version.

### F-15 — `--help` was ignored below the top level — FIXED
Only `planmo --help` was understood. Every other command parsed `--help` into the
flag map, never read it, and ran normally: `planmo init --help` launched the init
wizard, and `planmo adopt --help` scanned a 4,525-file repository and then asked
whether to write its reports. A help flag performing the work it should describe.
`usageFor(command)` now prints that command's own option block and the router
returns before dispatch, so `--help` never runs anything.

### F-16 — Unknown options were silently ignored — FIXED
`parseArgs` collected flags into a map and a handler simply never read the ones it
did not know, so `status --bogus` exited `0`. The dangerous case is a typo:
`planmo task P00-02 --stauts DONE` discarded the flag, fell through to the
interactive status prompt, and exited `13` without applying the change — a
scripted write lost with no error. The router now checks every `--flag` against
the documented set for that command and reports an unknown option as a usage
error.

### F-17 — No terminal meant exit `13` — FIXED
`@clack/prompts` leaves its promise pending when stdin cannot be read, so
`init` (without `--yes`), `adopt` (without `--yes`/`--dry-run`), and `task` with
no id produced Node's `Detected unsettled top-level await at .../bin.js:5` and
exit **13** — a code outside the documented contract, naming neither the missing
terminal nor the way out. `requireTerminal` in `cli-io.ts` names the problem, and
the router's catch turns it into exit `1`. (`task` already had an ad-hoc guard;
this covers the shared prompt layer instead.)

### F-18 — `init --dry-run` under-reported the write set — FIXED
It printed the three `.planmo/` files and returned, while the real run then
compiles the whole planning tree — 34 files in total. `previewPlanningWorkspace`
builds the same IR and runs the same compile preview, so the dry run reports the
write set the real run performs rather than a hand-maintained subset.

### F-19 — `status` called a broken workspace HEALTHY — FIXED
`readStatus` inspects `project.yml`, `state.yml`, and `manifest.json` only, so a
`planning/tasks.csv` that fails to parse left `status` reporting `HEALTHY` and
exiting `0` while `validate` reported `FAILED` (VLD-004) and exited `1` on the
same directory. `status` now folds the engine's document-parse errors into its
summary, so the two commands agree.

### F-20 — `init` claimed success on a refused write — FIXED
"PlanMo workspace initialized in …" printed unconditionally, before the collision
branch, so a run that wrote nothing still announced success above its exit `2`.
The message now prints only on the success path; the collision path says the
workspace already exists.

### F-21 — Manifest checksums were never verified — FIXED
Every manifest entry has carried a sha256 of its artifact since P05-03 (the
writer even comments it is "for traceability"), and nothing ever read one back —
so a hand-edited generated document passed `validate` untouched. `VLD-007`
(warning, not error: `generate` owns those files) reports the drift. User-owned
`seeded`/`user` documents are excluded, since a difference there is expected.

## 3. Verification summary

| Command | Result |
| ------- | ------ |
| `pnpm check` (build -> typecheck -> test -> lint -> format:check -> boundary-check -> check:inventory -> smoke) | PASS |
| `pnpm test` | PASS — 107 files, 1439 passed, 2 skipped |
| `pnpm e2e:lifecycle` | PASS — 21/21 checks |
| `pnpm e2e:install` | PASS — isolated tarball install, 14/14 checks |
| `pnpm check:inventory` | PASS — 13 packages |
| `npm view planmo version` / `dist-tags` | `1.14.1` / `latest: 1.14.1` |

## 4. Deferred / blocked

- **F-06 remainder** — extract the command handlers by domain (next task; see the handoff).
- **Secret scanning in CI (section 11 item 12)** — not added; GitHub's native secret
  scanning covers it and a third-party scanner was out of scope. Tracked.
- **Wizard/agent backlog** — specified in
  [`wizard-and-agent-roadmap.md`](wizard-and-agent-roadmap.md) (W-01...W-13).

## 5. Package inventory and dependency graph

13 packages, verified by `scripts/check-inventory.mjs` (which also checks declared
vs imported internal edges, entry-point validity, `files` coverage, cycles and
README agreement).

| Package | Version | Role |
| --- | --- | --- |
| `planmo` | 1.14.1 | the CLI (unscoped, owns `bin`) |
| `@planmo/shared` | 1.1.0 | shared utilities |
| `@planmo/schema` | 1.2.0 | versioned zod project model |
| `@planmo/core` | 1.0.5 | safe writer, status, paths |
| `@planmo/scanner` | 1.0.8 | repository adoption, injection isolation |
| `@planmo/packs` | 1.0.3 | declarative pack resolution |
| `@planmo/generator` | 1.4.1 | artifact generation, ownership manifest |
| `@planmo/design-engine` | 1.0.3 | DTCG tokens, styles, a11y |
| `@planmo/agent-bridge` | 1.3.4 | adapters, context bundles |
| `@planmo/ai` | 1.3.0 | model-provider abstraction |
| `@planmo/adapters` | 1.0.1 | per-agent adapters |
| `@planmo/workflow` | 1.1.5 | phases, packets, leases, gates |
| `@planmo/trace` | 1.2.2 | trace graph, validate, doctor |

Dependency direction — the enforced graph (`scripts/check-boundaries.mjs`):

```text
shared, ai         -> (leaf)
schema             -> shared
core               -> shared, schema
packs              -> core, shared, schema
generator          -> core, shared, schema, packs
scanner            -> core, shared, schema
adapters           -> core, shared
agent-bridge       -> core, shared, schema, adapters
workflow           -> core, shared, schema, agent-bridge
trace              -> core, shared, schema, workflow
design-engine      -> core, shared, schema
planmo (the CLI)   -> ai, shared, schema, core, trace, scanner, packs,
                      generator, adapters, agent-bridge, workflow
```

Acyclic; every declared internal edge is imported and every internal import is
declared (F-04).

## 6. Command inventory

Taken from the real router (`packages/planmo/src/index.ts`, `run()`), never from
the README alone.

| Command | Handler | Backing module |
| --- | --- | --- |
| `init` | `runInit` | `@planmo/core` init + `generate.ts` |
| `status` | `runStatus` | `@planmo/core` status |
| `adopt` | `runAdopt` | `detect.ts`, `adopt-write.ts` |
| `plan` | `runPlanCommand` | `plan.ts`, `plan-build.ts`, `@planmo/ai` |
| `generate` | `runGenerate` | `generate.ts` |
| `diff` | `runDiff` | `diff.ts` |
| `validate` | `runValidate` | `validate.ts` |
| `doctor` | `runDoctorCommand` | `doctor.ts` |
| `next` | `runNext` | `next.ts` |
| `task` | `runTask` | `task.ts` |
| `trace` | `runTrace` | `trace.ts` |
| `handoff` | `runHandoff` | `handoff.ts` |
| `pack` | `runPack` | `pack.ts` |
| `agent init` / `agent list` | `runAgent` | `agent.ts` |
| `agent apply` | `runAgentApply` | `apply.ts` |
| `--version` / `--help` | inline | `version.ts`, `USAGE` |

Exit contract: `0` ok · `1` error · `2` collision refused · `3` no project found
(ADR-0028).
