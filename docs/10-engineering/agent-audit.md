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
| F-06 | P2 | F | PARTIAL | CLI entry point oversized (1213 lines) |
| F-07 | P1 | G | VERIFIED | Security / filesystem protections present and retained |
| F-08 | P1 | — | FIXED | Doctor tests were host-Node-dependent (red on Node >= 25) |
| F-09 | P2 | — | FIXED | `format:check` failed on an untracked working file |
| F-10 | P2 | — | FIXED | `planmo task <id>` hung forever when stdin is not a TTY |
| F-11 | P3 | — | NOT REPRODUCED | Suspected missing README in published tarballs |
| F-12 | P1 | — | FIXED | No isolated-install or lifecycle e2e in the gate |
| F-13 | P2 | B | FIXED | Stale "not CLI-wired" claims in testing/pilot docs |
| F-14 | P1 | D | NOT A DEFECT | Reported version mismatch (repo vs third-party index) |

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

### F-06 — Oversized CLI entry (Lead F) — PARTIAL (staged)
`packages/planmo/src/index.ts` was 1213 lines mixing the router, handlers, arg
parsing, the wizard and output formatting. Stage 6 extracted the I/O + prompt layer
into `packages/planmo/src/cli-io.ts` (108 lines), leaving 1117. Remaining stages
(handlers by domain) are the next task in the handoff.

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
Local source `planmo@1.14.0`; official npm `latest` = `1.14.1` (published
2026-10-10T16:43Z), one release ahead of this checkout. The "1.7.0" figure came from
a third-party index and is contradicted by the registry. No version changed.

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
