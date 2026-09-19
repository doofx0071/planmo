# ADR-0011 — Strict versioned schemas and user-extension policy

**Status:** Accepted

Every persisted PlanMo document is validated by a strict, explicitly versioned
Zod schema in `@planmo/schema`.

## Decision

1. **Every submitted document carries `schemaVersion`** — a literal integer
   matching the current `SCHEMA_VERSION`. Documents without a version are
   treated as legacy v0 and must pass through a registered v0->v1 migration
   before parse.
2. **Future major versions are rejected** (`schemaVersion > MAX_SUPPORTED`)
   with `UnsupportedSchemaVersionError`; no silent downgrade or partial parse.
3. **Object schemas are strict by default** (`z.strictObject`): unknown keys
   are rejected with a path-scoped diagnostic, never silently stripped.
   Rationale: canonical model corruption, typos, and tool-drifting docs fail
   loudly at `planmo doctor`/validate instead of propagating half-understood
   state (R-014, R-003).
4. **User extension data is a supported, preserved field**: every document
   schema carries an optional `extensions: Record<string, unknown>` map.
   Migrations must copy it verbatim. This is the ONLY sanctioned free-form
   escape hatch; it is user data, not machine-validated behavior, and cannot
   control generation (determinism boundary).
5. **Migrations are deterministic chains** registered per document kind
   (v0->v1, v1->v2, ...) and are fixture-covered (`packages/schema/src/
   fixtures/`). Re-migrating an already-current document is idempotent.

## Consequences

- Core/agent-bridge must route documents through parse (or migrate+parse)
  before any artifact generation; unvalidated prose never drives the
  filesystem (MASTER-GUARDRAILS determinism rule).
- Extending a document means either a new v1 key (with release note) or a
  new major version + migration; `planmo doctor` detects mixed incompatible
  state.
- DTCG design-token output is versioned by its `$schema` URI rather than
  `schemaVersion`, because it is an emitted format, not a PlanMo state doc.

Resolves the exit-gate requirement "Invalid and unknown fields follow a
deliberate policy" (phase-02.md) and operationalizes docs/02-architecture/
schema-versioning.md.