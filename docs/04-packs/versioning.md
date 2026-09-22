# Pack Versioning

Use SemVer and explicit compatibility with:
- PlanMo core;
- schema versions;
- dependent packs;
- adapter capability versions.

Remote packs are pinned by version/ref and integrity metadata.

No automatic incompatible major upgrades.

## Locking and pinning rules (P11-03)

- Locks pin exact versions (SemVer) **and** content digests. Pinned selection is deterministic: a pinned version wins over a higher valid version of the same ref.
- Remote packs are pinned by version/ref and integrity. A lock entry without integrity for a remote pack is not verifiable and must be re-resolved before install.
- A version bump or content drift between two locks shows up as an `updated` row in the install diff (`planLockDiff`) — it is explicit and reviewable, never silent.
- No automatic incompatible major upgrades: any major bump must appear as an explicit `updated` action in the plan diff and be applied deliberately.
- Lock entries produced by the Phase 11 resolver carry a `trustLevel`: `builtin` for local sources, `third-party` for registry/git sources (the schema supports an optional `trustLevel` on every entry). Pre-Phase-11 locks are upgraded on the next resolution — entries only gain the field, nothing existing is rewritten.
- Reversibility: keep the previous lockfile; an update is reversible if the old lock's entries still verify (`verifyLockIntegrity` passes).
