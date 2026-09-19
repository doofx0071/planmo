import { describe, expect, it } from 'vitest';
import { expectRejected, roundTripJson, roundTripYaml } from './test-utils.js';
import { LockfileSchema, ManifestSchema, StateSchema } from './state-lock-manifest.js';

describe('StateSchema (state.yml)', () => {
  const valid = {
    schemaVersion: 1,
    currentPhase: '02',
    status: 'active',
    completedPhases: ['00', '01'],
    blockedTasks: [],
    nextPrompt: 'prompts/03-phase-02-canonical-project-model-and-schemas.md',
  };

  it('parses the canonical operational state document', () => {
    const parsed = StateSchema.parse(valid);
    expect(parsed.currentPhase).toBe('02');
    expect(parsed.completedPhases).toEqual(['00', '01']);
  });

  it('round-trips through JSON and YAML', () => {
    const json = roundTripJson(StateSchema, valid);
    const yaml = roundTripYaml(StateSchema, valid);
    expect(json).toEqual(yaml);
  });

  it("parses the repo's own .planmo/state.yml shape", () => {
    const repoState = {
      schemaVersion: 1,
      currentPhase: '02',
      status: 'planned',
      completedPhases: ['00', '01'],
      blockedTasks: [],
      nextPrompt: 'prompts/03-phase-02-canonical-project-model-and-schemas.md',
    };
    expect(() => StateSchema.parse(repoState)).not.toThrow();
  });

  it('accepts a per-task status snapshot', () => {
    const parsed = StateSchema.parse({
      ...valid,
      tasks: { 'P02-01': 'IN_PROGRESS', 'P02-05': 'TODO' },
    });
    expect(parsed.tasks?.['P02-01']).toBe('IN_PROGRESS');
  });

  it('rejects an unknown top-level field', () => {
    expectRejected(StateSchema, { ...valid, oops: 1 }, 'Unrecognized key');
  });

  it('rejects invalid task statuses', () => {
    expectRejected(StateSchema, { ...valid, tasks: { 'P02-01': 'SOMEDAY' } });
  });
});

describe('LockfileSchema (lock.yml)', () => {
  const valid = {
    schemaVersion: 1,
    planmoVersion: '0.0.0',
    packs: [
      {
        ref: 'stack/nextjs',
        name: 'Next.js Stack Pack',
        version: '1.2.3',
        source: 'registry',
        integrity: {
          algorithm: 'sha256',
          digest: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        },
      },
    ],
    adapters: [{ id: 'opencode', version: '1.0.0', source: 'registry' }],
  };

  it('parses and round-trips a lock with integrity data', () => {
    const parsed = roundTripYaml(LockfileSchema, valid);
    expect(parsed.packs[0]?.integrity?.algorithm).toBe('sha256');
  });

  it('rejects a non-semver planmo version', () => {
    expectRejected(LockfileSchema, { ...valid, planmoVersion: 'latest' });
  });

  it('rejects invalid checksum hex', () => {
    expectRejected(
      LockfileSchema,
      {
        ...valid,
        packs: [{ ...valid.packs[0], integrity: { algorithm: 'sha256', digest: 'zzz' } }],
      },
      'digest',
    );
  });

  it('rejects unknown pack lock fields', () => {
    expectRejected(
      LockfileSchema,
      { ...valid, packs: [{ ...valid.packs[0], registry: 'https://x.invalid' }] },
      'Unrecognized key',
    );
  });
});

describe('ManifestSchema (manifest.json)', () => {
  const valid = {
    schemaVersion: 1,
    revision: 3,
    entries: [
      {
        path: 'docs/planning/ROADMAP.md',
        kind: 'planning-doc',
        generator: 'planmo 0.0.0',
        sources: ['stack/nextjs'],
        checksum: {
          algorithm: 'sha256',
          digest: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        },
        ownershipMode: 'managed',
        generationVersion: '0.0.0',
      },
    ],
  };

  it('parses and round-trips manifest entries', () => {
    const parsed = roundTripJson(ManifestSchema, valid);
    expect(parsed.entries[0]?.ownershipMode).toBe('managed');
  });

  it('rejects an unknown artifact kind', () => {
    expectRejected(ManifestSchema, {
      ...valid,
      entries: [{ ...valid.entries[0], kind: 'binary' }],
    });
  });

  it('rejects an unsupported ownership mode', () => {
    expectRejected(ManifestSchema, {
      ...valid,
      entries: [{ ...valid.entries[0], ownershipMode: 'stolen' }],
    });
  });

  it('rejects entries without a checksum', () => {
    const { checksum, ...entry } = valid.entries[0]!;
    expectRejected(ManifestSchema, { ...valid, entries: [entry] });
  });
});
