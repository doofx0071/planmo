# Pack Trust Model

Phase 11 (`P11-01`) implements a deterministic trust classifier
(`classifyTrust` in `@planmo/packs/src/trust.ts`) for every pack, per
REQ-TRUST-001/002 and the ADR-0018 consequence that any remote-pack support
must add provenance/integrity/trust metadata. The schema defines the levels
(`TRUST_LEVELS`, `@planmo/schema`); the classifier is the only gate that
validates declared levels — the schema alone never enforces them.

## Trust levels and review burden

| Level | Meaning | Review burden |
| --- | --- | --- |
| `builtin` | Ships with PlanMo itself | none (`requiresReview: false`) |
| `local` | Authored on this machine | none (`requiresReview: false`) |
| `verified-source` | Reserved for a future signing/curation design | **not assignable to remote packs yet** |
| `third-party` | Any pack from a registry or git source | **always required** (`requiresReview: true`) |

Classification is a pure, deterministic function of the input
(`TrustInput`): identical inputs always produce identical
`TrustClassification`, with `reasons` sorted and stable. `formatTrust`
renders a deterministic one-line summary
(`<trustLevel> (review required|no review): <reason>; <reason>`) for
reports and the CLI.

## Remote-pack rules (REQ-TRUST-001/002, ADR-0004, ADR-0018)

- **Remote packs are always `third-party` with `requiresReview: true`.**
  The review burden for remote packs cannot be disabled by the caller, by a
  pack, or by a source declaration (ADR-0021 community-class spirit).
- **`verified-source` is unassignable to remotes** until a signing design
  exists. Any remote that declares `verified-source` (in provenance or via
  a source's `declaredTrust`) is downgraded to `third-party` + review with
  an explicit reason. Any other non-`third-party` declaration on a remote is
  similarly unassignable.
- **Integrity is required for every remote pack.** A remote entry without an
  integrity checksum still resolves to `third-party` + review and the
  classifier surfaces the missing checksum as a reason. The catalog resolver
  (`resolveCatalog`, P11-02) computes the sha256 of the raw `pack.yml` for
  every registry/git entry (`integritySha256`); local-dir entries may omit
  it.
- **No implicit execution.** v1 packs remain declarative at every trust
  level (ADR-0004): the loader rejects executable constructs
  (`scripts`/`hooks`/`exec`/…) at any nesting depth, and REQ-TRUST-002 keeps
  remote packs non-executable by default. Trust classification never grants
  execution rights.
- **Provenance metadata travels with the entry.** `CatalogEntry.provenance`
  carries source kind, origin URL, integrity (sha256, remote only), and the
  trust level declared by the source owner — the classifier validates it,
  never trusts it verbatim.
- **Locking semantics are preserved.** ADR-0018 determinism still applies:
  resolution stays deterministic, conflicts are surfaced (duplicate refs are
  never silently deduped by the catalog; `pickCatalogEntry` resolves them
  deterministically), and lock entries carry the classified `trustLevel`
  (Worker B, P11-03).

## Catalog sources (P11-02)

Sources are declarative descriptors (`CatalogSource`); nothing is fetchable
by default. Resolution is performed through an injected `CatalogFetcher`
(`listRefs`/`fetchText`) — the engine performs no I/O. URL convention:

- `local-dir` — `listRefs(url)` lists pack refs; entries load from
  `<url>/<ref>/pack.yml`; integrity optional.
- `registry` — `listRefs(url)` lists the registry index; each entry loads
  from `<url>/<ref>/pack.yml`; integrity required.
- `git` — the git `ref` (branch/tag/commit) is pinned into the base URL
  (`<url>/<ref>`); same listing/fetch semantics as registry; integrity
  required.

Selection (`pickCatalogEntry`) is deterministic: an exact pinned version
wins; otherwise the highest valid SemVer for the ref; `null` when none.
Invalid SemVer versions are never selected.

## User-visible consequences

Every remote pack surfaced to the user must show source, version/ref,
capabilities, integrity metadata, and a positive review requirement that the
CLI cannot silence. No signed packs are assumed until a signing design
exists (REQ-TRUST-003; see `docs/16-evals-trust/trust-engine-future.md`).