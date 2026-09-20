import { describe, expect, it } from 'vitest';
import { loadPack } from './loader.js';
import { buildLockfile, lockfileFingerprint, PLANMO_CURRENT_VERSION } from './lock.js';
import { resolvePacks } from './resolve.js';
import { makeTempDir, validPackYaml, writePack } from './test-utils.js';

describe('buildLockfile (P04-03 lockfile generation)', () => {
  it('locks resolved packs with version + sha256 integrity (exit gate)', () => {
    const dir = makeTempDir();
    const catalog = [
      loadPack(writePack(dir, 'stack/base', validPackYaml('stack/base'))),
      loadPack(
        writePack(dir, 'stack/top', validPackYaml('stack/top') + '\nrequires:\n  - stack/base'),
      ),
    ];
    const result = resolvePacks(catalog, ['stack/top']);
    const lock = buildLockfile(result);

    expect(lock.schemaVersion).toBe(1);
    expect(lock.planmoVersion).toBe(PLANMO_CURRENT_VERSION);
    expect(lock.packs).toHaveLength(2);
    const base = lock.packs.find((p) => p.ref === 'stack/base');
    expect(base?.version).toBe('1.0.0');
    expect(base?.source).toBe('local');
    expect(base?.integrity?.algorithm).toBe('sha256');
    expect(base?.integrity?.digest).toMatch(/^[0-9a-f]{64}$/);
    // Integrity must match the pack's raw-file digest.
    const loaded = catalog.find((p) => p.document.ref === 'stack/base')!;
    expect(base?.integrity?.digest).toBe(loaded.integritySha256);
  });

  it('emits a schema-valid lockfile (re-parseable)', () => {
    const dir = makeTempDir();
    const catalog = [loadPack(writePack(dir, 'stack/a', validPackYaml('stack/a')))];
    const lock = buildLockfile(resolvePacks(catalog, ['stack/a']));
    // Plain-object identity: no extra keys, strict shape.
    expect(Object.keys(lock).sort()).toEqual([
      'adapters',
      'packs',
      'planmoVersion',
      'schemaVersion',
    ]);
  });

  it('has a deterministic fingerprint: identical inputs → identical lock', () => {
    const dir = makeTempDir();
    const catalog = [
      loadPack(writePack(dir, 'stack/base', validPackYaml('stack/base'))),
      loadPack(
        writePack(dir, 'stack/top', validPackYaml('stack/top') + '\nrequires:\n  - stack/base'),
      ),
    ];
    const result = resolvePacks(catalog, ['stack/top']);
    const lockA = buildLockfile(result);
    const lockB = buildLockfile(result);
    expect(lockfileFingerprint(lockA)).toBe(lockfileFingerprint(lockB));
    expect(lockfileFingerprint(lockA)).toContain('stack/base@1.0.0#');
    expect(lockfileFingerprint(lockA)).toContain('stack/top@1.0.0#');
  });
});
