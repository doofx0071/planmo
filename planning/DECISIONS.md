# Decision Log

Confirmed:
- Product name: **PlanMo**.
- Product: project planning/execution workspace generator.
- Architecture: CLI-first + agent-native.
- AI: optional and outside deterministic core.
- Repository is durable source of truth.
- Fresh AI session per phase.
- Max recommended parallel workers: 3 + coordinator.
- Canonical frontend tokens: DTCG-compatible.
- Initial styles: Minimal, Editorial, Neobrutalism, Soft Product, Dense Dashboard, Developer Tool, Luxury, Playful.
- UI/component registries are sources, not styles.
- Packs are declarative in v1.
- Existing repo scanning is passive/static by default.
- SemVer + Conventional Commits + GitHub Flow.

Phase 00 confirmations (2026-09-19):
- Product thesis and v1 non-goals locked; internally consistent across README, MASTER-PLAN, and `docs/01-product/` (P00-01).
- Source repository: **https://github.com/doofx0071/planmo** — PRIVATE, `main` created 2026-09-19 (P00-02, ADR-0007).
- npm targets: primary **`planmo`**, internals **`@planmo/*`**, fallback **`planmo-cli`**; all verified free 2026-09-19 (P00-02, ADR-0007).
- Support matrix locked: agents = generic + OpenCode CLI + Claude Code (Codex CLI not targeted in v1); platforms = Windows 10/11, macOS, Linux on Node.js 24 LTS; styles = the 8 listed; distribution = npm only (P00-03, ADR-0008).
- Research baseline finalized against official sources, retrieved 2026-09-19; Node 24 LTS baseline confirmed (P00-04).
- Licensing criteria recorded (permissive, dependency-compatible, clear patent terms, low overhead, ecosystem norm, trademark separation); final license deferred to Phase 12, default recommendation MIT (P00-05).

Phase 01 confirmations (2026-09-19):
- pnpm monorepo with pinned `packageManager: pnpm@10.33.0` + committed lockfile; packages `@planmo/shared`, `@planmo/schema`, `@planmo/core`, `@planmo/cli` scaffolded (ADR-0009).
- Toolchain: TypeScript 7.0.2 (strict, NodeNext ESM; `baseUrl` removed in TS7), Vitest 5.0.1, ESLint 10.11.0 flat (@eslint/js + globals; ts lint deferred — R-019), Prettier 3.9.8, Changesets 3.0.3, Node >=24 engines (ADR-0009).
- CLI routing: zero-dependency internal command registry in v1 core; build tool: plain `tsc` emit, no bundler yet (ADR-0010 — resolves OPEN-QUESTIONS #3 and #4).
- Package boundary rules documented in `docs/10-engineering/package-boundaries.md` and enforced by `scripts/check-boundaries.mjs` in CI (P01-05).
- GitHub Actions CI: Linux/macOS/Windows × Node 24.x with frozen install, lint, format-check, typecheck, build, tests, boundaries, CLI smoke (P01-03).

Phase 02 confirmations (2026-09-20):
- All persisted PlanMo documents are strict, explicitly versioned Zod schemas in `@planmo/schema`; `schemaVersion` literal required, future major versions rejected (ADR-0011).
- Deliberate unknown-field policy: strict objects reject unknown keys; the ONLY free-form escape hatch is the optional `extensions` map, preserved verbatim by migrations (ADR-0011).
- Migration framework: deterministic per-document-kind chains (v0->v1, ...), fixture-covered under `packages/schema/src/fixtures/`, idempotent re-migration (ADR-0011; P02-05).
- Schema runtime: Zod 4.6.5 (npm registry, verified 2026-09-20); `yaml` 2.9.1 used in tests for YAML round-trip/golden fixtures (P02-01..05).
- Project model v1 axis sets locked: project types/lifecycles/risks, the 8 design styles, densities, WCAG-2.2 levels, planning depths, phase modes, agent ids (ADR-0002/0008 shapes).
- DTCG design tokens are versioned by their `$schema` URI (emitted format), not by PlanMo `schemaVersion` (ADR-0011).

Phase 03 confirmations (2026-09-20):
- All generated writes go through ONE managed writer (`@planmo/core` `ManagedWriter`): root containment (path.relative, never string prefix), symlink-escape rejection (junctions included), collision refusal for unmanaged files, atomic temp+rename, sha256 checksums, dry-run with zero fs side effects, unified diff preview, TOCTOU re-check at apply time (ADR-0010, secure-filesystem.md; P03-01/02/05).
- `planmo init` creates a schema-valid workspace (project.yml + state.yml + manifest.json) via the writer; CLI wizard prompts only for unprovided values (`--yes` skips all), `--dry-run` previews, `--force` permits overwriting, exit codes 0/1/2/3 (ok/error/collision/no-project) (ADR-0010; P03-03).
- `planmo status` is strictly read-only (validates all canonical docs, never writes) and is the diagnostic base for later `planmo doctor` (P03-04).
- Diff preview is a zero-dependency deterministic LCS unified diff in the core — no external diff dependency (ADR-0010).
- `.gitattributes` (LF) + a pure `plan()` keep dry-run genuinely side-effect-free cross-platform (P03-02).

Phase 04 confirmations (2026-09-20):
- Pack resolution is deterministic: highest valid version per ref, deterministic closure traversal, Kahn topological order with ref tie-breaks; identical inputs → identical fingerprint (ADR-0018; P04-02).
- Conflicts are surfaced, never silently resolved: same-tier duplicate rule ids with differing content, capability conflicts, dependency cycles, unknown refs, missing requires all emit actionable diagnostics (ADR-0018; P04-02/06/07).
- Lockfile emits strict `LockfileSchema` pinning ref/version/source/sha256 of every resolved pack — deterministic fingerprint proves two resolutions agree (P04-03).
- Executable constructs are rejected at load, fail-closed, at any nesting depth (scripts/hooks/exec/install/…), beyond strict `PackSchema` validation — v1 packs remain declarative (ADR-0004; P04-01/05).
- Standards engine: 9 classes, 7 precedence tiers, appliesTo context filtering; policies map scope→precedence; cross-tier same-id shadowing is deterministic, same-tier differing content is a surfaced conflict (REQ-STD-001/002/004; P04-06/07).
- Provenance metadata (source/url/author/publishedAt/license/integrity) added to `PackSchema` as optional (local packs may omit; REQ-TRUST-001; P04-08).
- Context/memory policy declarations (token budget, progressive disclosure, scopes, requireProvenance, redactSecrets) are schema-validated declarations only — NO memory storage engine in v1 (REQ-CTX-003/005, REQ-MEM-003/005/008; P04-09).
- Planning-depth profiles compile predictably: lean/standard/production/high-assurance map deterministically to documents/gates/phase-mode; custom → null (P04-04).

Phase 05 confirmations (2026-09-20):
- IR is the only contract between inputs and artifacts; canonical-JSON sha256 over sorted inputs makes identical inputs hash identically regardless of input order (ADR-0019; P05-01).
- Ownership classes: schema `OWNERSHIP_MODES` extended additively with canonical `generated`/`merged`/`seeded`/`user`; legacy `managed`/`merge` remain accepted so v1 manifests keep parsing (P05-06).
- Synth preview is a pure report (never writes); apply always passes through the Phase 03 ManagedWriter — containment, symlink safety, collision refusal, atomic rename (P05-08).
- Long-lived generated files are byte-stable; the golden snapshot tree (`packages/generator/src/golden/`) is the regression fence; reformatting goldens is forbidden (`.prettierignore`) (P05-04/05).

Phase 06 confirmations (2026-09-20):
- Adapters are pure argv+prompt builders over pinned CLI surfaces (generic/opencode/codex/claude-code); they never execute a CLI, never read the filesystem, and import nothing from `@planmo/schema` — canonical state stays agent-neutral (P06-02..05, ADR-0020).
- Registry resolves by id with explicit degradation notes for requested-but-unsupported capabilities; `createDefaultRegistry()` registers the three v1-primary agents plus codex as an extension adapter (P06-01; ADR-0008 reconcile).
- AI proposals are schema-validated before affecting state: `AiProposalSchema` (strict; agent/requestId/items deltas, unknown keys fail). Nothing partial is ever applied (P06-06 critical).
- Context bundle compiled under a token budget with progressive disclosure L0 capsule/L1 index/L2 evidence; retrieval handles are layer-A paths the agent may load on demand (P06-07).
- Memory provider returns explicit no-op rows when nothing is stored; no hosted memory engine in v1 (P06-10; ADR-0013/0020).
- **Phase 07 (2026-09-21)**: design engine ships as `@planmo/design-engine` (core/shared/schema only) — DTCG canonical tokens with alias/cycle/missing-ref/invalid-unit enforcement (ADR-0003/0021); 8 declarative design packs validated by the same token engine that emits canonical output; registry adapter records source/item/version/integrity with mandatory trust metadata — community/untrusted items are FORCED `requiresReview: true`, schema-enforced, never overridable by caller or style; accessibility outranks style at the engine level (WCAG 2.2 AA default, exact relative-luminance math, reduced motion WCAG 2.3.3 mandatory, touch-target heuristic WCAG 2.5.8, `a11y.*` skip tokens rejected); generated design guidance is deterministic markdown incl. anti-patterns + validation warnings; design standards are structured `StandardRule`s (class `language` pending a `design` class — flagged for Phase 09 standards-injection work when `appliesTo` refinement lands).

## CHG-001 rebaseline confirmations (2026-09-20)

ACCEPTED (see `planning/changes/CHG-001-quality-context-governance/decision.md`):
- **Standards & Quality Engines are first-class** — structured, stack-aware standards selected per task (ADR-0012); quality findings are concrete/evidence-backed, never vanity scores; refactoring must be justified, unrelated stylistic churn forbidden (AGENTS.md additions).
- **Canonical state outranks memory** — memory is derived, provenance-bearing, temporally valid, scope-filtered, secret-safe, token-budgeted, and rebuildable (ADR-0013/0014); raw chat transcripts are NOT durable memory by default; embeddings are optional adapters; no hosted vector/graph dependency in v1.
- **Change packages are first-class** — substantial post-plan changes enter via explicit ADDED/MODIFIED/REMOVED requirement deltas, impacts, risks, tasks, tests, then apply/archive (ADR-0015).
- **Managed-file ownership classes** — generated/merged/seeded/user; lineage + upgrade preview before destructive changes (ADR-0016).
- **Task graph, claims, execution packets** — explicit dependencies, ready/blocked, lease-based claims, bounded worker packets (ADR-0017).
- **Pack/ADR numbering**: pack-proposed ADR-0007..0012 adopted as **ADR-0012..0017** (existing ADR-0007..0011 are different topics); mapping in the CHG-001 decision record.
- CHG-001 future tasks appended to `planning/tasks.csv` (35 tasks across P04–P12) without renumbering any completed Phase 00–03 ID.