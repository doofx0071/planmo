import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ManifestSchema,
  ProjectConfigSchema,
  type PackLockEntryType,
  type ProjectConfig,
} from '@planmo/schema';
import { buildIr, type IrInput, type PlanningIR } from './ir.js';
import {
  buildGenerationManifest,
  GENERATOR_ID,
  INPUT_LINEAGE_PREFIX,
  PACK_LINEAGE_PREFIX,
  toPersistableManifest,
} from './manifest.js';
import type { GeneratedArtifact } from './contracts.js';

/** Minimal validated project config (mirrors ir.test.ts). */
function project(): ProjectConfig {
  return ProjectConfigSchema.parse({
    schemaVersion: 1,
    project: {
      name: 'demo',
      lifecycle: 'greenfield',
      type: 'web-application',
      risk: 'medium',
    },
    planning: { depth: 'standard', phaseMode: 'gated', freshSessionPerPhase: true },
    agents: { primary: 'opencode' },
    packs: [],
  });
}

const alphaPack: PackLockEntryType = {
  ref: 'stack/alpha',
  name: 'alpha',
  version: '2.1.0',
  source: 'local',
  integrity: { algorithm: 'sha256', digest: 'a'.repeat(64) },
};

const zetaPack: PackLockEntryType = {
  ref: 'design/zeta',
  name: 'zeta',
  version: '1.0.0',
  source: 'local',
  integrity: { algorithm: 'sha256', digest: 'b'.repeat(64) },
};

/** Deterministic IR with two locked packs (mirrors ir.test.ts helpers). */
function makeIr(packs: readonly PackLockEntryType[] = [alphaPack, zetaPack]): PlanningIR {
  return buildIr({
    project: project(),
    resolution: { packs: [], order: [], diagnostics: [], ok: true },
    lockfile: { planmoVersion: '0.0.0', packs },
    profile: null,
    standards: { rules: [], conflicts: [], sources: [] },
  });
}

/** A valid generated artifact; override any field per test. */
function artifact(overrides: Partial<GeneratedArtifact> = {}): GeneratedArtifact {
  return {
    path: 'planning/ROADMAP.md',
    content: '# Roadmap demo\n',
    kind: 'planning-doc',
    ownership: 'generated',
    sources: ['std/planning'],
    ...overrides,
  };
}

describe('buildGenerationManifest (P05-03 generation manifest & checksums)', () => {
  it('computes sha256 known vectors for artifact content', () => {
    const contentByPath = new Map([
      ['a.txt', 'abc'],
      ['b.txt', ''],
      ['c.txt', 'hello world'],
    ]);
    const { entries } = buildGenerationManifest(
      [
        artifact({ path: 'a.txt', content: 'abc' }),
        artifact({ path: 'b.txt', content: '' }),
        artifact({ path: 'c.txt', content: 'hello world' }),
      ],
      makeIr(),
    );
    const byPath = new Map(entries.map((e) => [e.path, e.checksum]));
    expect(byPath.get('a.txt')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(byPath.get('b.txt')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(byPath.get('c.txt')).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
    // Cross-check every entry against node:crypto directly — no helper drift.
    for (const entry of entries) {
      const content = contentByPath.get(entry.path) ?? '';
      expect(entry.checksum).toBe(createHash('sha256').update(content, 'utf8').digest('hex'));
    }
  });

  it('fills generator, kind, ownership, and generationVersion from the inputs', () => {
    const { entries } = buildGenerationManifest(
      [artifact({ path: 'planmo.config.json', kind: 'config', ownership: 'seeded' })],
      makeIr(),
    );
    expect(entries[0]?.generator).toBe(GENERATOR_ID);
    expect(entries[0]?.kind).toBe('config');
    expect(entries[0]?.ownershipMode).toBe('seeded');
    expect(entries[0]?.generationVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('uses ir.lockfile.planmoVersion for generationVersion when the IR carries it', () => {
    // P05-06/07 lineage: once the IR carries the lockfile its planmoVersion is
    // authoritative. The frozen PlanningIR has no such field yet, so the test
    // overrides it to pin the intended behavior.
    const ir = {
      ...makeIr(),
      lockfile: { planmoVersion: '1.2.3-beta.1' },
    } as unknown as PlanningIR;
    const { entries } = buildGenerationManifest([artifact({ path: 'a.txt' })], ir);
    expect(entries[0]?.generationVersion).toBe('1.2.3-beta.1');
  });

  it('sorts entries by path and is byte-identical across builds', () => {
    const artifacts = [
      artifact({ path: 'z/last.txt', content: 'z' }),
      artifact({ path: 'a/first.txt', content: 'a' }),
      artifact({ path: 'm/mid.txt', content: 'm' }),
    ];
    const first = buildGenerationManifest(artifacts, makeIr());
    const reversed = buildGenerationManifest([...artifacts].reverse(), makeIr());
    expect(first.entries.map((e) => e.path)).toEqual(['a/first.txt', 'm/mid.txt', 'z/last.txt']);
    expect(reversed).toEqual(first);
    expect(JSON.stringify(reversed.document)).toBe(JSON.stringify(first.document));
    expect(reversed.entries).toBe(reversed.document.entries);
  });

  it('starts revision at 0 for a first build and carries the manifest schema version', () => {
    const { document } = buildGenerationManifest([artifact({ path: 'a.txt' })], makeIr());
    expect(document.schemaVersion).toBe(1);
    expect(document.revision).toBe(0);
    expect(document.entries).toHaveLength(1);
  });

  it('traces every entry to the input model and locked packs via lineage markers', () => {
    const ir = makeIr();
    const { entries } = buildGenerationManifest(
      [
        artifact({ path: 'b.txt', sources: ['std/planning'] }),
        artifact({ path: 'a.txt', sources: ['design/tokens'] }),
      ],
      ir,
    );
    for (const entry of entries) {
      // Renderer-declared sources come first, unchanged.
      expect(entry.sources[0]).toBe(entry.path === 'a.txt' ? 'design/tokens' : 'std/planning');
      // Lineage: the input-model snapshot plus every locked pack.
      expect(entry.sources).toContain(`${INPUT_LINEAGE_PREFIX}${ir.inputHash}`);
      expect(entry.sources).toContain(`${PACK_LINEAGE_PREFIX}stack/alpha@2.1.0`);
      expect(entry.sources).toContain(`${PACK_LINEAGE_PREFIX}design/zeta@1.0.0`);
      // Lineage markers are total-ordered: input first, then packs by marker.
      const packMarkers = entry.sources.filter((s) => s.startsWith(PACK_LINEAGE_PREFIX));
      expect(packMarkers).toEqual([
        `${PACK_LINEAGE_PREFIX}design/zeta@1.0.0`,
        `${PACK_LINEAGE_PREFIX}stack/alpha@2.1.0`,
      ]);
      expect(entry.sources.indexOf(`${INPUT_LINEAGE_PREFIX}${ir.inputHash}`)).toBeLessThan(
        entry.sources.indexOf(packMarkers[0] ?? ''),
      );
    }
  });

  it('produces identical lineage for the same locked packs in any input order', () => {
    const artifacts = [artifact({ path: 'a.txt' })];
    const ordered = buildGenerationManifest(artifacts, makeIr([alphaPack, zetaPack]));
    const reversed = buildGenerationManifest(artifacts, makeIr([zetaPack, alphaPack]));
    expect(reversed.entries).toEqual(ordered.entries);
    expect(reversed.document).toEqual(ordered.document);
  });

  it('produces an empty, valid manifest for zero artifacts', () => {
    const { document, entries } = buildGenerationManifest([], makeIr());
    expect(entries).toEqual([]);
    expect(document.entries).toEqual([]);
    expect(document.revision).toBe(0);
  });

  it('round-trips through ManifestSchema when checksums are mapped to the persisted shape', () => {
    const ir = makeIr();
    const { document } = buildGenerationManifest(
      [artifact({ path: 'b.txt' }), artifact({ path: 'a.txt', content: 'abc' })],
      ir,
    );
    // In-memory view keeps the hex-string checksum per the frozen contract...
    expect(document.entries[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
    // ...which the strict schema rejects as-is.
    expect(() => ManifestSchema.parse(document)).toThrow();
    // The persistence mapping adapts hex → {algorithm, digest} and round-trips.
    const parsed = ManifestSchema.parse(toPersistableManifest(document));
    expect(parsed.revision).toBe(0);
    expect(parsed.entries.map((e) => e.path)).toEqual(['a.txt', 'b.txt']);
    expect(parsed.entries[0]?.checksum).toEqual({
      algorithm: 'sha256',
      digest: document.entries[0]?.checksum,
    });
    expect(parsed.entries[0]?.generator).toBe(GENERATOR_ID);
    expect(parsed.entries[0]?.generationVersion).toBe('0.0.0');
  });
});

describe('buildGenerationManifest rejects malformed inputs (negative cases)', () => {
  it('rejects non-array artifacts and missing IR', () => {
    expect(() => buildGenerationManifest(undefined as never, makeIr())).toThrow(
      /artifacts must be an array/,
    );
    expect(() => buildGenerationManifest([], undefined as never)).toThrow(/ir must be an object/);
  });

  it('rejects artifacts with missing, empty, absolute, or traversing paths', () => {
    const ir = makeIr();
    const pathless = {
      content: 'x',
      kind: 'planning-doc',
      ownership: 'generated',
      sources: [],
    } as never;
    expect(() => buildGenerationManifest([pathless], ir)).toThrow(/path/);
    expect(() => buildGenerationManifest([artifact({ path: '   ' })], ir)).toThrow(/path/);
    expect(() => buildGenerationManifest([artifact({ path: 'dir\\file.md' })], ir)).toThrow(
      /forward slashes/,
    );
    expect(() => buildGenerationManifest([artifact({ path: '/etc/passwd' })], ir)).toThrow(
      /repo-relative/,
    );
    expect(() => buildGenerationManifest([artifact({ path: '../secret.md' })], ir)).toThrow(/\.\./);
  });

  it('rejects artifacts with non-string content', () => {
    const bad = { ...artifact(), content: 42 } as unknown as GeneratedArtifact;
    expect(() => buildGenerationManifest([bad], makeIr())).toThrow(/content/);
  });

  it('rejects unknown kinds and ownership modes', () => {
    const ir = makeIr();
    expect(() => buildGenerationManifest([artifact({ kind: 'binary' as never })], ir)).toThrow(
      /kind/,
    );
    expect(() => buildGenerationManifest([artifact({ ownership: 'admin' as never })], ir)).toThrow(
      /ownership/,
    );
  });

  it('rejects malformed sources arrays', () => {
    const ir = makeIr();
    const notArray = { ...artifact(), sources: 'oops' } as unknown as GeneratedArtifact;
    expect(() => buildGenerationManifest([notArray], ir)).toThrow(/sources/);
    expect(() =>
      buildGenerationManifest([artifact({ sources: ['std/planning', ''] })], ir),
    ).toThrow(/source/);
  });

  it('rejects duplicate artifact paths', () => {
    expect(() =>
      buildGenerationManifest(
        [artifact({ path: 'a.txt' }), artifact({ path: 'a.txt', content: 'other' })],
        makeIr(),
      ),
    ).toThrow(/duplicate/);
  });

  it('rejects an IR with an invalid inputHash or lockfile version', () => {
    const ir = makeIr();
    expect(() => buildGenerationManifest([artifact()], { ...ir, inputHash: 'not-a-hash' })).toThrow(
      /inputHash/,
    );
    const badLock = { ...ir, lockfile: { planmoVersion: 'nope' } } as unknown as PlanningIR;
    expect(() => buildGenerationManifest([artifact()], badLock)).toThrow(/SemVer/);
  });

  it('rejects locked packs without refs or versions', () => {
    const ir = makeIr();
    const noRef = { ...ir, lockedPacks: [{ ref: '', version: '1.0.0' } as never] };
    const noVersion = { ...ir, lockedPacks: [{ ref: 'stack/x', version: ' ' } as never] };
    expect(() => buildGenerationManifest([artifact()], noRef)).toThrow(/ref/);
    expect(() => buildGenerationManifest([artifact()], noVersion)).toThrow(/version/);
  });
});
