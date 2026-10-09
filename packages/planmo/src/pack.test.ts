import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LockfileSchema } from '@planmo/schema';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { run } from './index.js';
import { LOCK_PATH, NO_SOURCE_NOTE, packReport, renderPackReport } from './pack.js';

/**
 * `planmo pack` reads the canonical project model, resolves its declared pack
 * refs against a catalog, and reconciles `.planmo/lock.yml`. These tests drive
 * the real adapter against a real generated workspace and a real on-disk pack
 * directory, so the canonical paths and the engine behavior are exercised.
 *
 * There is NO remote registry in the CLI: the only catalog is a local directory
 * of `pack.yml` files, which is exactly what the `--source` option models.
 */
const PLANMO_VERSION = '1.10.0';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
}

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-pack-'));
  expect(await run(['init', root, '--yes'], capture().io)).toBe(0);
  return root;
}

/** Write `<dir>/<ref>/pack.yml` for a minimal valid pack. */
async function writePack(
  dir: string,
  ref: string,
  version: string,
  requires: string[] = [],
): Promise<void> {
  const packDir = join(dir, ref);
  await mkdir(packDir, { recursive: true });
  const yaml = [
    'schemaVersion: 1',
    `ref: ${ref}`,
    `name: Pack ${ref}`,
    `version: ${version}`,
    'category: stack',
    `description: Fixture pack for ${ref}.`,
    ...(requires.length > 0 ? ['requires:', ...requires.map((r) => `  - ${r}`)] : []),
    '',
  ].join('\n');
  await writeFile(join(packDir, 'pack.yml'), yaml, 'utf8');
}

/** A directory of packs to serve as the local-dir catalog source. */
async function packSource(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'planmo-pack-src-'));
}

/** Replace the refs declared by `.planmo/project.yml`. */
async function setPacks(root: string, packs: string[]): Promise<void> {
  const path = join(root, '.planmo', 'project.yml');
  const project = parseYaml(await readFile(path, 'utf8')) as Record<string, unknown>;
  project['packs'] = packs;
  await writeFile(path, stringifyYaml(project), 'utf8');
}

/** Write a valid existing lockfile pinning the given refs at 1.0.0. */
async function writeLock(root: string, refs: string[]): Promise<void> {
  const lock = {
    schemaVersion: 1,
    planmoVersion: PLANMO_VERSION,
    packs: refs.map((ref) => ({
      ref,
      name: `Pack ${ref}`,
      version: '1.0.0',
      source: 'local',
      integrity: { algorithm: 'sha256', digest: 'a'.repeat(64) },
    })),
    adapters: [],
  };
  await writeFile(join(root, LOCK_PATH), stringifyYaml(lock), 'utf8');
}

describe('planmo pack — catalog', () => {
  it('lists every pack in a local-dir source, classified by trust', async () => {
    const root = await workspace();
    const source = await packSource();
    await writePack(source, 'stack/nextjs', '1.0.0');
    await writePack(source, 'design/minimal', '0.4.2');

    const outcome = await packReport({ root, planmoVersion: PLANMO_VERSION, source });

    expect(outcome.noSource).toBe(false);
    expect(outcome.source).toEqual({ kind: 'local-dir', url: source });
    expect(outcome.catalog.map((e) => e.ref)).toEqual(['design/minimal', 'stack/nextjs']);
    const nextjs = outcome.catalog.find((e) => e.ref === 'stack/nextjs');
    expect(nextjs?.version).toBe('1.0.0');
    expect(nextjs?.trust).toContain('local (no review)');
    expect(nextjs?.requiresReview).toBe(false);
    expect(outcome.text).toContain('design/minimal  0.4.2');
  });

  it('reports the missing catalog source loudly instead of pretending', async () => {
    const root = await workspace();
    await setPacks(root, ['stack/nextjs']);

    const outcome = await packReport({ root, planmoVersion: PLANMO_VERSION });

    expect(outcome.noSource).toBe(true);
    expect(outcome.source).toBeNull();
    expect(outcome.catalog).toEqual([]);
    expect(outcome.text).toContain(NO_SOURCE_NOTE);
    // With no catalog, the requested ref cannot resolve — never silent success.
    expect(outcome.resolution.ok).toBe(false);
    expect(outcome.resolution.diagnostics[0]?.code).toBe('unknown-ref');
  });
});

describe('planmo pack — resolution', () => {
  it('resolves the refs declared in project.yml', async () => {
    const root = await workspace();
    const source = await packSource();
    await writePack(source, 'stack/nextjs', '1.0.0');
    await setPacks(root, ['stack/nextjs']);

    const outcome = await packReport({ root, planmoVersion: PLANMO_VERSION, source });

    expect(outcome.requested).toEqual(['stack/nextjs']);
    expect(outcome.resolution.ok).toBe(true);
    expect(outcome.resolution.order).toEqual(['stack/nextjs']);
  });

  it('resolves transitive requires in dependency-first order', async () => {
    const root = await workspace();
    const source = await packSource();
    await writePack(source, 'stack/base', '1.0.0');
    await writePack(source, 'stack/top', '1.0.0', ['stack/base']);
    await setPacks(root, ['stack/top']);

    const outcome = await packReport({ root, planmoVersion: PLANMO_VERSION, source });

    expect(outcome.resolution.ok).toBe(true);
    expect(outcome.resolution.order).toEqual(['stack/base', 'stack/top']);
  });

  it('surfaces an unknown ref as a diagnostic, not a silent success', async () => {
    const root = await workspace();
    const source = await packSource();
    await writePack(source, 'stack/nextjs', '1.0.0');
    await setPacks(root, ['stack/missing']);

    const outcome = await packReport({ root, planmoVersion: PLANMO_VERSION, source });

    expect(outcome.resolution.ok).toBe(false);
    expect(outcome.resolution.diagnostics).toEqual([
      expect.objectContaining({ code: 'unknown-ref', refs: ['stack/missing'] }),
    ]);
    expect(outcome.text).toContain('unknown-ref');
  });
});

describe('planmo pack — lockfile reconciliation', () => {
  it('writes .planmo/lock.yml when the resolution is clean', async () => {
    const root = await workspace();
    const source = await packSource();
    await writePack(source, 'stack/nextjs', '1.0.0');
    await setPacks(root, ['stack/nextjs']);

    const outcome = await packReport({ root, planmoVersion: PLANMO_VERSION, source });

    expect(outcome.lockDiff.changed).toBe(true);
    expect(outcome.lockDiff.diff).toBe('+stack/nextjs@1.0.0');
    expect(outcome.written).toEqual([LOCK_PATH]);
    expect(outcome.skipped).toBeNull();

    const raw = await readFile(join(root, LOCK_PATH), 'utf8');
    const lock = LockfileSchema.parse(parseYaml(raw));
    expect(lock.planmoVersion).toBe(PLANMO_VERSION);
    expect(lock.packs.map((p) => p.ref)).toEqual(['stack/nextjs']);
    expect(lock.packs[0]?.integrity?.algorithm).toBe('sha256');
  });

  it('--dry-run reports the plan and writes nothing', async () => {
    const root = await workspace();
    const source = await packSource();
    await writePack(source, 'stack/nextjs', '1.0.0');
    await setPacks(root, ['stack/nextjs']);

    const outcome = await packReport({
      root,
      planmoVersion: PLANMO_VERSION,
      source,
      dryRun: true,
    });

    expect(outcome.lockDiff.changed).toBe(true);
    expect(outcome.written).toEqual([]);
    expect(outcome.skipped).toBe('dry-run');
    expect(outcome.text).toContain('dry run');
    await expect(readFile(join(root, LOCK_PATH), 'utf8')).rejects.toThrow();
  });

  it('refuses to write when no catalog source is configured', async () => {
    const root = await workspace();
    await setPacks(root, ['stack/nextjs']);
    await writeLock(root, ['stack/nextjs']);
    const before = await readFile(join(root, LOCK_PATH), 'utf8');

    const outcome = await packReport({ root, planmoVersion: PLANMO_VERSION });

    expect(outcome.lockDiff.diff).toBe('-stack/nextjs@1.0.0');
    expect(outcome.written).toEqual([]);
    expect(outcome.skipped).toBe('no-source');
    expect(await readFile(join(root, LOCK_PATH), 'utf8')).toBe(before);
  });

  it('refuses to write an incomplete lock when resolution has diagnostics', async () => {
    const root = await workspace();
    const source = await packSource();
    await writePack(source, 'stack/nextjs', '1.0.0');
    await setPacks(root, ['stack/nextjs', 'stack/missing']);

    const outcome = await packReport({ root, planmoVersion: PLANMO_VERSION, source });

    expect(outcome.resolution.ok).toBe(false);
    expect(outcome.written).toEqual([]);
    expect(outcome.skipped).toBe('resolution-not-ok');
    expect(outcome.text).toContain('not written: resolution has diagnostics');
  });

  it('is idempotent: a second run reports the lockfile up to date', async () => {
    const root = await workspace();
    const source = await packSource();
    await writePack(source, 'stack/nextjs', '1.0.0');
    await setPacks(root, ['stack/nextjs']);

    await packReport({ root, planmoVersion: PLANMO_VERSION, source });
    const second = await packReport({ root, planmoVersion: PLANMO_VERSION, source });

    expect(second.lockDiff.changed).toBe(false);
    expect(second.written).toEqual([]);
    expect(second.skipped).toBeNull();
    expect(second.text).toContain('up to date');
  });
});

describe('planmo pack — errors and determinism', () => {
  it('throws "no readable .planmo/project.yml" when there is no workspace', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'planmo-pack-empty-'));
    await expect(packReport({ root: empty, planmoVersion: PLANMO_VERSION })).rejects.toThrow(
      /no readable \.planmo\/project\.yml/,
    );

    // A `.planmo/` directory with no project.yml is the same failure.
    const half = await mkdtemp(join(tmpdir(), 'planmo-pack-half-'));
    await mkdir(join(half, '.planmo'), { recursive: true });
    await expect(packReport({ root: half, planmoVersion: PLANMO_VERSION })).rejects.toThrow(
      /no readable \.planmo\/project\.yml/,
    );
  });

  it('renders deterministically', async () => {
    const root = await workspace();
    const source = await packSource();
    await writePack(source, 'stack/nextjs', '1.0.0');
    await setPacks(root, ['stack/nextjs']);

    const a = await packReport({ root, planmoVersion: PLANMO_VERSION, source, dryRun: true });
    const b = await packReport({ root, planmoVersion: PLANMO_VERSION, source, dryRun: true });
    expect(renderPackReport(a)).toBe(renderPackReport(b));
    expect(a.text).toBe(b.text);
  });
});
