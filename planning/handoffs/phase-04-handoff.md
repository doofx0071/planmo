# Phase 04 Handoff

## Status
COMPLETE — Pack & profile system implemented in `@planmo/packs`, including all CHG-001 Phase 04 tasks. Hard stop before Phase 05.

## Completed tasks (9/9)
- P04-01 Declarative pack loader — DONE
- P04-02 Deterministic resolution and conflicts — DONE
- P04-03 Lockfile generation — DONE
- P04-04 Planning-depth profiles — DONE
- P04-05 Malicious/conflicting pack fixtures — DONE
- P04-06 Standards pack schema/resolution (CHG-001) — DONE
- P04-07 Engineering policy precedence (CHG-001) — DONE
- P04-08 Pack provenance metadata (CHG-001) — DONE
- P04-09 Context/memory policy declarations (CHG-001) — DONE

## Remaining / blocked
- None. No blockers. (GitHub Actions still blocked by external R-021 ghost — unchanged; local gate authoritative.)
- Explicit non-goal honored: NO memory storage engine was implemented (CHG-001 P04-09 is declarations only; storage arrives with Phase 08 memory providers).

## Material changes
- **`@planmo/packs` (NEW package)**:
  - `src/loader.ts` — `loadPack(packDir)`: strict `PackSchema` validation, sha256 integrity of raw pack.yml, fail-closed executable-construct rejection at ANY nesting depth (`scripts`/`hooks`/`exec`/`run`/`install`/`shell`/`lifecycle`/… → `PackLoadError(kind=executable)`), category-discriminated content-shape validation for standards/policy/context; non-policy categories pass through (their phases own content validation).
  - `src/resolve.ts` — `resolvePacks(catalog, requested)`: highest-valid-version pick per ref, transitive `requires` closure, three-color cycle detection, capability-conflict detection (same capability, differing integrity), Kahn topological order (ref tie-breaks), typed `ResolutionDiagnostic`s, `resolutionFingerprint` determinism proof.
  - `src/lock.ts` — `buildLockfile(result)` → strict `LockfileSchema` (ref/version/source/sha256 per pack), `lockfileFingerprint`.
  - `src/profiles.ts` — `compilePlanningProfile(depth)` / `allPlanningProfiles` / `compileAllProfiles`: lean/standard/production/high-assurance with required documents, gates, phase mode, traceability/security-review flags; `custom` → null.
  - `src/standards.ts` — `selectStandards(packs, ctx)`: appliesTo filtering (stack/domain/risk/testTypes), 7-tier precedence, scope→precedence policy mapping, same-tier duplicate-id conflicts surfaced, cross-tier deterministic shadowing.
  - `src/fixtures/` — real on-disk fixture packs: valid (stack/nextjs, standards/web-security, policy/engineering, context/agent-memory) + malicious (scripts, hooks, exec, nested scripts) + conflicting (capability-a/b, cycle-a/b, missing-dep).
  - Tests: `loader.test.ts`, `resolve.test.ts`, `lock.test.ts`, `profiles.test.ts`, `standards.test.ts`, `test-utils.ts` — 37 tests.
- **`@planmo/schema` (extended)**:
  - `src/pack-design.ts` — `PACK_CATEGORIES` 6→9 (+standards, policy, context); `PackProvenanceSchema` (source/url/author/publishedAt/license/integrity); `PackSchema.provenance` optional.
  - `src/pack-content.ts` (NEW) — `STANDARD_CLASSES` (9), `STANDARD_PRECEDENCE` (7 tiers), `StandardRuleSchema`, `StandardsPackContentSchema`, `EngineeringPolicyEntrySchema` (+scope→precedence), `EngineeringPolicyContentSchema`, `TokenBudgetSchema`, `MEMORY_SCOPES`, `ContextMemoryPolicySchema` (token budget, progressive disclosure, allowed scopes, requireProvenance, redactSecrets), `PackContentShapeSchema` (discriminated union).
  - `src/pack-content.test.ts` (NEW, 20 tests) + updated `pack-design.test.ts` (9 categories).
  - `src/index.ts` — export surface extended.
- **Adopted**: `docs/12-adrs/ADR-0018-deterministic-pack-resolution-and-locking.md`.
- **Planning**: tasks.csv P04→DONE (9); TRACKER; DECISIONS Phase 04 section; RISKS R-022 added; REQUIREMENTS-TRACEABILITY Phase 04 trace (+CHG-001 rows updated); `.planmo/state.yml` → Phase 05 planned; CHANGELOG entry; `.changeset/phase-04-pack-and-profile-system.md` (minor: schema, packs).

## Tests & evidence
| Command/Test | Result |
|---|---|
| `pnpm --filter @planmo/schema typecheck` + build | PASS, exit 0 |
| `pnpm --filter @planmo/packs typecheck` + build | PASS, exit 0 |
| `vitest run packages/packs` | PASS — 5 files, **37 tests** |
| `vitest run packages/schema` | PASS — 7 files, **85 tests** |
| `pnpm check` (full gate) | PASS, exit 0 — **188 tests** (was 131), boundaries OK, smoke `planmo 0.0.0` |
| E2E engine proof (dist): load 3 fixtures → resolve → lock | PASS — deterministic fingerprint equal on repeat; lock entries 2, integrity sha256; standards selected 2, conflicts 0; high-assurance profile 11 gates |
| E2E conflict + malicious proof | PASS — `capability "stack.web" provided by multiple distinct packs: conflicting/a@1.0.0, conflicting/b@1.0.0`; `PackLoadError` for scripts-bearing pack |
| Exit gates (phase-04.md) | ALL green: deterministic resolution ✓ (fingerprint), actionable conflict diagnostics ✓, versions/checksums locked ✓ (lockfile), v1 declarative non-executable ✓ (loader), profiles compile predictably ✓ |
| GitHub Actions CI | BLOCKED (R-021 ghost, unchanged) |

## Security / reliability findings
- Executable rejection is fail-closed and depth-independent: a `hooks` key nested 3 levels deep in content is caught (`malicious/scripts-nested` fixture asserts `kind==='executable'`).
- Capability conflicts compare integrity digests: two packs providing the same capability with IDENTICAL content do NOT conflict (dedupe-friendly), differing content DOES (tested both ways).
- Version selection validates SemVer before comparing — non-SemVer duplicates produce a diagnostic, never an arbitrary winner.
- Resolver `ok=false` for any of: cycle, capability-conflict, unknown-ref, missing-requires — callers cannot silently consume a broken resolution.
- No secrets in fixtures; all fixture content synthetic.

## Decisions / ADRs
- ADR-0018 (new): deterministic resolution, surfaced conflicts, lockfile with sha256, fail-closed executable rejection, strict category-discriminated policy content, precedence shadowing rules.
- DECISIONS.md Phase 04 section records: determinism contract, conflict-surfacing policy, lockfile semantics, no-memory-storage stance, profile compilation contract.
- No support-matrix changes (agents/styles untouched by this phase).

## Git
- Branch: `feat/phase-04-pack-and-profile-system` (GitHub Flow; PR to `main`).
- Planned commits: focused Conventional Commits (schema + fixtures, packs package + tests, ADR + docs, planning close-out, changeset).
- PR: created after this handoff; CI will still hit the R-021 ghost.

## Known debt / next-phase notes
- The `@planmo/packs` API is engine-level; CLI wiring (`planmo packs resolve`, `planmo packs lock`) is left to a consumer phase (workflow engine, Phase 08) — no CLI task existed in Phase 04 scope, and the CLI command surface is Phase 08's `planmo next`/pack consumption.
- `resolvePacks` closure walks `requires` as exact pack refs; capability-based `requires` (request by capability) is a natural Phase 05/11 extension — the capability map is already exposed via diagnostics.
- Non-policy category contents (stack/domain/risk/design/agent/workflow) are validated only against the strict pack envelope + executable scan; their phase-specific content schemas land with their owning phases (design packs Phase 07, etc.).
- `buildLockfile` pins `planmoVersion: 0.0.0` — wire the real version at first-release time (Phase 12 / publish).
- Windows junction tests remain the pattern for symlink-like behavior; pack loader uses plain fs reads (no symlink surface yet — remote pack fetch in Phase 11 must add integrity verification).
- The resolver holds the whole catalog in memory — fine for v1 local packs; remote catalogs (Phase 11) will need streaming/bounded retrieval.

## Next phase
- Phase: **05 — Compiler & generator** (prompts/06-phase-05-planning-compiler-and-artifact-generator.md, planning/phases/phase-05.md incl. CHG-001 addendum: ownership classes generated/merged/seeded/user, lineage, upgrade preview, standards/context artifact generation).
- Read first: the phase prompt/plan, ADR-0018, `docs/15-change-governance/managed-file-ownership.md`, this handoff, `packages/packs/src/*` API surface, current Git state.
- Preconditions: `@planmo/packs` resolver/lockfile/profile APIs are the consumption surface the compiler will build on.
- Instructions: run repo commands with Node 24 on PATH; keep `.gitattributes`; follow the `plan()`-pure / `apply()`-atomic writer contract; validate every emitted document against its schema before writing; HARD STOP after Phase 05.