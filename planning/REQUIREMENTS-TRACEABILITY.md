# Requirements Traceability

Model:
`Requirement -> Decision/Risk/Threat -> Control -> Task -> Test -> PR -> Release`

Requirement families:
- `REQ-CLI-*`
- `REQ-MODEL-*`
- `REQ-PACK-*`
- `REQ-GEN-*`
- `REQ-AGENT-*`
- `REQ-DESIGN-*`
- `REQ-WORKFLOW-*`
- `REQ-TRACE-*`
- `REQ-ADOPT-*`
- `REQ-SEC-*`
- `REQ-OPS-*`
- `REQ-STD-*` (CHG-001 — structured engineering standards; REQ-STD-001..004)
- `REQ-QLT-*` (CHG-001 — maintainability/refactoring/debt/quality diagnostics; REQ-QLT-001..004)
- `REQ-CTX-*` (CHG-001 — context bundles/repo map/token budget/disclosure/portability; REQ-CTX-001..005)
- `REQ-MEM-*` (CHG-001 — memory authority/types/provenance/validity/scoping/local-first/rebuildability/secrets/pruning/poisoning; REQ-MEM-001..010)
- `REQ-CHG-*` (CHG-001 — change packages/deltas/impact/apply-archive; REQ-CHG-001..004)
- `REQ-SYN-*` (CHG-001 — ownership classes/lineage/upgrade preview; REQ-SYN-001..003)
- `REQ-WRK-*` (CHG-001 — task graph/claims/execution packets; REQ-WRK-001..003)
- `REQ-ARCH-*` (CHG-001 — fitness rules/cycle-orphan diagnostics; REQ-ARCH-001..002)
- `REQ-EVAL-*` (CHG-001 — golden scenarios/ai rubric/token benchmark; REQ-EVAL-001..003)
- `REQ-TRUST-*` (CHG-001 — pack provenance/no implicit execution/future sbom-signature; REQ-TRUST-001..003)

Example:
`REQ-GEN-004 No silent overwrite -> R-007 -> ownership/dry-run -> P03/P05 -> filesystem/generator tests -> PR -> release`

## Phase 00 trace

| Requirement family | Decision/artifact | Task | Test/evidence |
|---|---|---|---|
| Product positioning / non-goals | README, `docs/01-product/`, `planning/DECISIONS.md` | P00-01 | Consistency review 2026-09-19 |
| Naming / distribution | ADR-0007, `docs/11-research/naming-and-availability.md` | P00-02 | npm registry + GitHub verification 2026-09-19 |
| Support matrix (REQ-AGENT-001/002, REQ-DESIGN-003) | ADR-0008, `docs/11-research/support-matrix.md` | P00-03 | Official-source verification 2026-09-19 |
| Research baseline | `docs/11-research/2026-source-notes.md` | P00-04 | registry/nodejs.org/designtokens.org lookups 2026-09-19 |
| Licensing criteria | `docs/11-research/licensing.md` | P00-05 | Criteria review; final license deferred to Phase 12 |

## Phase 03 trace

| Requirement family | Decision/artifact | Task | Test/evidence |
|---|---|---|---|
| Safe path utilities (REQ-SEC-*, R-005) | `resolveInsideRoot`, `ensureNoSymlinkEscape`, `realpathWithinRoot`, `findProjectRoot` (`packages/core/src/paths.ts`, `errors.ts`) | P03-01 | 20 unit + negative tests: `..`/absolute/traversal rejection, sibling-root prefix attack, symlink-escape junctions on Windows |
| Managed writer (secure-filesystem.md, R-007) | `ManagedWriter`/`writeManaged`: root containment, symlink guards, collision refusal, atomic temp+rename, sha256, dry-run, unified diff, TOCTOU re-check (`writer.ts`, `diff.ts`) | P03-02 | 15 tests incl. dry-run purity (zero fs side effects), no temp leftovers, apply-time collision guard |
| `planmo init` wizard (REQ-INIT-*) | `initWorkspace` produces schema-valid project/state/manifest via writer; CLI wizard with `--yes`/`--dry-run`/`--force` and enums (ADR-0010) | P03-03 | 14 tests (docs default to basename, option honouring, invalid option rejected, dry-run, collision exit 2, force overwrite, prompt flow) |
| `planmo status` | `readStatus` read-only validation of all canonical docs, never writes (`status.ts`) | P03-04 | 6 tests incl. walk-up root discovery, missing/invalid docs, mtime/content unchanged after status |
| Collision/symlink/path traversal suite (R-005, R-007) | negative + security fixtures in `paths.test.ts`/`writer.test.ts`, junction-based on Windows | P03-05 | covered above; exit-code contract (0 ok · 1 error · 2 collision · 3 not found) tested via CLI |
| Deterministic diff | zero-dep LCS `unifiedDiff` (`diff.ts`) | P03-02 | 6 diff tests; deterministic output, empty diff for identical content |

## Phase 05 trace

| Requirement family | Decision/artifact | Task | Test/evidence |
|---|---|---|---|
| Byte-stable generation | ADR-0019, `@planmo/generator` IR (`ir.ts`, P05-01) | P05-01 | canonical-JSON sha256 over sorted inputs; 24 IR tests incl. input-order independence; golden snapshots |
| Plan document renderers | `render.ts` (ROADMAP/TRACKER/phases/handoff template) | P05-02 | 12 renderer tests; depth pruning lean→4 phases; byte-stability + hash-change sensitivity |
| Generation manifest + checksums | `manifest.ts` (sha256 per artifact, path-sorted) | P05-03 | 17 tests: known sha256 vectors, lineage markers, schema round-trip, negative cases |
| Golden repos (low/med/high) | `src/golden/{low,medium,high}/` — 48 committed snapshots | P05-04 | golden tests byte-compare real pipeline output (low 11, medium 15, high 22 artifacts) |
| Idempotent regeneration | `compile.ts` + `idempotency.test.ts` | P05-05 | GEN2 diff bytes 0, manifest byte-identical; unmanaged content preserved; dry-run touches nothing; collision refusal |
| Ownership classes generated/merged/seeded/user | ADR-0016, schema `OWNERSHIP_MODES` extended additively | P05-06 | schema tests accept canonical classes; synth tests per class |
| Artifact lineage | `manifest.ts` `input:<hash>` + `pack:<ref>@<ver>` markers | P05-07 | 17 manifest tests incl. lineage traceability |
| Upgrade/synth preview | `synth.ts` `previewSynth` (pure report, never writes) | P05-08 | 23 tests: create/overwrite/merge/skip/collision per class, user-owned never written, determinism |
| Standards/context docs | `standards-context.ts` (STANDARDS.md, policies/<class>.md, CONTEXT.md) | P05-09 | 12 tests: precedence ordering, conflict surfacing, lineage, input-order independence |

## Phase 04 trace

| Requirement family | Decision/artifact | Task | Test/evidence |
|---|---|---|---|
| Declarative pack loader (ADR-0004, R-022) | `loadPack` — strict `PackSchema` validation + sha256 integrity + executable-construct rejection at any depth (`packages/packs/src/loader.ts`) | P04-01 | 8 tests: valid packs load; scripts/hooks/exec/nested executable keys rejected (PackLoadError, kind=executable); missing pack.yml fails closed |
| Deterministic resolution + conflicts (ADR-0018) | `resolvePacks` — version pick, transitive `requires` closure, cycle detection, capability-conflict diagnostics, Kahn topological order (`resolve.ts`) | P04-02 | 12 tests: dependency-first order, identical-input fingerprint, highest-version pick, unknown-ref/missing-requires/cycle/capability-conflict surfaced |
| Lockfile generation (exit gate: versions/checksums locked) | `buildLockfile` → strict `LockfileSchema` with ref/version/source/sha256; deterministic fingerprint (`lock.ts`) | P04-03 | 3 tests: locked version+integrity (matches raw-file digest), schema-valid shape, deterministic fingerprint |
| Planning-depth profiles (exit gate: predictable compile) | `compilePlanningProfile`/`allPlanningProfiles` for lean/standard/production/high-assurance (`profiles.ts`) | P04-04 | 5 tests: all 4 depths compile, predictable (same input → equal output), custom → null, monotonic docs/gates, enumeration |
| Malicious/conflicting pack fixtures (R-022) | Real on-disk fixture packs under `packages/packs/src/fixtures/` (malicious scripts/hooks/exec/nested; conflicting capability/cycle/missing-dep) | P04-05 | fixture files exercised by loader/resolver tests above |
| Standards packs + selection (CHG-001 P04-06, REQ-STD-001/002/004) | `StandardsPackContentSchema` + `selectStandards` — class-aware, appliesTo filtering, precedence tiers, conflicts surfaced (`pack-content.ts`, `standards.ts`) | P04-06 | 9 tests: applicable selection, context filtering, same-tier conflict surfaced, cross-tier deterministic shadowing |
| Engineering policy precedence (CHG-001 P04-07, REQ-STD-004) | `EngineeringPolicyContentSchema` + scope→precedence mapping in `selectStandards` | P04-07 | policy fixture + duplicate-policy-id conflict tests |
| Pack provenance metadata (CHG-001 P04-08, REQ-TRUST-001) | `PackProvenanceSchema` (source/url/author/publishedAt/license/integrity) on `PackSchema` | P04-08 | 2 schema tests + loader accepts provenance-less local packs |
| Context/memory policy declarations (CHG-001 P04-09, declarations only) | `ContextMemoryPolicySchema` — token budget, progressive disclosure, scopes, provenance/redaction declarations; NO storage engine | P04-09 | 4 schema tests + loader context-category fixture test |

## Phase 02 trace

| Requirement family | Decision/artifact | Task | Test/evidence |
|---|---|---|---|
| Project config schema (REQ-MODEL-*, ADR-0002) | `ProjectConfigSchema` (`packages/schema/src/project.ts`); axis enums for type/lifecycle/risk/style/density/a11y/depth/mode/agents | P02-01 | 11 unit + negative tests incl. strict unknown-key rejection, round-trip JSON+YAML |
| State, lock, manifest schemas (state-and-manifest.md) | `StateSchema`, `LockfileSchema`, `ManifestSchema` (`state-lock-manifest.ts`) with integrity/checksum/ownership fields | P02-02 | 14 unit + negative tests; repo `.planmo/state.yml` shape parses |
| Pack + design schemas (ADR-0004 declarative packs, DTCG) | `PackSchema`, `DesignProfileSchema`, `DesignTokensSchema` (`pack-design.ts`) | P02-03 | 11 unit + negative tests; 6 categories, DTCG `$schema` |
| Trace/handoff/work-packet schemas (handoffs TEMPLATE) | `TraceGraphSchema`, `HandoffSchema`, `WorkPacketSchema` (`trace-handoff-workpacket.ts`) | P02-04 | 12 unit + negative tests mirroring `planning/handoffs/TEMPLATE.md` |
| Schema versioning + migrations (schema-versioning.md) | `SchemaMigrations` framework + v0->v1 registries (`schema-versioning.ts`, `migrations.ts`), fixtures, ADR-0011 | P02-05 | 13 tests (version reading 4 + framework 3 + fixture migrations 6) + 4 golden round-trip: future-major rejection, chain gaps, idempotent re-migrate, extension preservation |
| Strict/extension policy (RA: R-014, R-003) | ADR-0011 | P02-01/05 | `z.strictObject` + `extensions` map tests; migration preserves extensions verbatim |

## Phase 01 trace

| Requirement family | Decision/artifact | Task | Test/evidence |
|---|---|---|---|
| Reproducible install (REQ-OPS-001) | pnpm monorepo, `packageManager` pin, lockfile (ADR-0009) | P01-01 | `pnpm install --frozen-lockfile` + `pnpm check` on Node 24 |
| Quality gates | lint (ESLint), format-check, typecheck (tsc), Vitest tests | P01-02 | `pnpm check` exit 0; 8 unit/negative tests |
| Cross-platform CI | `.github/workflows/ci.yaml` (Linux/macOS/Windows × Node 24) | P01-03 | Workflow added; GitHub Actions BLOCKED by BuildFailed ghost registration (workflow_id 362348206, R-021) — re-run after GitHub-side purge or Settings toggle |
| Release scaffolding | Changesets config + README; private packages | P01-04 | `pnpm changeset status`; no publishing |
| Package boundaries | `docs/10-engineering/package-boundaries.md` + `scripts/check-boundaries.mjs` in CI | P01-05 | `pnpm boundary-check` exit 0; negative cases in script |
| CLI smoke | `@planmo/cli` bin `planmo` (ADR-0010) | P01-01/02 | `node packages/cli/dist/bin.js --version` → `planmo 0.0.0`; CLI unit tests |

## CHG-001 trace (Quality, Context, Memory & Governance)

Source: `planning/changes/CHG-001-quality-context-governance/` (accepted 2026-09-20; ADRs 0012–0017).

| Requirement family | Decision/artifact | Task | Test/evidence |
|---|---|---|---|
| REQ-STD-001..004 — structured standards, applicable selection, discovery, precedence | ADR-0012/0018/0020, `docs/13-standards-quality/standards-engine.md` | P04-06, P04-07, P06-08, P09-08, P10-08 | later-phase tests; precedence conflicts surfaced not silently resolved; deterministic injector renders selected rules |
| REQ-QLT-001..004 — maintainability review, refactoring policy, technical debt, quality diagnostics | ADR-0012, `docs/13-standards-quality/quality-engine.md`, `refactoring-technical-debt.md` | P09-06, P09-09 | `planmo quality` emits findings, not vanity scores; phase-close debt review |
| REQ-CTX-001..005 — context bundle, repo map, token budget, progressive disclosure, agent-neutral portability | ADR-0013/0014/0022, `docs/14-context-memory/architecture.md`, `retrieval-token-budget.md` | P06-07, P06-09, P08-10, P10-06, P10-09 | budget-bound context bundle; deterministic lexical baseline; export formats plain JSON/JSONL/MD; `planmo next` composes budgeted L0/L1/L2 via agent-bridge `compileContextBundle` |
| REQ-MEM-001..010 — authority, types, provenance, temporal validity, scoping, local-first, rebuildable, secrets, pruning, poisoning defense | ADR-0013/0014/0020/0022, `docs/14-context-memory/memory-model.md`, `security.md`, `lifecycle.md` | P04-09, P06-10, P08-08, P08-09, P09-10, P10-10, P12-08, P12-10 | poisoning/staleness/security tests; canonical outranks memory; raw chat not durable by default; no-op rows when nothing stored; session-memory lifecycle + handoff consolidation (source mapping, provenance, `internal` sensitivity, supersede) 12 tests |
| REQ-CHG-001..004 — change packages, deltas, impact, apply/archive | ADR-0015/0022, `docs/15-change-governance/change-engine.md` | P08-11 | `planmo change new/apply/archive`; ADDED/MODIFIED/REMOVED deltas; `ChangePackageSchema` (schema test 5) + change engine (apply stamps decision, double-apply refused) |
| REQ-SYN-001..003 — ownership classes, lineage, upgrade preview | ADR-0016, `docs/15-change-governance/managed-file-ownership.md` | P05-06, P05-07, P05-08, P05-09 | upgrade preview shows collisions/migrations; no silent overwrite; writer checksums feed lineage |
| REQ-WRK-001..003 — task graph, claims, execution packets | ADR-0017/0022, `docs/15-change-governance/task-graph-execution-packets.md` | P08-06, P08-07, P06-11 | ready/blocked computation; lease expiry; packet carries reqs+standards+context+risks+tests; DAG cycles/ready/ordered 30 tests; lease `expired()` pure query (caller reclaims) 16 tests |
| REQ-ARCH-001..002 — fitness rules, cycle/orphan diagnostics | ADR-0012, `docs/13-standards-quality/architecture-fitness.md` | P09-07 | machine-readable rules; failures carry rule ID, path, requirement, remediation |
| REQ-EVAL-001..003 — golden scenarios, AI rubric, token benchmark | ADR-0014, `docs/16-evals-trust/eval-engine.md` | P12-08, P12-09, P12-10 | deterministic rubric checks on fixtures; malicious-repo authority fixture |
| REQ-TRUST-001..003 — pack provenance, no implicit execution, future SBOM/signature | ADR-0017 (trust future), `docs/16-evals-trust/trust-engine-future.md` | P04-08, P11-06 | declarative packs remain non-executable; trust metadata fields defined; no v1 blocker |

## Phase 07 trace

| Requirement family | Decision/artifact | Task | Test/evidence |
|---|---|---|---|
| REQ-DESIGN-001..003 — structured profile, accessibility precedence, sources separate from style | ADR-0003/0021, `@planmo/design-engine` (tokens/packs/shadcn/docs/accessibility/design-standards), `docs/05-design-engine/*` | P07-01..07 | 125 new tests (schema 27 → engine 112); DTCG alias/cycle/missing-ref/invalid-unit suite; 8 packs each validated by the token engine; WCAG relative-luminance contrast math (AA 4.5/3.0, AAA 7.0/4.5); community/untrusted registry items forced `requiresReview: true` (schema-enforced); byte-deterministic DTCG emit + docs render; E2E proof `scripts/e2e-phase07.mjs` |
| Design anti-patterns / design standards as structured rules (CHG-001) | ADR-0021, `design-standards.ts` (13 rules, class `language`, `design.*` ids), `anti-patterns.ts` (universal + per-style) | P07-07 | 22 engine tests; every rule parses `StandardRuleSchema`; ids unique/dot-prefixed; `design.accessibility-outranks-style` present |
