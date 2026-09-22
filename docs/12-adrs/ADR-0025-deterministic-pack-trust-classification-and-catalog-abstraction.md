# ADR-0025 — Deterministic Pack Trust Classification and Catalog Abstraction

- **Status:** Accepted
- **Date:** 2026-09-22
- **Phase:** 11 (ecosystem & integrations)
- **Owned tasks:** P11-01 (remote pack trust model), P11-02 (catalog/source abstraction), P11-03 (checksums/pinning/reversibility)
- **Extends:** ADR-0004 (declarative packs only), ADR-0018 (deterministic resolution and locking), ADR-0021 (registry trust metadata), REQ-TRUST-001..003

## Context

Phase 04 shipped a local-only declarative pack system: strict loader with
fail-closed executable-construct rejection, deterministic resolution, and a
lockfile pinning ref/version/source/sha256 (ADR-0018). Remote packs were
explicitly gated until Phase 11 (RISKS R-013/R-022). Phase 11 must add the
remote trust model, a declarative catalog/source abstraction, and
checksum/pinning/reversibility guarantees — while keeping v1 packs
declarative and non-executable (ADR-0004) and keeping resolution
deterministic (ADR-0018).

## Decision

### Trust is a deterministic pure function, never caller- or pack-overridable

`classifyTrust(input)` derives classification exclusively from (source kind,
provenance, declared trust) and returns `{ trustLevel, requiresReview,
reasons }`:

- **builtin** — ships with PlanMo core: `builtin`, no review.
- **local** — filesystem packs: `local`, no review.
- **remote (git/registry)** — ALWAYS `third-party` with
  `requiresReview: true` that **cannot be disabled** by caller, source, or
  pack (ADR-0021 community-class spirit; REQ-TRUST-002).
- **`verified-source` is reserved** for a future signing/curation design and
  is NOT assignable to remote packs today. Any declaration of it on a remote
  (via `provenance.trustLevel` or declared trust) is downgraded to
  `third-party` with an explicit sorted reason. The classifier — never the
  schema alone — enforces this.
- Remote packs without an integrity checksum get a dedicated reason; the
  mandatory-review reason is always last in the sorted reason set.
- Reasons are sorted with a plain deterministic comparator (no
  localeCompare); `formatTrust` renders a stable one-liner.

### Remote packs require sha256 integrity; catalogs do no I/O

- The catalog resolver computes the sha256 of the raw pack.yml for EVERY
  registry/git entry (`packIntegrity`, reused from the Phase 04 loader);
  remote entries never carry an optional integrity.
- `resolveCatalog(sources, fetcher)` performs NO I/O itself: it composes
  URLs and delegates to an injected `CatalogFetcher` (`fetchText`,
  `listRefs`). URL convention: `local-dir`/`registry` list refs at `<url>`
  then fetch `<url>/<ref>/pack.yml`; `git` pins `source.ref` into the base
  (`<url>/<source.ref>`), then the same listing/fetch semantics. `source.ref`
  is ignored for non-git kinds.
- Each catalog entry is self-describing: sourceId, kind, ref, version,
  integrity sha256 (remotes), provenance, and the raw pack.yml body.
  Malformed YAML, non-map YAML, or missing/invalid versions reject loudly
  (ADR-0018 conflict-surfacing spirit).

### Selection is deterministic; duplicates are surfaced, never silently deduped

`pickCatalogEntry(entries, ref, version?)` resolves: exact pinned version
wins, otherwise the highest valid SemVer (using the resolver's comparator so
catalog semantics match resolution semantics exactly), `null` when none.
Ties break by (sourceId, raw). Duplicate refs across sources are lawful input
and resolved deterministically — never silently deduped.

### Install/update is diffable and reversible (plan-only in v1)

- `planLockDiff(from, to)` emits one row per pack ref across both locks
  (added/removed/updated/unchanged, sorted), with `updated` when version OR
  integrity digest differs (content drift under the same version is never
  silent). `reversible` is always true: v1 plans never mutate.
- `verifyLockIntegrity(lock, readContent)` checks every entry that records a
  digest by re-hashing resolved content; failures are stable
  `ref@version: integrity mismatch` strings in (ref, version) order.
- `lockFromResolution(result, planmoVersion)` reuses `buildLockfile` and adds
  per-entry `trustLevel`: `builtin` for local, `third-party` when provenance
  source is registry/git.

## Consequences

- Remote pack adoption is opt-in (sources are declared, fetchers injected)
  and integrity-checked at resolution; nothing fetches by default.
- Provenance and trust status are visible per entry and per lock row.
- Install/update operations are diffable and reversible by construction (v1
  is plan-only; the diff IS the review artifact).
- Classification grants no execution rights: v1 packs remain declarative and
  non-executable at every trust level (REQ-TRUST-002, ADR-0004).
- SBOM/signature/provenance tooling (Sigstore, CycloneDX, OSV) remains a
  documented future capability (docs/16-evals-trust/trust-engine-future.md);
  the reserved `verified-source` level is its landing point.