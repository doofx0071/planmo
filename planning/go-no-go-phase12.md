# Phase 12 — 1.0 Go/No-Go Review (P12-07)

Date: 2026-09-22 · Lead-conducted on `feat/phase-12-hardening-pilot-and-v1` (PR #14).
Sources: `docs/10-engineering/versioning-and-releases.md` (`1.0.0` requires stable
schema migration policy, safe manifest ownership, tested upgrade path,
cross-platform validation, security review, pilot evidence),
`docs/09-testing/release-test-gates.md`, `planning/OPEN-QUESTIONS.md` (license #2).

## Release checklist vs evidence

| Gate | Evidence | Verdict |
|---|---|---|
| Stable schema migration policy | `packages/schema/src/upgrade-migration-e2e.test.ts` (24 tests): every chain-covered legacy fixture (project/state/handoff v0 → v1) migrates strict-parse + round-trip + `extensions` preservation; v1-only kinds parse; future/unknown versions rejected; downgrade policy recorded (upgrade-only; v0↔v1 additive and pure) | PASS |
| Safe manifest ownership | `writer.ts` ownership classes + `manifest.json` lineage; pilot 3 collision → exit 2 + `--force`; adopt dry-run confined to `.planmo/adopt/` with `rewritesApplicationCode: false` | PASS |
| Tested upgrade path | `upgrade-migration-e2e.test.ts` + schema-versioning fixture suite (pre-Phase 11 lockfiles, legacy ownership aliases parse) | PASS |
| Cross-platform validation | GitHub Actions matrix ubuntu/macos/windows × node 24 **all green** on PR #14 (R-021 re-verified as resolved — prior failures were a prettier leak, fixed in 8d0c71d) | PASS |
| Security review | `docs/08-security/threat-model-validation-phase12.md`: dangerous-API sweep clean (no shell/child_process/eval in src), fs access funneled through writer/node-reader, all T-001..T-012 controls mapped to negative tests, `pnpm audit --prod` = no known vulnerabilities, secret-pattern grep clean | PASS |
| Pilot evidence | `scripts/e2e-phase12-pilots.mjs` 63/63 checks on the real built CLI (8 pilots: greenfield init, dry-run, collision, no-project, brownfield adopt on hostile fixture, high-assurance, v1 surface honesty, version/help) | PASS |
| Docs sufficient for new user | `docs/03-cli/examples.md` (new-user walkthrough), `docs/10-engineering/pilots.md` (real output summaries) | PASS |
| Property/fuzz on parsers | 6 property suites (paths, loader, resolve, versioning, tokens, IR) — 132 new tests total this phase, 1043 passing in full gate | PASS |
| Evals (CHG-001) | `scripts/eval-context-retrieval.mjs` (8 scenarios, recall/precision 1.0, 8/8 required-fact, 8/8 stale-exclusion; provider blind-spot quantified), `scripts/eval-token-budget.mjs` (full 4496 tokens vs repo-map+lexical 1328 at 30% with invariants retained) | PASS |
| Memory poisoning/staleness/security | `memory-poisoning-staleness.test.ts`, `memory-corruption-rebuild.test.ts` (agent-bridge), scanner index-corruption tests — no fabrication, no crash, deterministic | PASS |

## Findings

1. **V1 CLI surface is narrower than the docs claimed** — `planmo plan`,
   `planmo generate`, `planmo next` exit 1 (unknown command in v1). The pilot
   suite asserts this honestly (`v1-surface-honesty` pilot); `docs/03-cli`
   now describes the real surface (init/status/adopt + version/help).
2. **R-021 (GitHub Actions ghost) is resolved** — workflow_dispatch and PR
   runs execute the full matrix; the Phase 11 "failures" were the changeset
   prettier leak (8d0c71d), not ghost interception. CI is now a live gate.
3. **Repo-map-only context drops a security invariant** (token benchmark
   tier 2) — documented; do not use alone. The recommended v1 tier is
   repo-map + lexical memory (30% of full context, invariants retained).
4. **Provider retrieval blind-spot quantified** — the deterministic v1
   provider ranks by id order, not query relevance (scenario-08: recall 0);
   acceptable for v1 lexical baseline, reserved for semantic adapters later.

## License

Default recommendation **MIT** was pre-locked (P00-05 / OPEN-QUESTIONS #2,
`docs/11-research/licensing.md`). Selection is a maintainer decision at the
1.0 publish step; repository stays private/UNLICENSED until then. This phase
does NOT publish to npm — the RC is prepared but release approval is gated on
this review + maintainer sign-off.

## Verdict

**CONDITIONAL GO for 1.0 readiness** — every technical gate passes with real
evidence (1043 tests, 63/63 pilots, 7/7 E2E suites, CI matrix green). The
publish action remains a maintainer step: (1) approve MIT license (or
Apache-2.0), (2) add LICENSE + SPDX + trademark note in CONTRIBUTING, (3)
create npm org/package credentials, (4) run `pnpm changeset version` +
`pnpm publish` with the CI gate green. No unresolved critical security
finding; no blocking technical debt.