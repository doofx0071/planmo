---
"@planmo/packs": patch
"@planmo/agent-bridge": patch
---

Phase 11 (ecosystem & integrations): remote pack trust model, catalog/source abstraction, checksums/pinning/reversibility, pack authoring docs, GitHub export prototype, portable context/memory export-import.

- `@planmo/packs`: `classifyTrust`/`formatTrust` (builtin/local no-review; every remote `third-party` with non-disableable `requiresReview`; `verified-source` reserved and downgraded — ADR-0025), `resolveCatalog`/`pickCatalogEntry` (declarative sources, injected fetcher, sha256 integrity per remote entry, deterministic selection), `planLockDiff`/`verifyLockIntegrity`/`lockFromResolution` (diffable reversible install plans, tamper detection, trustLevel on lock rows), `renderGithubExport` (additive, sorted, path-safe payload — prototype only, no network, no core dependency).
- `@planmo/schema`: additive `TRUST_LEVELS`/`TrustLevel`; optional `provenance.trustLevel`; optional `trustLevel` on `PackLockEntry` (pre-Phase 11 lockfiles keep parsing).
- `@planmo/agent-bridge`: `exportMemoryPortable`/`importMemoryPortable` (deterministic JSON/JSONL/Markdown portable memory, golden round-trips, stale/malformed rejection), `createFileMemoryProvider` (file-backed MemoryProvider adapter; honest no-op rows on empty/invalid input — REQ-MEM-001).
- Docs: `docs/04-packs/authoring.md` (NEW — categories, required fields, SemVer/compatibility, executable-key reject list, remote provenance, standards/policy/context content shapes), trust model rewrite (`pack-trust.md`), resolution/versioning pinning rules, storage-portability format specs.
- E2E proof `scripts/e2e-phase11.mjs` (31 checks); full gate `pnpm check` exit 0 (911 tests).