# Phase 12 Handoff — Hardening, pilot & v1

**Status:** COMPLETE — 2026-09-22 (roadmap final phase)
**PR:** #14 `feat/phase-12-hardening-pilot-and-v1`
**Go/No-Go verdict:** CONDITIONAL GO — `planning/go-no-go-phase12.md` (publish remains a
maintainer step: license + npm credentials + `changeset version`/publish)

## Completed task IDs (all 11 DONE, zero blockers)

- P12-01 Security review & threat-model validation (critical) — `docs/08-security/threat-model-validation-phase12.md`
- P12-02 Property/fuzz tests on high-risk parsers (critical) — 6 suites: `property-fuzz-{paths,loader,resolve,versioning,tokens,ir}.test.ts`
- P12-03 Cross-platform E2E matrix (critical) — CI ubuntu/macos/windows × node 24 ALL GREEN (PR #14); R-021 resolved
- P12-04 Validate upgrades/migrations (high) — `packages/schema/src/upgrade-migration-e2e.test.ts` (24 tests)
- P12-05 Pilot PlanMo on representative projects (critical) — `scripts/e2e-phase12-pilots.mjs`, 8 pilots, 63/63 checks
- P12-06 Publish docs/examples/package RC (high) — `docs/03-cli/examples.md`, `docs/10-engineering/pilots.md`, release-gates evidence, `.changeset/phase-12-release-candidate.md`; actual npm publish deferred to maintainer (go/no-go)
- P12-07 1.0 go/no-go review (critical) — `planning/go-no-go-phase12.md` — CONDITIONAL GO
- P12-08 Context retrieval evaluation (CHG-001) — `context-retrieval-eval.test.ts` + `scripts/eval-context-retrieval.mjs` (8 scenarios)
- P12-09 Token budget benchmark (CHG-001) — `scripts/eval-token-budget.mjs` (4 strategies)
- P12-10 Memory poisoning/staleness/security tests (CHG-001) — `memory-poisoning-staleness.test.ts`
- P12-11 Index corruption/rebuild tests (CHG-001) — `memory-corruption-rebuild.test.ts` (agent-bridge) + `packages/scanner/src/context/index-corruption-rebuild.test.ts` (scanner; boundary-graph clean)

Blockers: none. Optional addendum items evaluated: semantic adapter eval — NOT
shipped (deliberate; v1 lexical baseline per ADR-0014, quantified blind-spot in
P12-08 control scenario-08); trust metadata pilot — folded into P12-01 threat-model
validation + P12-11 corruption tests (trust classification re-exercised, no gap).

## Files / packages materially changed

**New tests (packages):**
- `packages/core/src/property-fuzz-paths.test.ts` — seeded-PRNG traversal/containment properties
- `packages/packs/src/property-fuzz-loader.test.ts` — executable-key rejection at depth
- `packages/packs/src/property-fuzz-resolve.test.ts` — permutation-stable resolution (200 seeds)
- `packages/schema/src/property-fuzz-versioning.test.ts` — version parse/migration properties
- `packages/design-engine/src/property-fuzz-tokens.test.ts` — token alias-graph properties (200 seeds)
- `packages/generator/src/property-fuzz-ir.test.ts` — IR compile determinism/no-crash on random input
- `packages/schema/src/upgrade-migration-e2e.test.ts` — 24 tests: v0→v1 migration chains, v1-only kinds, future-version rejection, downgrade policy
- `packages/agent-bridge/src/context-retrieval-eval.test.ts` — 8-scenario retrieval eval (recall/precision/required/stale)
- `packages/agent-bridge/src/memory-poisoning-staleness.test.ts` — injection/secret/stale/forged-provenance
- `packages/agent-bridge/src/memory-corruption-rebuild.test.ts` — validate/doctor/rebuild corruption semantics (moved here from scanner per boundary graph: scanner must NOT import agent-bridge)
- `packages/scanner/src/context/index-corruption-rebuild.test.ts` — pure scanner context engines on garbage/truncated input

**New scripts:**
- `scripts/e2e-phase12-pilots.mjs` — real-CLI pilot runner (8 pilots, 63/63)
- `scripts/eval-context-retrieval.mjs` — deterministic retrieval eval harness (exit-code gate)
- `scripts/eval-token-budget.mjs` — deterministic token benchmark (exit-code gate)

**New/changed docs/planning:**
- `docs/08-security/threat-model-validation-phase12.md` (NEW), `docs/10-engineering/pilots.md` (NEW),
  `docs/03-cli/examples.md` (NEW), `docs/09-testing/{property-and-fuzz,release-test-gates}.md`,
  `docs/14-context-memory/evaluation.md`, `docs/16-evals-trust/trust-engine-future.md`,
  `.changeset/phase-12-release-candidate.md` (NEW),
  `planning/{TRACKER,tasks.csv,DECISIONS,RISKS,OPEN-QUESTIONS,REQUIREMENTS-TRACEABILITY,go-no-go-phase12,WORKER-BRIEF-phase-12}.md`,
  `.planmo/state.yml` (completed), `MANIFEST.md` (regen), `CHANGELOG.md`
- Fix leaked from Phase 11: `.changeset/phase-11-ecosystem-and-integrations.md` prettier formatting (8d0c71d) — this was also the real cause of the Phase 11 CI failures

## Commands executed / results

- `pnpm check` (FULL GATE) — **exit 0: 78 test files, 1043 tests passed** (132 new; was 911), eslint clean, prettier clean, boundary-check OK, `planmo 0.0.0` smoke
- `node scripts/e2e-phase12-pilots.mjs` — **63/63 checks PASS** on the real built CLI
- `node scripts/eval-context-retrieval.mjs` — **PASS** (recall/precision 1.0, 8/8 required, 8/8 stale-exclusion, blind-spot control quantified)
- `node scripts/eval-token-budget.mjs` — **PASS** (full 4496 → repo-map+lexical 1328 = 30% w/ invariants; repo-map-only flagged unsafe)
- All legacy E2E suites `scripts/e2e-phase05..11.mjs` — exit 0 each
- `pnpm audit --prod` — no known vulnerabilities; secret-pattern grep over tracked files — clean
- GitHub Actions PR #14 — ubuntu/macos/windows × node 24 **success on final commits** (ubuntu 35s, macos 30s, windows 1m39s)

## Security / reliability findings

- No dangerous APIs in `packages/*/src` (child_process/exec/spawn/eval/new Function) — sweep verified; fs funnels through `@planmo/core` writer + scanner `node-reader` only.
- All 12 threat-model entries (T-001..T-012) validated to negative-test evidence; no new critical findings; R-021 (CI ghost) closed as resolved.
- P12-11 corruption semantics: validate path throws deterministic descriptive errors; doctor path never fabricates/crashes; corrupt store rebuilds from canonical bytes.
- P12-10: memory poisoning fixtures assert no instruction-authority inversion; secret-like strings never become durable rows; stale/superseded rows excluded from retrieval.
- Boundary graph enforced during integration: memory corruption tests moved from `@planmo/scanner` to `@planmo/agent-bridge` (scanner→agent-bridge edge is forbidden and was flagged by Worker B; no package.json or boundary-graph change was needed).
- **Cross-platform bug found by the CI matrix**: `property-fuzz-paths.test.ts` compared against a non-canonical mkdtemp root — Windows runner 8.3 short names (`RUNNERAD~1`) and macOS `/var → /private/var` aliasing failed two in-root assertions on macos/windows only. Fixed by realpath-ing the temp root (ca83019) — exactly the class of bug the supported-OS matrix exists to catch.

## Decisions / traceability

- Go/no-go CONDITIONAL GO recorded; license recommendation MIT confirmed pending maintainer approval (OPEN-QUESTIONS #2 updated).
- REQ-EVAL-001..003 and REQ-MEM-001..010 evidence rows updated in REQUIREMENTS-TRACEABILITY.md; R-CTX-05/R-CTX-08/R-021 mitigation columns updated.
- CHANGELOG Phase 12 entry; changeset `phase-12-release-candidate.md` (schema/core/scanner/cli minor bumps — RC scope).
- No new ADR needed: Phase 12 is evidence-only, no behavioural/architectural change.

## Git

- Branch `feat/phase-12-hardening-pilot-and-v1` from main (c1058d5); commits: prettier fix (8d0c71d) → contract freeze (187f7d4, tasks IN_PROGRESS + worker brief) → implementation + close-out (9e473b5) → cross-platform fuzz fix (ca83019). PR #14 open; worker-branches `worker-{a,b,c}/phase-12` deleted and worktrees removed after integration.
- **Remember the harness quirk:** after spawning workers, the lead terminal CWD moves into a child worktree — always pass explicit `workdir`/`cd` on lead commands.

## Known debt / next steps

- v1 CLI surface is narrow (init/status/adopt + version/help) — `planmo plan/generate/next` are engine-verified but not CLI-wired; `v1-surface-honesty` pilot asserts this. Post-v1 backlog.
- Repo-map-only context tier drops a security excerpt (token benchmark finding) — flat out unsafe standalone; v1 default is repo-map + lexical memory.
- Semantic retrieval optional (quantified blind-spot baseline exists for future adapters).
- Publish path (maintainer): approve MIT (or Apache-2.0), add LICENSE + SPDX + trademark note in CONTRIBUTING, npm org credentials, `pnpm changeset version && pnpm publish` with PR #14 merged and CI green.

## Next phase (exact)

**None.** PlanMo roadmap is complete through Phase 12. Remaining work is the
maintainer release step (go/no-go checklist, `planning/go-no-go-phase12.md`),
not a roadmap phase. HARD STOP honoured — no further phase started this session.

## Instructions for the next fresh session (maintainer release)

1. Verify PR #14 merged to `main` and CI green; fetch/pull.
2. Run `export PATH="/c/Users/Damascus/AppData/Local/Programs/node-v24.11.0-win-x64:$PATH" && pnpm check` (authoritative local gate — expect 1043 tests exit 0).
3. Decide license (recommended MIT per `planning/go-no-go-phase12.md`); add LICENSE, SPDX identifiers, trademark note in CONTRIBUTING.md; set `license` in root package.json.
4. `pnpm changeset version` (drafts 1.0.0) → review changelog → `pnpm publish` (or `npm publish --dry-run` first), commit version bumps.
5. No further roadmap phase exists; do not invent one.