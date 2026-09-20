---
'@planmo/schema': minor
'@planmo/packs': minor
---

Phase 04 pack & profile system:

- `@planmo/schema` adds pack provenance metadata, three new pack categories
  (standards, policy, context) with strict content schemas, and precedence/
  standard-class constants for the standards engine.
- `@planmo/packs` (new) provides the declarative pack loader (fail-closed on
  executable constructs, sha256 integrity), deterministic resolution with
  surfaced conflicts, lockfile generation, planning-depth profiles, and the
  standards/policy selection engine.
