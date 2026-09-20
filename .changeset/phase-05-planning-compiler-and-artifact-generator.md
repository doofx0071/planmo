---
'@planmo/schema': minor
'@planmo/generator': minor
---

Phase 05 planning compiler & artifact generator (9 tasks, CHG-001 REQ-SYN-001..003):

- `@planmo/schema`: `OWNERSHIP_MODES` extended additively with canonical
  CHG-001 classes `generated`/`merged`/`seeded`/`user` (legacy
  `managed`/`merge` still accepted — v1 manifests parse unchanged).
- `@planmo/generator` (new package): canonical IR (`buildIr`, deterministic
  sha256 over sorted inputs), pure renderers (planning docs + standards/
  context docs), generation manifest builder with per-artifact checksums and
  input/pack lineage markers, safe synth preview (never writes, collisions
  refuse, seed/user classes respected), compile pipeline through the
  Phase 03 ManagedWriter (containment, atomic rename, dry-run diff).
- Golden snapshot tests for low/medium/high-assurance projects and idempotent
  regeneration (second generation produces zero diff, manifest byte-identical).
