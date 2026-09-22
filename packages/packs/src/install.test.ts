import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LockfileSchema, type LockfileDocument } from '@planmo/schema';
import { describe, expect, it } from 'vitest';
import { loadPack } from './loader.js';
import { buildLockfile, lockfileFingerprint } from './lock.js';
import { lockFromResolution, planLockDiff, verifyLockIntegrity } from './install.js';
import { makeTempDir, validPackYaml, writePack } from './test-utils.js';
import { resolvePacks } from './resolve.js';

/** Build a lock through the real pipeline: load → resolve → buildLockfile. */
function resolveToLock(
  dir: string,
  refs: string[],
  packYamls: Record<string, string>,
): LockfileDocument {
  const catalog = Object.entries(packYamls).map(([ref, yaml]) =>
    loadPack(writePack(dir, ref, yaml)),
  );
  return buildLockfile(resolvePacks(catalog, refs));
}

describe('planLockDiff (P11-03 install/update plans)', () => {
  it('empty → non-empty lock: added rows, reversible, sorted diff lines', () => {
    const dir = makeTempDir();
    const to = resolveToLock(dir, ['stack/base', 'stack/top'], {
      'stack/base': validPackYaml('stack/base'),
      'stack/top': validPackYaml('stack/top'),
    });

    const plan = planLockDiff(null, to);
    expect(plan.reversible).toBe(true);
    expect(plan.rows.map((r) => r.ref)).toEqual(['stack/base', 'stack/top']);
    expect(plan.rows.every((r) => r.action === 'added')).toBe(true);
    expect(plan.rows.every((r) => r.from === undefined && r.to?.version === '1.0.0')).toBe(true);
    expect(plan.diff).toBe('+stack/base@1.0.0\n+stack/top@1.0.0');
  });

  it('removed pack: removed row with source version + digest, rendered -ref@v', () => {
    const dir = makeTempDir();
    const from = resolveToLock(dir, ['stack/base', 'stack/top'], {
      'stack/base': validPackYaml('stack/base'),
      'stack/top': validPackYaml('stack/top'),
    });
    const to = resolveToLock(dir, ['stack/base'], { 'stack/base': validPackYaml('stack/base') });

    const plan = planLockDiff(from, to);
    expect(plan.rows.find((r) => r.ref === 'stack/base')?.action).toBe('unchanged');
    const removed = plan.rows.filter((r) => r.action === 'removed');
    expect(removed).toHaveLength(1);
    const row = removed[0]!;
    expect(row.ref).toBe('stack/top');
    expect(row.action).toBe('removed');
    expect(row.from?.version).toBe('1.0.0');
    expect(row.from?.integrity).toMatch(/^[0-9a-f]{64}$/);
    expect(row.to).toBeUndefined();
    expect(plan.diff).toBe('-stack/top@1.0.0');
  });

  it('version bump: updated row carrying from/to, rendered ~ref@v1 => v2', () => {
    const dir = makeTempDir();
    const packDir = writePack(dir, 'stack/a', validPackYaml('stack/a', 'stack', '1.0.0'));
    const from = buildLockfile(resolvePacks([loadPack(packDir)], ['stack/a']));
    const packDir2 = writePack(dir, 'stack/a', validPackYaml('stack/a', 'stack', '1.1.0'));
    const to = buildLockfile(resolvePacks([loadPack(packDir2)], ['stack/a']));

    const plan = planLockDiff(from, to);
    expect(plan.rows).toHaveLength(1);
    const row = plan.rows[0]!;
    expect(row.action).toBe('updated');
    expect(row.from?.version).toBe('1.0.0');
    expect(row.to?.version).toBe('1.1.0');
    expect(plan.diff).toBe('~stack/a@1.0.0 => 1.1.0');
  });

  it('identical locks: all rows unchanged, empty diff, equal fingerprints', () => {
    const dir = makeTempDir();
    const yamls = {
      'stack/base': validPackYaml('stack/base'),
      'stack/top': validPackYaml('stack/top'),
    };
    const from = resolveToLock(dir, ['stack/base', 'stack/top'], yamls);
    const to = resolveToLock(dir, ['stack/base', 'stack/top'], yamls);

    const plan = planLockDiff(from, to);
    expect(plan.reversible).toBe(true);
    expect(plan.rows.every((r) => r.action === 'unchanged')).toBe(true);
    expect(plan.rows.every((r) => r.from?.version === '1.0.0' && r.to?.version === '1.0.0')).toBe(
      true,
    );
    expect(plan.diff).toBe('');
    expect(lockfileFingerprint(from)).toBe(lockfileFingerprint(to));
  });

  it('content drift under the same version: updated row, never silent', () => {
    const dir = makeTempDir();
    const packDir = writePack(
      dir,
      'stack/a',
      validPackYaml('stack/a', 'stack', '1.0.0', 'content:\n  flavor: vanilla'),
    );
    const from = buildLockfile(resolvePacks([loadPack(packDir)], ['stack/a']));
    const packDir2 = writePack(
      dir,
      'stack/a',
      validPackYaml('stack/a', 'stack', '1.0.0', 'content:\n  flavor: chocolate'),
    );
    const to = buildLockfile(resolvePacks([loadPack(packDir2)], ['stack/a']));

    const plan = planLockDiff(from, to);
    expect(plan.rows).toHaveLength(1);
    const row = plan.rows[0]!;
    expect(row.action).toBe('updated');
    expect(row.from?.version).toBe(row.to?.version);
    expect(row.from?.integrity).not.toBe(row.to?.integrity);
    expect(plan.diff).toBe('~stack/a@1.0.0 => 1.0.0');
  });

  it('deterministic: same input → identical plans and diffs', () => {
    const dir = makeTempDir();
    const to = resolveToLock(dir, ['stack/base', 'stack/top'], {
      'stack/base': validPackYaml('stack/base'),
      'stack/top': validPackYaml('stack/top'),
    });

    const planA = planLockDiff(null, to);
    const planB = planLockDiff(null, to);
    expect(planA).toEqual(planB);
    expect(planA.diff).toBe(planB.diff);
  });
});

describe('verifyLockIntegrity (P11-03 checksums)', () => {
  it('passes when every recorded digest matches the actual resolved content', async () => {
    const dir = makeTempDir();
    const lock = buildLockfile(
      resolvePacks([loadPack(writePack(dir, 'stack/a', validPackYaml('stack/a')))], ['stack/a']),
    );
    const rawByRef = new Map(
      lock.packs.map((entry) => [
        entry.ref,
        readFileSync(join(dir, entry.ref, 'pack.yml'), 'utf8'),
      ]),
    );

    const result = await verifyLockIntegrity(lock, (entry) =>
      Promise.resolve(rawByRef.get(entry.ref) ?? ''),
    );
    expect(result).toEqual({ ok: true, failures: [] });
  });

  it('tampered content: ok false with the stable failure string', async () => {
    const dir = makeTempDir();
    const lock = buildLockfile(
      resolvePacks([loadPack(writePack(dir, 'stack/a', validPackYaml('stack/a')))], ['stack/a']),
    );

    const result = await verifyLockIntegrity(lock, () => Promise.resolve('tampered content'));
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(['stack/a@1.0.0: integrity mismatch']);
  });

  it('local entries without a recorded digest pass without reading content', async () => {
    const lock = LockfileSchema.parse({
      schemaVersion: 1,
      planmoVersion: '0.0.0',
      packs: [{ ref: 'stack/local', name: 'Local pack', version: '1.0.0', source: 'local' }],
      adapters: [],
    });

    let reads = 0;
    const result = await verifyLockIntegrity(lock, async () => {
      reads += 1;
      return 'unused';
    });
    expect(result).toEqual({ ok: true, failures: [] });
    expect(reads).toBe(0);
  });

  it('multiple failures come back in stable ref/version order, not lock order', async () => {
    const lock = LockfileSchema.parse({
      schemaVersion: 1,
      planmoVersion: '0.0.0',
      packs: [
        {
          ref: 'stack/zz',
          name: 'ZZ',
          version: '1.0.0',
          source: 'registry',
          integrity: { algorithm: 'sha256', digest: 'a'.repeat(64) },
        },
        {
          ref: 'stack/aa',
          name: 'AA',
          version: '2.0.0',
          source: 'git',
          integrity: { algorithm: 'sha256', digest: 'a'.repeat(64) },
        },
      ],
      adapters: [],
    });

    const result = await verifyLockIntegrity(lock, () => Promise.resolve('tampered'));
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      'stack/aa@2.0.0: integrity mismatch',
      'stack/zz@1.0.0: integrity mismatch',
    ]);
  });
});

describe('lockFromResolution (P11-03 resolution → lock)', () => {
  it('reuses buildLockfile output, honors planmoVersion, and marks local packs builtin', () => {
    const dir = makeTempDir();
    const result = resolvePacks(
      [loadPack(writePack(dir, 'stack/a', validPackYaml('stack/a')))],
      ['stack/a'],
    );

    const lock = lockFromResolution(result, '11.0.0-test.1');
    expect(lock.schemaVersion).toBe(1);
    expect(lock.planmoVersion).toBe('11.0.0-test.1');
    const entry = lock.packs.find((p) => p.ref === 'stack/a');
    expect(entry?.source).toBe('local');
    expect(entry?.trustLevel).toBe('builtin');
    expect(entry?.integrity?.algorithm).toBe('sha256');
    expect(entry?.integrity?.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('registry/git provenance packs are locked as third-party', () => {
    const dir = makeTempDir();
    const catalog = [
      loadPack(
        writePack(
          dir,
          'stack/remote',
          validPackYaml('stack/remote') +
            '\nprovenance:\n  source: registry\n  url: https://example.com/packs\n  trustLevel: third-party',
        ),
      ),
      loadPack(
        writePack(
          dir,
          'stack/gitpack',
          validPackYaml('stack/gitpack') +
            '\nprovenance:\n  source: git\n  url: https://github.com/example/packs.git',
        ),
      ),
    ];
    const result = resolvePacks(catalog, ['stack/remote', 'stack/gitpack']);

    const lock = lockFromResolution(result, '0.0.0');
    expect(lock.packs.find((p) => p.ref === 'stack/remote')?.trustLevel).toBe('third-party');
    expect(lock.packs.find((p) => p.ref === 'stack/gitpack')?.trustLevel).toBe('third-party');
  });

  it('deterministic: same resolution always yields the same lock', () => {
    const dir = makeTempDir();
    const result = resolvePacks(
      [
        loadPack(writePack(dir, 'stack/base', validPackYaml('stack/base'))),
        loadPack(writePack(dir, 'stack/top', validPackYaml('stack/top'))),
      ],
      ['stack/top'],
    );

    const lockA = lockFromResolution(result, '0.0.0');
    const lockB = lockFromResolution(result, '0.0.0');
    expect(lockfileFingerprint(lockA)).toBe(lockfileFingerprint(lockB));
    expect(lockA).toEqual(lockB);
  });

  it('emits a schema-valid lockfile with the trustLevel field per entry', () => {
    const dir = makeTempDir();
    const result = resolvePacks(
      [loadPack(writePack(dir, 'stack/a', validPackYaml('stack/a')))],
      ['stack/a'],
    );

    const lock = lockFromResolution(result, '0.0.0');
    const reparsed = LockfileSchema.parse(lock);
    expect(reparsed.packs[0]?.trustLevel).toBe('builtin');
    expect(Object.keys(reparsed.packs[0] ?? {}).sort()).toEqual([
      'integrity',
      'name',
      'ref',
      'source',
      'trustLevel',
      'version',
    ]);
  });
});
