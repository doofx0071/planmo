# Phase 12 Security Review & Threat-Model Validation (P12-01)

Date: 2026-09-22. Lead-conducted on branch `feat/phase-12-hardening-pilot-and-v1`
(PR #14). Method: source sweep for dangerous APIs, filesystem write-surface
audit, dependency audit, secret scan, and per-threat control validation against
the Phase 12 baseline (`pnpm check` exit 0, 911 tests).

## 1. Dangerous API sweep (all packages/src, non-test)

Searched for `child_process`, `execSync`, `spawn(`, `eval(`, `new Function`,
shell interpolation (`shell:`, backtick-template exec). Result: **no matches**.
All `exec(` hits are regex `.exec()` on trusted patterns (memory-portable
markdown bullets, token alias refs, symbol-index import parsing,
prompt-isolation regex loop, trace debt/doctor version parsing). No arbitrary
code execution surface exists in v1. Control T-004 (declarative packs, no
hooks) holds at the process level.

## 2. Filesystem write surface

Only modules importing `node:fs*` in non-test source: `core/writer.ts`,
`core/paths.ts`, `core/status.ts`, `generator/compile.ts`, `packs/loader.ts`,
`scanner/contracts.ts`, `scanner/index.ts`, `scanner/scan/node-reader.ts`,
`cli/index.ts`, plus shared test-utils. Key facts:

- `writer.ts` is the ONLY writer: atomic temp+rename, sha256 checksums, unified
  diff, refuse-unmanaged-overwrite (T-006) — confirmed by reading imports
  (`mkdir/readFile/rename/rm/writeFile` via path-normalized targets).
- `cli/index.ts` uses `readFileSync` only (manifest/package reads, no writes).
- `scanner/scan/node-reader.ts` is the ONLY fs reader in @planmo/scanner; uses
  `lstat` (symlink never implicitly followed), rejects binary (NUL) content,
  exposes `linkTarget` for escape analysis (T-002/T-003).
- No module writes generated project artifacts outside the writer abstraction —
  matches `docs/08-security/secure-filesystem.md`.

## 3. Dependency audit

- `pnpm audit --prod`: **No known vulnerabilities found** (2026-09-22).
- Runtime dependency surface is minimal (zero-dependency core per ADR-0010).

## 4. Secret scan

- `git grep` for `ghp_/sk-/AKIA/private-key` patterns across tracked files,
  excluding fixture/test files: **no matches** (fixtures use synthetic values
  per docs/08-security/secrets-and-privacy.md).

## 5. Per-threat control validation (docs/08-security/threat-model.md)

| Threat | Control evidence | Status |
|---|---|---|
| T-001 Path traversal | paths.test.ts 19 tests / 15 negative indicators (resolveInsideRoot/realpathWithinRoot) | VALIDATED |
| T-002 Symlink escape | node-reader lstat + linkTarget; paths negative tests; scanner safe-scanner 36 tests/37 neg | VALIDATED |
| T-003 Repo prompt injection | prompt-isolation.ts 17 tests/10 neg; poisoning fixtures (P10-11); memory enters via data-only channels | VALIDATED |
| T-004 Pack arbitrary execution | loader.ts executable-key rejection at any depth (11 tests/11 neg); zero process API in src | VALIDATED |
| T-005 AI config injection | agent-bridge proposal schema validation (schema/agent-bridge.test.ts 9 tests); generator wireguard IR | VALIDATED |
| T-006 Silent overwrite | writer.test.ts 10 tests/11 neg (collision refusal, dry-run, diff, TOCTOU) | VALIDATED |
| T-007 Remote supply-chain | trust.test.ts 14, install.test.ts 14/8 neg (tamper detect, reversible plans, sha256 per entry, ADR-0025) | VALIDATED |
| T-008 Shell injection | zero child_process/shell interpolation in src (Section 1) | VALIDATED |
| T-009 Secret leakage | no raw-content telemetry by default; secret scan clean; provider privacy doc requirement tracked | VALIDATED (policy+scan) |
| T-010 State corruption | schema strict versioned Zod + migrations + doctor/trace validation (P09) | VALIDATED |
| T-011 Cross-project cache contamination | project-scoped context/memory; cross-project ID filtering covered by P12-10 tests (Worker B) | VALIDATED (with P12-10) |
| T-012 Malicious UI registry | shadcn registry adapter tests 8/3 neg + trust metadata levels; high-assurance approval path | VALIDATED |

## 6. Findings

- No unresolved critical security finding. All 12 priority threats have live
  controls with negative tests; no new executable surface introduced this
  phase (all Phase 12 work is tests/evals/docs/migrations).
- R-021 re-verified: GitHub Actions runs execute normally (PR #14 matrix);
  R-021 mitigation column updated — ghost-registration interception is no
  longer observed; format leak from Phase 11 changeset fixed (8d0c71d).
- Follow-ups (non-critical, post-v1): direct-provider privacy documentation
  before any private-provider release (T-009); Sigstore/OSV signing for
  `verified-source` (ADR-0025 future work).

## 7. Evidence files

- `docs/08-security/threat-model.md` (unchanged — controls validated, not
  rewritten)
- This review: `docs/08-security/threat-model-validation-phase12.md`