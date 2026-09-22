# Trust Engine — Future Architecture

Community packs and remote registries introduce supply-chain risk.

Future PlanMo should be able to represent:
- source repository;
- publisher;
- version;
- checksum/digest;
- license;
- declared capabilities;
- supported PlanMo versions;
- SBOM;
- signature/provenance;
- trust status.

Core v1 rule remains:
**declarative packs do not execute arbitrary remote code.**

Possible future ecosystem integrations may use concepts/tools from:
- Sigstore;
- CycloneDX;
- OSV;
- OpenSSF Scorecard.

These are future capabilities, not Phase 04 blockers.

## Phase 11 — implemented trust classification

Phase 11 (`P11-01`, `docs/08-security/pack-trust.md`) ships a deterministic
foundation that the future machinery above can build on without rework:

- **Deterministic classifier.** `classifyTrust` maps any `TrustInput`
  (source kind + provenance + declared trust) to a fixed `TrustLevel`
  (`builtin` / `local` / `verified-source` / `third-party`) plus a
  `requiresReview` burden and stable, sorted human-readable reasons.
- **Remote packs are always `third-party` + review.** Until a
  signature/curation design exists, `verified-source` cannot be declared on
  a remote pack; the classifier downgrades any such claim and the review
  requirement cannot be disabled (ADR-0021 community-class spirit).
- **Integrity metadata is already mandatory for remote sources.** The
  catalog resolver computes a sha256 over raw `pack.yml` for every
  registry/git entry; `verifyLockIntegrity` (P11-03) checks lock entries
  against actual resolved content — the digest plumbing the future
  signature checks will build on.
- **Provenance is structured data, not prose.** Source kind, origin URL,
  integrity, and declared trust travel with every `CatalogEntry`; SBOM and
  signature verification can attach at the same seam without changing the
  catalog contract.

Still future (REQ-TRUST-003): signatures/Sigstore-style verification,
SBOM/CycloneDX emission, OSV dependency scanning, OpenSSF Scorecard
gating, and publisher identity beyond the `verified-source` placeholder.

## Phase 12 — implemented-classification eval evidence

`classifyTrust` was exercised against a deterministic fixture catalog
covering the trust-metadata surface that exists today (real run, 2026-09-22,
via `packages/packs` built dist; deterministic — identical input produces
identical classifications):

| fixture catalog entry | declared | classified | requiresReview | key reasons (sorted) |
|---|---|---|---|---|
| `planmo-core-tasks` (builtin) | — | `builtin` | false | ships with PlanMo |
| `acme-internal` (local) | — | `local` | false | authored on this machine |
| `community-adr` (registry, sha256 present) | third-party | `third-party` | true | integrity present; review cannot be disabled |
| `vendor-signed-claim` (registry, sha256 present) | verified-source | `third-party` | true | **verified-source downgraded** (reserved for future signing); integrity present; review cannot be disabled |
| `git-raw` (git, no integrity) | — | `third-party` | true | **no integrity checksum**; review cannot be disabled |
| `registry-no-integrity` (registry, no integrity) | trusted | `third-party` | true | declared `trusted` downgraded; **no integrity checksum**; review cannot be disabled |

Eval evidence: the classifier is a pure, deterministic function — same
`TrustInput` always maps to the same `TrustLevel` + `requiresReview` +
sorted reasons; remote entries can never be `verified-source` (the future
signing design must add the seam through which authentic signatures can
upgrade a remote to `verified-source`); missing integrity is always
surfaced as a reason (REQ-TRUST-001/002 semantics hold for every row above).

## Trust-metadata pilot note (Phase 12)

The full future trust model (source repository, publisher, version,
checksum/digest, license, declared capabilities, supported PlanMo versions,
SBOM, signature/provenance, trust status) was mapped against what the v1
catalog already carries, using the fixture catalog above:

- **Carried today**: source kind (`builtin`/`local`/`registry`/`git`),
  origin URL, sha256 integrity digest over raw `pack.yml` (mandatory for
  remote sources), declared trust level, and the derived trust status +
  review burden (`classifyTrust` output, deterministic).
- **Not yet carried**: publisher identity, license, declared capabilities,
  supported PlanMo versions, SBOM, signature.
- **Pilot result**: none of the missing fields changes the current
  classification semantics — the deterministic classifier is stable under
  the future fields because they are additive metadata; signatures attach
  at the same seam where `verified-source` currently downgrades (a
  signature verifier would feed an upgraded `TrustInput`, not a new
  classification path).

This mirrors REQ-TRUST-003's spirit: v1 ships the deterministic decision
core (classify, downgrade, mandatory review) plus the integrity plumbing;
signature/SBOM/publisher identity remain future, additive work.
