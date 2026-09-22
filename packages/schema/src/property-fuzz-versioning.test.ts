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
import {
  HandoffSchema,
  MAX_SUPPORTED_SCHEMA_VERSION,
  ProjectConfigSchema,
  SCHEMA_VERSION,
  StateSchema,
} from './index.js';

/**
 * Property / fuzz tests for schema versioning (P12-02, P-VER).
 *
 * Properties under test (docs/02-architecture/schema-versioning.md):
 * - P-VER-1  Future-major and unknown schema versions are rejected with
 *            UnsupportedSchemaVersionError / MissingSchemaVersionError —
 *            never silently accepted, never migrated blindly.
 * - P-VER-2  Round-trip serialization is stable: valid documents survive
 *            JSON parse → stringify → parse with deep equality.
 * - P-VER-3  Per-document-kind legacy (v0) fixtures survive migration and
 *            re-serialization, and migration is idempotent.
 * All randomness is seeded (mulberry32); every fuzz value is deterministic.
 */

/** Deterministic 32-bit PRNG (mulberry32). Fixed seeds only. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

function loadYaml(name: string): Record<string, unknown> {
  return yamlParse(readFileSync(`${fixtures}${name}`, 'utf8')) as Record<string, unknown>;
}

const PICKS = {
  types: [
    'web-application',
    'cli',
    'library',
    'service',
    'mobile-application',
    'desktop-application',
    'other',
  ],
  lifecycles: ['greenfield', 'brownfield'],
  risks: ['low', 'medium', 'high'],
  styles: [
    'minimal',
    'editorial',
    'neobrutalism',
    'soft-product',
    'dense-dashboard',
    'developer-tool',
    'luxury',
    'playful',
  ],
  densities: ['compact', 'balanced', 'spacious'],
  accessibility: ['WCAG-2.2-A', 'WCAG-2.2-AA', 'WCAG-2.2-AAA'],
  depths: ['lean', 'standard', 'production', 'high-assurance', 'custom'],
  phaseModes: ['gated', 'continuous'],
  agents: ['opencode', 'claude-code', 'generic'],
} as const;

function pick<T>(rnd: () => number, items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)] as T;
}

/** A schema-valid project config with seeded-random field values. */
function genProject(rnd: () => number): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION,
    project: {
      name: pick(rnd, ['demo', 'proj-alpha', 'web-app', 'blog']),
      lifecycle: pick(rnd, PICKS.lifecycles),
      type: pick(rnd, PICKS.types),
      risk: pick(rnd, PICKS.risks),
    },
    planning: {
      depth: pick(rnd, PICKS.depths),
      phaseMode: pick(rnd, PICKS.phaseModes),
      freshSessionPerPhase: rnd() < 0.5,
    },
    agents: { primary: pick(rnd, PICKS.agents) },
    packs: rnd() < 0.5 ? ['stack/nextjs', 'design/minimal'] : [],
  };
  if (rnd() < 0.4) {
    doc.design = {
      style: pick(rnd, PICKS.styles),
      density: pick(rnd, PICKS.densities),
      accessibility: pick(rnd, PICKS.accessibility),
    };
  }
  if (rnd() < 0.3) {
    doc.stack = {
      frontend: pick(rnd, ['react', 'vue']),
      language: pick(rnd, ['ts', 'rust']),
    };
  }
  if (rnd() < 0.3) {
    doc.extensions = { team: pick(rnd, ['platform', 'web']), tags: ['a', 'b'] };
  }
  return doc;
}

/** Round-trip a parsed document through JSON three times; must stay equal. */
function jsonRoundTripStable(value: unknown): void {
  const first = JSON.parse(JSON.stringify(value)) as unknown;
  const second = JSON.parse(JSON.stringify(first)) as unknown;
  const third = JSON.parse(JSON.stringify(second)) as unknown;
  expect(second).toEqual(first);
  expect(third).toEqual(first);
}

describe('P-VER-1 future-major and unknown versions are rejected', () => {
  it('table: every version above MAX_SUPPORTED_SCHEMA_VERSION throws', () => {
    expect(MAX_SUPPORTED_SCHEMA_VERSION).toBe(SCHEMA_VERSION);
    const futures = [
      MAX_SUPPORTED_SCHEMA_VERSION + 1,
      MAX_SUPPORTED_SCHEMA_VERSION + 2,
      99,
      1000,
      2 ** 24,
    ];
    for (const v of futures) {
      try {
        assertSupportedVersion(v);
        throw new Error(`v${v} must be rejected`);
      } catch (err) {
        expect(err).toBeInstanceOf(UnsupportedSchemaVersionError);
        const e = err as UnsupportedSchemaVersionError;
        expect(e.found).toBe(v);
        expect(e.max).toBe(MAX_SUPPORTED_SCHEMA_VERSION);
      }
    }
    expect(() => assertSupportedVersion(0)).not.toThrow();
    expect(() => assertSupportedVersion(MAX_SUPPORTED_SCHEMA_VERSION)).not.toThrow();
  });

  it('60 seeded iterations: huge/fuzzed future versions are never accepted', () => {
    const rnd = mulberry32(0xf00d);
    for (let i = 0; i < 60; i += 1) {
      const v = 1 + Math.floor(rnd() * 2 ** 20) + Math.floor(rnd() * 2 ** 20);
      const isFuture = v > MAX_SUPPORTED_SCHEMA_VERSION;
      if (isFuture) {
        expect(() => assertSupportedVersion(v), `v${v}`).toThrow(UnsupportedSchemaVersionError);
      } else {
        expect(() => assertSupportedVersion(v)).not.toThrow();
      }
      // Migrating a future-versioned document must throw, not silently migrate.
      if (isFuture) {
        expect(() => PROJECT_MIGRATIONS.migrate({ schemaVersion: v, project: {} })).toThrow(
          UnsupportedSchemaVersionError,
        );
      }
    }
  });

  it('75 seeded readSchemaVersion iterations match the version-reading contract exactly', () => {
    const rnd = mulberry32(0xabc);

    function oracle(value: unknown): { v: number } | { err: 'missing' } {
      if (typeof value !== 'object' || value === null) return { err: 'missing' };
      const raw = (value as Record<string, unknown>)['schemaVersion'];
      if (raw === undefined) return { v: 0 };
      const n = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return { err: 'missing' };
      return { v: n };
    }

    for (let i = 0; i < 75; i += 1) {
      const mode = i % 5;
      let value: unknown;
      if (mode === 0) value = { schemaVersion: String(Math.floor(rnd() * 120)) };
      else if (mode === 1)
        value = { schemaVersion: Math.floor(rnd() * 120) - (rnd() < 0.2 ? 40 : 0) };
      else if (mode === 2)
        value = { schemaVersion: pick(rnd, ['', 'abc', '1.5', '12x', ' 3', '3 ', '-4']) };
      else if (mode === 3)
        value = pick(rnd, [null, undefined, 7, '7', ['schemaVersion'], { schemaVersion: {} }]);
      else
        value = {
          schemaVersion: pick(rnd, [
            true,
            false,
            {},
            [],
            2.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
          ]),
        };

      const expected = oracle(value);
      let outcome: { v: number } | { err: 'missing' };
      try {
        outcome = { v: readSchemaVersion(value, 'probe') };
      } catch (err) {
        expect(err).toBeInstanceOf(MissingSchemaVersionError);
        outcome = { err: 'missing' };
      }
      expect(outcome, `iteration ${i} value=${JSON.stringify(value)}`).toEqual(expected);
    }
  });
});

describe('P-VER-2 round-trip serialization is stable', () => {
  it('golden v1 fixtures survive 3× JSON round trips', () => {
    const project = ProjectConfigSchema.parse(loadYaml('project.v1.golden.yml'));
    const state = StateSchema.parse(loadYaml('state.v1.golden.yml'));
    jsonRoundTripStable(project);
    jsonRoundTripStable(state);
    expect(ProjectConfigSchema.safeParse(JSON.parse(JSON.stringify(project))).success).toBe(true);
    expect(StateSchema.safeParse(JSON.parse(JSON.stringify(state))).success).toBe(true);
  });

  it('80 seeded fuzz-valid project configs round-trip with deep equality', () => {
    const rnd = mulberry32(0x4711);
    for (let i = 0; i < 80; i += 1) {
      const raw = genProject(rnd);
      const parsed = ProjectConfigSchema.parse(structuredClone(raw));
      const again = ProjectConfigSchema.parse(
        JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>,
      );
      expect(again).toEqual(parsed);
      jsonRoundTripStable(parsed);
      // Deterministic: identical raw inputs parse to identical documents.
      expect(ProjectConfigSchema.parse(structuredClone(raw))).toEqual(parsed);
    }
  });

  it('negative: JSON round trips never strip or add fields', () => {
    const rnd = mulberry32(0x2026);
    for (let i = 0; i < 20; i += 1) {
      const parsed = ProjectConfigSchema.parse(genProject(rnd)) as Record<string, unknown>;
      const keys = Object.keys(parsed).sort();
      const re = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
      expect(Object.keys(re).sort()).toEqual(keys);
    }
  });
});

describe('P-VER-3 per-document-kind legacy fixtures survive re-serialization', () => {
  it('project v0 legacy fixture migrates, re-serializes, and re-migrates idempotently', () => {
    const migrated = PROJECT_MIGRATIONS.migrate(loadYaml('project.v0.legacy.yml')) as Record<
      string,
      unknown
    >;
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    const parsed = ProjectConfigSchema.parse(migrated);
    jsonRoundTripStable(parsed);
    // Idempotent migration: migrating the v1 output changes nothing.
    expect(PROJECT_MIGRATIONS.migrate(parsed as unknown as Record<string, unknown>)).toEqual(
      migrated,
    );
    // User-owned extension data survives verbatim.
    expect(parsed.extensions).toEqual({ team: 'platform', tags: ['a', 'b'] });
  });

  it('state v0 legacy fixture migrates, re-serializes, and re-migrates idempotently', () => {
    const migrated = STATE_MIGRATIONS.migrate(loadYaml('state.v0.legacy.yml')) as Record<
      string,
      unknown
    >;
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    const parsed = StateSchema.parse(migrated);
    jsonRoundTripStable(parsed);
    expect(STATE_MIGRATIONS.migrate(parsed as unknown as Record<string, unknown>)).toEqual(
      migrated,
    );
  });

  it('handoff v0 legacy document migrates and survives re-serialization', () => {
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
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    const parsed = HandoffSchema.parse(migrated);
    jsonRoundTripStable(parsed);
    // Idempotency on the v1 shape: migrating the parsed document changes nothing.
    const again = HANDOFF_MIGRATIONS.migrate(parsed as unknown as Record<string, unknown>);
    expect(HANDOFF_MIGRATIONS.migrate(again)).toEqual(again);
  });

  it('negative: unknown future versions on legacy kinds are rejected, not migrated', () => {
    const doc = loadYaml('project.v0.legacy.yml');
    doc.schemaVersion = MAX_SUPPORTED_SCHEMA_VERSION + 1;
    expect(() => PROJECT_MIGRATIONS.migrate(doc)).toThrow(UnsupportedSchemaVersionError);
  });

  it('negative: a versionless document with no registered v0 step is rejected', () => {
    const m = new SchemaMigrations<unknown>('probe', 1);
    expect(() => m.migrate({ name: 'legacy' })).toThrow(MissingSchemaVersionError);
  });
});
