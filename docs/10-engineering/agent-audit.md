# PlanMo — Repository Audit and Reliability Fixes

Status: **PASS 1 COMPLETE — baseline established, confirmed defects fixed, gate green.**
Date: 2026-10-12 · Baseline commit: `0de291d` (`fix: stop regeneration from discarding
recorded evidence (#81)`) · Environment: Windows 11, git-bash, Node 26.7.0 (test runner),
pnpm 10.33.0.

Scope: verify the leads below against the code, fix confirmed correctness/reliability
defects with regression tests, synchronise documentation with real behaviour, and record
the rest as tracked follow-ups. No speculative rewrite; no publication; no push to `main`.

## 1. Baseline gate (before any change)

`pnpm check` = build → typecheck → test → lint → format:check → boundary-check → smoke.

| Step            | Result | Evidence |
| --------------- | ------ | -------- |
| build           | PASS   | 13 packages compiled with `tsc` |
| typecheck       | PASS   | exit 0 |
| test            | **FAIL** | `4 failed \| 1432 passed \| 2 skipped (1438)`, all in `packages/planmo/src/doctor.test.ts` |
| lint            | PASS   | `eslint .` exit 0 |
| format:check    | **FAIL** | `PLANMO_AGENT_FIX_PROMPT.md` (an untracked working file at the repo root) |
| boundary-check  | PASS   | `package boundaries: OK` |
| smoke           | PASS   | `planmo 1.14.0` |

Two red steps, both real and both fixable — see FIX-1 and FIX-2.

## 2. Findings

Severity: P0 correctness/safety · P1 reliability/contract · P2 maintainability.

| ID | Sev | Lead | Verdict | Evidence |
| -- | --- | ---- | ------- | -------- |
| F-1 | P1 | A — state/evidence durability | **ALREADY FIXED** | `planmo task` records status in `.planmo/state.yml` (`packages/planmo/src/task.ts:107`), `generate` merges it (`generate.ts:72` → `ir.taskStatus` → `render.ts:193`); regression tests exist (`generate.test.ts:83` "preserves recorded evidence across a regeneration", `task.test.ts`). Landed in #79/#81. |
| F-2 | P1 | B — README/CLI inventory drift | **CONFIRMED → FIXED** | README "What v1 ships" claimed the CLI was `init`/`status`/`adopt` only, while `packages/planmo/src/index.ts:306-333` wires 14 commands. `ROADMAP.md`, `docs/03-cli/command-surface.md`, `docs/03-cli/examples.md`, `docs/09-testing/release-test-gates.md` and `docs/10-engineering/pilots.md` carried the same stale claim. |
| F-3 | P1 | C — package inventory gap | **CONFIRMED → FIXED** | README's package table listed 12 packages and omitted `@planmo/ai`; `packages/` holds 13 (`@planmo/ai@1.3.0` exists and is a declared dependency of the CLI, `packages/planmo/package.json:49`). README said "All twelve packages". |
| F-4 | P1 | E — misleading exit code | **CONFIRMED → FIXED** | `runGenerate`/`runDiff`/`runValidate`/`runDoctorCommand` returned a bare `3` on **any** error (`index.ts:361,378,402,417`), while the documented contract is `3` = *no project found* and every other handler maps `ProjectNotFoundError ? 3 : 1`. A broken workspace was indistinguishable from a missing one. |
| F-5 | P1 | — environment-dependent tests | **CONFIRMED → FIXED** | The four failing tests assert `doctor: OK` while `runDoctor` read the host's `process.version` (`doctor.ts:105`). The project permits any Node ≥ 24, and DOC-002 warns on an ahead-of-LTS major, so the suite is red on Node ≥ 25 and green only on the CI's 24.x. Non-hermetic test, not a product bug. |
| F-6 | P2 | F — oversized CLI entry | **CONFIRMED (deferred)** | `packages/planmo/src/index.ts` is 1211 lines / 47 KB and mixes the router, per-command handlers, argument parsing, the wizard and output formatting. Stage 6 refactor is deferred (see §5). |
| F-7 | P1 | D — version discrepancy | **NOT A DEFECT** | Local source `planmo@1.14.0`; official npm `latest` = `1.14.1` (published 2026-10-10T16:43Z). The "1.7.0" figure was a stale third-party index, contradicted by the registry. One-behind is normal unreleased development; no version was changed. |
| F-8 | P1 | G — security/fs protections | **VERIFIED PRESENT** | Safe writer + `PathTraversalError`/`UnsafeSymlinkError` (`packages/core/src/paths.ts`), prompt-injection isolation in `@planmo/scanner`, dry-run/diff before writes, ownership manifest. Retained unchanged. |

## 3. Changes made

- **FIX-1 (F-5)** — `packages/planmo/src/doctor.ts`: added an optional `nodeVersion` to
  `DoctorOptions` (defaults to the running Node) so the version band is testable
  deterministically. `packages/planmo/src/doctor.test.ts`: the "ok" tests pin a supported
  version; a new test asserts an injected version is judged, not the host's; the CLI test
  asserts the host-independent contract. Changeset: `.changeset/doctor-node-band-injectable.md`.
- **FIX-2** — `.prettierignore`: ignore the untracked `PLANMO_AGENT_FIX_PROMPT.md` working
  file so `format:check` reflects repository content.
- **FIX-3 (F-4)** — `packages/planmo/src/index.ts`: `generate`/`diff`/`validate`/`doctor`
  now map `ProjectNotFoundError → 3`, anything else `→ 1`, matching the documented contract
  and the rest of the CLI. Regression test added in `index.test.ts`.
- **FIX-4 (F-2, F-3)** — documentation synchronised with real behaviour: `README.md`
  (command table, "What v1 ships", package table + `@planmo/ai`, package count), `ROADMAP.md`,
  `docs/03-cli/command-surface.md`, `docs/03-cli/examples.md`, `docs/03-cli/exit-codes.md`
  (shipped 0/1/2/3 contract, with the reserved band marked unimplemented),
  `docs/09-testing/release-test-gates.md`, `docs/10-engineering/pilots.md`.

## 4. Verification

- `pnpm check` (build → typecheck → test → lint → format:check → boundary-check → smoke)
  run on the branch — see the completion report for the exact result.
- New/changed tests: doctor injection (2), generate exit-code mapping (1).

## 5. Remaining work (tracked)

- **P2 — CLI refactor (Stage 6).** Split `index.ts` (1211 lines) into router, per-domain
  handlers, wizard, and shared output/error formatting — behaviour-preserving, one boundary
  at a time, characterization tests first. Deferred so it cannot delay the reliability fixes.
- **P1 — real-install smoke (Stage 3).** Pack every `@planmo/*` package and install `planmo`
  in a clean fixture **from tarballs** (not workspace symlinks), then run `--version`,
  `status`, `doctor`. Not yet done in this pass.
- **P1 — full lifecycle e2e (Stage 4).** `scripts/e2e-cli-generate.mjs`, `e2e-phase08.mjs`
  and `e2e-phase12-pilots.mjs` cover much of this; a single end-to-end script that also
  proves task status/evidence survive regeneration would close it.
- **P3 — wizard roadmap (Stage 7).** Specified in the prompt; no reliability impact.
