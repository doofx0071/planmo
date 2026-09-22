import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as yamlParse } from 'yaml';
import { MAX_SUPPORTED_SCHEMA_VERSION, SCHEMA_VERSION } from './common.js';
import { HANDOFF_MIGRATIONS, PROJECT_MIGRATIONS, STATE_MIGRATIONS } from './migrations.js';
import {
  assertSupportedVersion,
  MissingSchemaVersionError,
  readSchemaVersion,
  SchemaMigrations,
  UnsupportedSchemaVersionError,
} from './schema-versioning.js';
import {
  DesignProfileSchema,
  HandoffSchema,
  LockfileSchema,
  ManifestSchema,
  PackSchema,
  ProjectConfigSchema,
  StateSchema,
  TraceGraphSchema,
  WorkPacketSchema,
} from './index.js';
import { expectRejected, roundTripJson, roundTripYaml } from './test-utils.js';

/**
 * Phase 12 upgrade/migration E2E (P12-04).
 *
 * For EVERY persisted PlanMo document kind we prove the full upgrade path:
 * oldest persisted fixture -> every registered migration step -> current
 * schema -> strict parse -> deterministic round-trip (stable, lossless).
 *
 * Kinds with a migration chain (v0 legacy -> v1): project config, state,
 * handoff. Kinds born versioned (v1 only, NO migration chain — v0 never
 * existed for them): lockfile, manifest, pack, design profile, trace graph,
 * work packet. Those must reject future versions and unversioned documents,
 * while keeping their golden/legacy-shape fixtures parseable.
 *
 * Existing fixtures and registrars are reused (imported, not duplicated);
 * only synthetic minimal documents are built inline for kinds that have no
 * fixture file.
 */

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

function loadYaml(name: string): Record<string, unknown> {
  return yamlParse(readFileSync(`${fixtures}${name}`, 'utf8')) as Record<string, unknown>;
}

function loadJson(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`${fixtures}${name}`, 'utf8')) as Record<string, unknown>;
}

function withoutSchemaVersion(doc: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...doc };
  delete copy.schemaVersion;
  return copy;
}

interface KindCase {
  name: string;
  migrationChain: SchemaMigrations<unknown> | null;
  schema: import('zod').ZodType;
  /** Oldest persisted document of this kind (legacy v0 or current v1 golden). */
  oldestDoc: Record<string, unknown>;
}

/** Persisted kinds WITH a registered v0 -> v1 migration chain. */
const chainedKinds: readonly KindCase[] = [
  {
    name: 'project config',
    migrationChain: PROJECT_MIGRATIONS,
    schema: ProjectConfigSchema,
    oldestDoc: loadYaml('project.v0.legacy.yml'),
  },
  {
    name: 'state',
    migrationChain: STATE_MIGRATIONS,
    schema: StateSchema,
    oldestDoc: loadYaml('state.v0.legacy.yml'),
  },
  {
    name: 'handoff',
    migrationChain: HANDOFF_MIGRATIONS,
    schema: HandoffSchema,
    // No fixture file exists for handoff; reuse the canonical legacy shape
    // that pre-versioning handoffs followed (planning/handoffs/TEMPLATE.md).
    oldestDoc: {
      phase: '00',
      status: 'COMPLETE',
      completedTasks: ['P00-01'],
      materialChanges: [],
      testsRun: [],
      securityFindings: [],
      decisions: [],
      knownDebt: [],
      nextPhase: '01',
    },
  },
];

/** Persisted kinds born versioned at v1 — NO migration chain exists by design. */
const versionedOnlyKinds: readonly KindCase[] = [
  {
    name: 'lockfile',
    migrationChain: null,
    schema: LockfileSchema,
    // Pre-Phase 11 lockfile: entry lacks `trustLevel`; must keep parsing.
    oldestDoc: loadYaml('lock.v1.golden.yml'),
  },
  {
    name: 'manifest',
    migrationChain: null,
    schema: ManifestSchema,
    // Golden carried the pre-CHG-001 ownership alias `managed`; must keep parsing.
    oldestDoc: loadJson('manifest.v1.golden.json'),
  },
  {
    name: 'pack',
    migrationChain: null,
    schema: PackSchema,
    oldestDoc: {
      schemaVersion: 1,
      ref: 'stack/nextjs',
      name: 'Next.js Stack Pack',
      version: '1.2.3',
      category: 'stack',
      description: 'Synthetic pack used by the Phase 12 upgrade E2E.',
      provides: ['stack.nextjs'],
      content: { npm: 'next' },
    },
  },
  {
    name: 'design profile',
    migrationChain: null,
    schema: DesignProfileSchema,
    oldestDoc: {
      schemaVersion: 1,
      style: 'minimal',
      density: 'balanced',
      accessibility: 'WCAG-2.2-AA',
    },
  },
  {
    name: 'trace graph',
    migrationChain: null,
    schema: TraceGraphSchema,
    oldestDoc: {
      schemaVersion: 1,
      links: [{ id: 'l1', kind: 'requirement', from: 'REQ-GEN-004', to: 'P00-01' }],
    },
  },
  {
    name: 'work packet',
    migrationChain: null,
    schema: WorkPacketSchema,
    oldestDoc: {
      schemaVersion: 1,
      id: 'wp-p12-04',
      taskId: 'P12-04',
      title: 'Upgrade E2E pilot packet',
      scope: 'exercise the migration path end to end',
      status: 'planned',
    },
  },
];

describe('P12-04 upgrade path: oldest persisted fixture -> current schema', () => {
  for (const kind of chainedKinds) {
    it(`${kind.name}: migrates the oldest document to the current schema and parses strictly`, () => {
      const migrated = kind.migrationChain!.migrate(kind.oldestDoc);
      expect(readSchemaVersion(migrated, kind.name)).toBe(SCHEMA_VERSION);
      // Strict parse must succeed (v1 schemas are fail-closed on unknown keys).
      expect(() => kind.schema.parse(migrated)).not.toThrow();
      // Deterministic registration chain: exactly v0 -> v1 exists today.
      expect(SCHEMA_VERSION).toBe(1);
      expect(MAX_SUPPORTED_SCHEMA_VERSION).toBe(1);
    });

    it(`${kind.name}: round-trip through the persisted format is stable and lossless`, () => {
      const migrated = kind.migrationChain!.migrate(kind.oldestDoc);
      // Project/state are persisted as YAML; handoff documents as JSON.
      if (kind.name === 'handoff') {
        const reparsed = roundTripJson(kind.schema, migrated);
        expect(readSchemaVersion(reparsed, kind.name)).toBe(SCHEMA_VERSION);
      } else {
        const reparsed = roundTripYaml(kind.schema, migrated);
        expect(readSchemaVersion(reparsed, kind.name)).toBe(SCHEMA_VERSION);
      }
    });
  }

  it('project config: extension data survives migration AND round-trip verbatim', () => {
    const migrated = PROJECT_MIGRATIONS.migrate(loadYaml('project.v0.legacy.yml'));
    const parsed = roundTripYaml(ProjectConfigSchema, migrated);
    expect(parsed.extensions).toEqual({ team: 'platform', tags: ['a', 'b'] });
  });

  it('migration is idempotent: re-migrating a current document changes nothing', () => {
    for (const kind of chainedKinds) {
      const once = kind.migrationChain!.migrate(kind.oldestDoc);
      const twice = kind.migrationChain!.migrate(once as Record<string, unknown>);
      expect(twice).toEqual(once);
    }
  });

  it('migrate() is pure: legacy source documents are never mutated', () => {
    for (const kind of chainedKinds) {
      if (kind.name === 'handoff') continue; // inline payload, not a persisted fixture
      const input = kind.oldestDoc;
      const before = JSON.stringify(input);
      kind.migrationChain!.migrate(input);
      expect(JSON.stringify(input)).toBe(before);
    }
  });
});

describe('P12-04 v1-only kinds (born versioned, no migration chain)', () => {
  it('lockfile: pre-Phase 11 golden (no trustLevel) still parses and round-trips', () => {
    const parsed = roundTripYaml(LockfileSchema, loadYaml('lock.v1.golden.yml'));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.packs[0]?.ref).toBe('stack/nextjs');
  });

  it('manifest: golden with legacy ownershipMode alias still parses and round-trips', () => {
    const parsed = roundTripJson(ManifestSchema, loadJson('manifest.v1.golden.json'));
    expect(parsed.revision).toBe(3);
    expect(parsed.entries[0]?.ownershipMode).toBe('managed');
  });

  for (const kind of versionedOnlyKinds) {
    it(`${kind.name}: current schema parses the persisted document`, () => {
      const parsed = kind.schema.parse(kind.oldestDoc) as { schemaVersion: number };
      expect(parsed.schemaVersion).toBe(1);
    });
  }

  it('unversioned documents are rejected for every v1-only kind (no legacy path)', () => {
    for (const kind of versionedOnlyKinds) {
      const unversioned = withoutSchemaVersion(kind.oldestDoc);
      // Version reader classifies a missing version as legacy v0...
      expect(readSchemaVersion(unversioned, kind.name)).toBe(0);
      // ...but no registrar accepts legacy for these kinds: MissingSchemaVersionError.
      const bare = new SchemaMigrations(kind.name, MAX_SUPPORTED_SCHEMA_VERSION);
      expect(() => bare.migrate(unversioned)).toThrow(MissingSchemaVersionError);
      // And the strict current parser rejects the unversioned shape outright.
      expectRejected(kind.schema, unversioned);
    }
  });
});

describe('P12-04 future-major rejection at the versioning layer', () => {
  it('every persisted kind rejects schemaVersion beyond the supported max', () => {
    const allKinds = [...chainedKinds, ...versionedOnlyKinds];
    for (const kind of allKinds) {
      for (const future of [2, 99]) {
        const doc = { ...kind.oldestDoc, schemaVersion: future };
        expect(() => assertSupportedVersion(readSchemaVersion(doc, kind.name))).toThrow(
          UnsupportedSchemaVersionError,
        );
        expectRejected(kind.schema, doc);
        if (kind.migrationChain) {
          expect(() => kind.migrationChain!.migrate(doc)).toThrow(UnsupportedSchemaVersionError);
        }
      }
    }
  });

  it('only one versioned format exists in this build (no older versioned majors)', () => {
    expect(MAX_SUPPORTED_SCHEMA_VERSION).toBe(SCHEMA_VERSION);
    expect(MAX_SUPPORTED_SCHEMA_VERSION).toBe(1);
  });

  it('non-object documents are rejected by the version reader', () => {
    for (const bad of [null, 'plain string', 42, true]) {
      expect(() => readSchemaVersion(bad, 'probe')).toThrow(MissingSchemaVersionError);
    }
  });

  it('v1-only documents with a stray legacy side effect are still lossless', () => {
    // round-trip stability across BOTH serialization formats for a v1-only doc
    const pack = roundTripYaml(PackSchema, versionedOnlyKinds[2]!.oldestDoc);
    expect(pack.schemaVersion).toBe(1);
    expect(roundTripJson(PackSchema, pack).ref).toBe('stack/nextjs');
  });
});

describe('P12-04 downgrade policy: engine-supported vs legacy-only', () => {
  it('engine exposes NO downgrade writer (nothing can lower schemaVersion)', () => {
    const proto = SchemaMigrations.prototype as unknown as Record<string, unknown>;
    expect(typeof proto.migrate).toBe('function');
    // The only public APIs are the registry reader/writer pair for upgrades.
    expect((proto as { downgrade?: unknown }).downgrade).toBeUndefined();
    // A current document is pinned to SCHEMA_VERSION; no step can emit v0.
    const migrated = PROJECT_MIGRATIONS.migrate(loadYaml('project.v0.legacy.yml'));
    expect(migrated).toMatchObject({ schemaVersion: 1 });
  });

  it('downgrade is legacy-only by design: the original v0 file remains the rollback artifact', () => {
    // The v0 -> v1 step is additive stamping (see migrations.ts) and `migrate()`
    // is pure, so the user's original unversioned file is untouched and remains
    // the only supported "older format": unversioned legacy. There is no
    // versioned format older than v1 to downgrade to, and the engine rejects
    // any unknown future doc rather than partially reading it.
    const legacy = loadYaml('state.v0.legacy.yml');
    const pristine = JSON.stringify(legacy);
    STATE_MIGRATIONS.migrate(legacy);
    expect(JSON.stringify(legacy)).toBe(pristine); // input preserved
    // An unversioned doc remains acceptable to an OLD build, but a v1 doc is
    // what every current persisted file must carry — pre-versioning builds
    // cannot consume v1 (they predate it). Documented in docs/10-engineering/
    // pilots.md; asserted here as the engine boundary.
    expect(() => assertSupportedVersion(1)).not.toThrow();
    expect(() => assertSupportedVersion(0)).not.toThrow(); // legacy still readable
    expect(() => assertSupportedVersion(2)).toThrow(UnsupportedSchemaVersionError);
  });
});
