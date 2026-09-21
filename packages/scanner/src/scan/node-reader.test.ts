import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { ScanReport } from '../contracts.js';
import { ReaderError } from '../contracts.js';
import { NodeFileReader, nodeFileReader } from './node-reader.js';
import { safeScanner } from './safe-scanner.js';

/** Create a temp dir holding a small repo; returns its absolute path. */
function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'planmo-node-reader-'));
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, 'src', 'lib'));
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'README.md'), '# temp repo');
  writeFileSync(join(dir, 'src', 'index.ts'), 'export const x = 1;');
  writeFileSync(join(dir, 'src', 'lib', 'util.ts'), 'export const u = 2;');
  writeFileSync(join(dir, 'dist', 'ignored.js'), '// ignored build artifact');
  return dir;
}

describe('NodeFileReader — real filesystem reader (the only node:fs module)', () => {
  it('reports Files with byte-accurate sizes and typing', async () => {
    const dir = makeTempRepo();
    try {
      const reader = nodeFileReader();
      expect(await reader.stat(join(dir, 'README.md'))).toEqual({ type: 'file', size: 11 });
      expect(await reader.stat(join(dir, 'src'))).toEqual({ type: 'dir', size: 0 });
      expect(await reader.readDir(join(dir, 'src'))).toEqual(['index.ts', 'lib']);
      expect(await reader.readFile(join(dir, 'src', 'index.ts'))).toBe('export const x = 1;');
      expect(await reader.exists(join(dir, 'README.md'))).toBe(true);
      expect(await reader.exists(join(dir, 'missing'))).toBe(false);
      expect(await reader.exists(join(dir, 'src', 'missing'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('scans a real temp dir end-to-end with the safe scanner', async () => {
    const dir = makeTempRepo();
    try {
      const report: ScanReport = await safeScanner().scan(dir, nodeFileReader());
      expect(report.root).toBe(dir.replace(/[\\/]+$/, ''));
      expect(
        report.entries.map((e) => e.path.replace(/\\/g, '/')),
      ).toEqual(['README.md', 'dist', 'dist/ignored.js', 'src', 'src/index.ts', 'src/lib', 'src/lib/util.ts']);
      expect(report.stats).toEqual({ files: 4, dirs: 3, symlinks: 0, totalBytes: 74 });
      expect(report.warnings).toEqual([]);
      expect(report.truncatedBy).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('applies caps and exclusions to a real tree', async () => {
    const dir = makeTempRepo();
    try {
      const report = await safeScanner().scan(dir, nodeFileReader(), {
        exclude: ['dist'],
        maxFileBytes: 8,
      });
      expect(report.entries.some((e) => e.path.startsWith('dist'))).toBe(false);
      // README.md (11), src/index.ts (19) and src/lib/util.ts (19) all exceed 8 bytes
      expect(report.entries.some((e) => e.path === 'README.md')).toBe(false);
      expect(report.entries.some((e) => e.path === 'src/index.ts')).toBe(false);
      expect(report.entries.some((e) => e.path === 'src/lib/util.ts')).toBe(false);
      expect(report.warnings.map((w) => w.code).sort()).toEqual([
        'SCN-004',
        'SCN-004',
        'SCN-004',
        'SCN-007',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exposes symlinks via lstat without following (target length size)', async (ctx) => {
    const dir = makeTempRepo();
    try {
      let symlinked = false;
      try {
        symlinkSync(join(dir, 'src', 'index.ts'), join(dir, 'entry-link'));
        symlinked = true;
      } catch {
        ctx.skip('platform does not permit symlink creation');
        return;
      }
      const reader = nodeFileReader();
      const st = await reader.stat(join(dir, 'entry-link'));
      expect(st.type).toBe('symlink');
      expect(st.size).toBeGreaterThan(0);
      expect(await reader.linkTarget(join(dir, 'entry-link'))).toMatch(/index\.ts$/);

      const report = await safeScanner().scan(dir, reader);
      expect(report.entries.find((e) => e.path === 'entry-link')?.type).toBe('symlink');
      expect(report.stats.symlinks).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses escaping symlinks found on a real tree', async (ctx) => {
    const dir = makeTempRepo();
    try {
      try {
        symlinkSync(join(dir, '..', 'outside.txt'), join(dir, 'escape-link'));
      } catch {
        ctx.skip('platform does not permit symlink creation');
        return;
      }
      const report = await safeScanner().scan(dir, nodeFileReader());
      expect(report.entries.some((e) => e.path === 'escape-link')).toBe(false);
      const refused = report.warnings.find((w) => w.code === 'SCN-003');
      expect(refused?.path).toBe('escape-link');
      expect(refused?.message).toContain('escapes repo root');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('maps fs error codes to stable ReaderError reasons', async () => {
    const dir = makeTempRepo();
    try {
      const reader = nodeFileReader();
      await expect(reader.readDir(join(dir, 'missing-dir'))).rejects.toBeInstanceOf(ReaderError);
      await expect(reader.readDir(join(dir, 'missing-dir'))).rejects.toMatchObject({
        path: join(dir, 'missing-dir'),
        reason: 'not-found',
      });
      await expect(reader.stat(join(dir, 'missing.txt'))).rejects.toMatchObject({ reason: 'not-found' });
      await expect(reader.readFile(join(dir, 'missing.txt'))).rejects.toMatchObject({ reason: 'not-found' });
      await expect(reader.readDir(join(dir, 'src', 'index.ts'))).rejects.toBeInstanceOf(ReaderError);
      await expect(reader.readFile(join(dir, 'src'))).rejects.toMatchObject({ reason: 'is-a-directory' });
      await expect(reader.linkTarget(join(dir, 'src'))).rejects.toBeInstanceOf(ReaderError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws ReaderError(binary-content) for binary files (NUL byte)', async () => {
    const dir = makeTempRepo();
    try {
      writeFileSync(join(dir, 'blob.bin'), Buffer.from([0x00, 0x01, 0x02]));
      const reader = nodeFileReader();
      await expect(reader.readFile(join(dir, 'blob.bin'))).rejects.toMatchObject({
        reason: 'binary-content',
        path: join(dir, 'blob.bin'),
      });
      // a file that reads as UTF-8 without NUL bytes is treated as text
      const normal = join(dir, 'text.md');
      writeFileSync(normal, 'plain text');
      expect(await reader.readFile(normal)).toBe('plain text');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('NodeFileReader class', () => {
  it('is constructible and exposes a stable name', () => {
    const reader = new NodeFileReader();
    expect(reader.name).toBe('node-reader');
  });
});