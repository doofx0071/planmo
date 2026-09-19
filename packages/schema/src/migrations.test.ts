import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as yamlParse } from 'yaml';
import {
  assertSupportedVersion,
  MissingSchemaVersionError,
  readSchemaVersion,
  SchemaMigrations,
  UnsupportedSchemaVersionError,
} from './schema-versioning.js';
import { HANDOFF_MIGRATIONS, PROJECT_MIGRATIONS, STATE_MIGRATIONS } from './migrations.js';
import { HandoffSchema, ProjectConfigSchema, StateSchema } from './index.js';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

function loadYaml(name: string): Record<string, unknown> {
  return yamlParse(readFileSync(`${fixtures}${name}`, 'utf8')) as Record<string, unknown>;
}

describe('schema version reading', () => {
  it('reads an integer schemaVersion', () => {
    expect(readSchemaVersion({ schemaVersion: 1 }, 'x')).toBe(1);
    expect(readSchemaVersion({ schemaVersion: '2' }, 'x')).toBe(2);
  });

  it('treats a missing schemaVersion as legacy v0', () => {
    expect(readSchemaVersion({ name: 'x' }, 'x')).toBe(0);
  });

  it('rejects non-numeric or negative versions', () => {
    expect(() => readSchemaVersion({ schemaVersion: 'abc' }, 'x')).toThrow(
      MissingSchemaVersionError,
    );
    expect(() => readSchemaVersion({ schemaVersion: -1 }, 'x')).toThrow(MissingSchemaVersionError);
    expect(() => readSchemaVersion(null, 'x')).toThrow(MissingSchemaVersionError);
  });

  it('rejects unsupported future major versions', () => {
    expect(() => assertSupportedVersion(2)).toThrow(UnsupportedSchemaVersionError);
    expect(() => assertSupportedVersion(99)).toThrow(UnsupportedSchemaVersionError);
    expect(() => assertSupportedVersion(1)).not.toThrow();
    expect(() => assertSupportedVersion(0)).not.toThrow();
  });
});

describe('SchemaMigrations framework', () => {
  it('migrates a legacy v0 document via the registered v0 step', () => {
    const m = new SchemaMigrations<unknown>('probe', 2)
      .acceptsLegacy((doc: Record<string, unknown>) => ({ ...doc, schemaVersion: 1 }))
      .add(1, (doc: Record<string, unknown>) => ({ ...doc, schemaVersion: 2, marker: 'v2' }));
    const out = m.migrate({ name: 'legacy' }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(2);
    expect(out.marker).toBe('v2');
  });

  it('throws when no legacy step is registered', () => {
    const m = new SchemaMigrations<unknown>('probe', 1);
    expect(() => m.migrate({ name: 'legacy' })).toThrow(MissingSchemaVersionError);
  });

  it('throws when a migration chain has a gap', () => {
    const m = new SchemaMigrations<unknown>('probe', 3)
      .acceptsLegacy((doc: Record<string, unknown>) => ({ ...doc, schemaVersion: 1 }))
      .add(1, (doc: Record<string, unknown>) => ({ ...doc, schemaVersion: 2 }));
    expect(() => m.migrate({ name: 'x' })).toThrow(/no migration path v2/);
  });
});

describe('project v0 -> v1 migration (fixture-covered)', () => {
  it('stamps schemaVersion 1 onto legacy project documents', () => {
    const migrated = PROJECT_MIGRATIONS.migrate(loadYaml('project.v0.legacy.yml'));
    expect((migrated as Record<string, unknown>).schemaVersion).toBe(1);
    expect(() => ProjectConfigSchema.parse(migrated)).not.toThrow();
  });

  it('re-read idempotency: migrating an already-v1 document is stable', () => {
    const once = PROJECT_MIGRATIONS.migrate(loadYaml('project.v0.legacy.yml'));
    const twice = PROJECT_MIGRATIONS.migrate(once as Record<string, unknown>);
    expect(twice).toEqual(once);
  });

  it('preserves supported user extension fields', () => {
    const migrated = PROJECT_MIGRATIONS.migrate(loadYaml('project.v0.legacy.yml')) as Record<
      string,
      unknown
    >;
    // legacy fixture carries `extensions: { team: platform, tags: [a, b] }`
    expect(migrated.extensions).toEqual({ team: 'platform', tags: ['a', 'b'] });
    const parsed = ProjectConfigSchema.parse(migrated);
    expect(parsed.extensions).toEqual({ team: 'platform', tags: ['a', 'b'] });
  });

  it('rejects future major versions with a clear diagnostic', () => {
    const v99 = loadYaml('project.v0.legacy.yml');
    v99.schemaVersion = 99;
    expect(() => PROJECT_MIGRATIONS.migrate(v99)).toThrow(UnsupportedSchemaVersionError);
  });
});

describe('state v0 -> v1 migration (fixture-covered)', () => {
  it('migrates legacy state documents and parses as v1', () => {
    const migrated = STATE_MIGRATIONS.migrate(loadYaml('state.v0.legacy.yml'));
    expect((migrated as Record<string, unknown>).schemaVersion).toBe(1);
    expect(() => StateSchema.parse(migrated)).not.toThrow();
  });
});

describe('handoff v0 -> v1 migration', () => {
  it('migrates legacy handoffs and parses as v1', () => {
    const legacy = {
      phase: '00',
      status: 'COMPLETE',
      completedTasks: ['P00-01'],
      materialChanges: [],
      testsRun: [],
      securityFindings: [],
      decisions: [],
      knownDebt: [],
      nextPhase: '01',
    };
    const migrated = HANDOFF_MIGRATIONS.migrate(legacy) as Record<string, unknown>;
    expect(migrated.schemaVersion).toBe(1);
    expect(() => HandoffSchema.parse(migrated)).not.toThrow();
  });
});
