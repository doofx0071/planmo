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
