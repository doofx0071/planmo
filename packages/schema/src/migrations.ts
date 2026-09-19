import { SchemaMigrations } from './schema-versioning.js';

/**
 * Registry of schema migrations for each document kind.
 *
 * v0 = unversioned legacy documents (authored before schemaVersion existed).
 * Because PlanMo 1.0 fixes schemaVersion at 1, the only migration needed is
 * v0 -> v1: stamp the version. Each migration is deterministic, preserves
 * user extension data verbatim, and is fixture-covered (packages/schema/src/
 * fixtures and their tests).
 */

// ---------------------------------------------------------------------------
// Project config: v0 (unversioned) -> v1 (stamped).
// The v0 shape mirrors docs/02-architecture/canonical-project-model.md minus
// the schemaVersion key — that document was the source of this schema.
// ---------------------------------------------------------------------------

export const PROJECT_MIGRATIONS = new SchemaMigrations<unknown>('project', 1).acceptsLegacy(
  (doc: Record<string, unknown>) => {
    // Preserve everything the caller supplied: strict v1 parsing will reject
    // genuinely invalid fields; valid ones (including `extensions`) survive.
    return { ...doc, schemaVersion: 1 };
  },
);

// ---------------------------------------------------------------------------
// State: v0 (unversioned state files) -> v1 (stamped).
// ---------------------------------------------------------------------------

export const STATE_MIGRATIONS = new SchemaMigrations<unknown>('state', 1).acceptsLegacy(
  (doc: Record<string, unknown>) => ({ ...doc, schemaVersion: 1 }),
);

// ---------------------------------------------------------------------------
// Handoff: v0 (unversioned handoffs) -> v1 (stamped).
// ---------------------------------------------------------------------------

export const HANDOFF_MIGRATIONS = new SchemaMigrations<unknown>('handoff', 1).acceptsLegacy(
  (doc: Record<string, unknown>) => ({ ...doc, schemaVersion: 1 }),
);
