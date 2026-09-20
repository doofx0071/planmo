# ADR-0019 — Deterministic Planning Compiler and Generation Manifest

**Status:** Accepted (Phase 05, 2026-09-20)

## Context
Phase 05 introduces the deterministic planning compiler: normalized project
model + locked packs → IR → renderers → generation manifest → safe apply. The
compiler must be byte-stable (same inputs → same bytes), must never overwrite
unmanaged content, and must record ownership + lineage for every generated
artifact (CHG-001 REQ-SYN-001/002, addendum).

## Decision

### 1. IR is the only contract between inputs and artifacts
`PlanningIR` (`packages/generator/src/ir.ts`) is a plain, sorted, hash-stable
snapshot: normalized project config, locked packs (sorted by ref/version/digest
— a total order even for duplicate-ref anomalies), depth-pruned canonical phase
spine, standards selection, and a sha256 `inputHash` over canonical (sorted-key)
JSON. No clocks, no randomness, no filesystem. Renderers receive the IR and
nothing else, so any two processes with identical inputs produce identical
artifacts (exit gate: byte-stable output).

### 2. Ownership classes and safety
Artifacts declare ADR-0016 ownership classes (`generated`, `merged`, `seeded`,
`user`; legacy `managed`/`merge` remain parseable). The synth preview
(`synth.ts`) computes the plan without writing: generated artifacts overwrite
only manifest-owned files, seeded files skip when present, user-owned content is
never written, and an unmanaged file at a target path is a collision — never a
silent overwrite. Apply goes through the Phase 03 `ManagedWriter`
(containment, symlink safety, atomic temp+rename).

### 3. Generation manifest
`buildGenerationManifest` produces the `.planmo/manifest.json` document:
one entry per artifact with path, kind, generator id, pack/input lineage
markers (`input:<inputHash>`, `pack:<ref>@<version>`), sha256 checksum,
ownership mode, and generation version; entries are path-sorted and the
document round-trips through the strict `ManifestSchema` via
`toPersistableManifest`.

### 4. Golden fixtures and idempotent regeneration
Committed golden snapshots (`packages/generator/src/golden/`) capture the real
pipeline output for low-, medium-, and high-assurance projects (48 snapshots
today). The golden tests and the idempotency tests (regenerate in a scratch
root, compare bytes, assert zero diff and an unchanged manifest) are the spine
of the exit gates.

## Consequences
- Renderers are pure functions; new artifacts require only a new renderer.
- Any byte change to canonical outputs is visible as a golden-snapshot diff.
- AI output cannot enter the pipeline directly — it must be normalized into a
  schema-validated model before `buildIr` runs (agent bridge, Phase 06).