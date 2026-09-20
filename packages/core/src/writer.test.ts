import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ManagedWriter, writeManaged } from './writer.js';
import { tempDir, tempRoot, tempWrite } from './test-utils.js';

describe('ManagedWriter.plan', () => {
  it('plans new files with sha256 checksums and no diff', async () => {
    const root = await tempRoot();
    const writer = new ManagedWriter(root, { contentDirs: ['.planmo'] });
    const plan = await writer.plan([{ path: '.planmo/state.yml', content: 'a: b\n' }]);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]!.existing).toBe(false);
    expect(plan.entries[0]!.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.collisions).toEqual([]);
    expect(plan.diff).toBe('');
  });

  it('flags an existing file as collision unless overwrite is allowed', async () => {
    const root = await tempRoot();
    await tempWrite(root, '.planmo/state.yml', 'keep me');
    const writer = new ManagedWriter(root, { contentDirs: [] });
    const plan = await writer.plan([{ path: '.planmo/state.yml', content: 'a: b\n' }]);
    expect(plan.collisions).toEqual(['.planmo/state.yml']);
    expect(plan.entries).toHaveLength(0);
  });

  it('permits overwrite with a rendered diff when allowOverwrite is set', async () => {
    const root = await tempRoot();
    await tempWrite(root, 'docs/plan.md', 'old line\n');
    const writer = new ManagedWriter(root, { contentDirs: ['docs'] });
    const plan = await writer.plan([{ path: 'docs/plan.md', content: 'new line\n' }], {
      allowOverwrite: true,
    });
    expect(plan.collisions).toEqual([]);
    expect(plan.entries[0]!.existing).toBe(true);
    expect(plan.diff).toContain('-old line');
    expect(plan.diff).toContain('+new line');
  });

  it('rejects .. traversal in a write path', async () => {
    const root = await tempRoot();
    const writer = new ManagedWriter(root, { contentDirs: [] });
    await expect(writer.plan([{ path: '../evil', content: 'x' }])).rejects.toThrow(
      /escapes project root/,
    );
  });

  it('rejects an absolute write path outside root', async () => {
    const root = await tempRoot();
    const writer = new ManagedWriter(root, { contentDirs: [] });
    await expect(writer.plan([{ path: '/tmp/evil', content: 'x' }])).rejects.toThrow(
      /escapes project root|absolute/i,
    );
  });
});

describe('ManagedWriter.apply', () => {
  it('dry-run returns the plan without touching disk', async () => {
    const root = await tempRoot();
    const writer = new ManagedWriter(root, { contentDirs: ['.planmo'] });
    const plan = await writer.plan([{ path: '.planmo/state.yml', content: 'a: b\n' }]);
    const result = await writer.apply(plan, { dryRun: true });
    expect(result.written).toEqual(['.planmo/state.yml']);
    await expect(readFile(join(root, '.planmo', 'state.yml'))).rejects.toThrow();
  });

  it('writes atomically (temp+rename) and verifies content', async () => {
    const root = await tempRoot();
    const writer = new ManagedWriter(root, { contentDirs: ['.planmo'] });
    const plan = await writer.plan([{ path: '.planmo/state.yml', content: 'a: b\n' }]);
    const result = await writer.apply(plan);
    expect(result.written).toEqual(['.planmo/state.yml']);
    expect(await readFile(join(root, '.planmo', 'state.yml'), 'utf8')).toBe('a: b\n');
    // no stray temp files remain
    const { readdir } = await import('node:fs/promises');
    const leftover = (await readdir(join(root, '.planmo'))).filter((f) =>
      f.startsWith('.planmo-tmp-'),
    );
    expect(leftover).toEqual([]);
  });

  it('refuses to overwrite an unmanaged file at apply time (TOCTOU guard)', async () => {
    const root = await tempRoot();
    const writer = new ManagedWriter(root, { contentDirs: [] });
    const plan = await writer.plan([{ path: 'data.txt', content: 'new\n' }]);
    // A file appears between plan() and apply() — must not be clobbered.
    await tempWrite(root, 'data.txt', 'user data');
    const result = await writer.apply(plan, { allowOverwrite: false });
    expect(result.collisions).toContain('data.txt');
    expect(await readFile(join(root, 'data.txt'), 'utf8')).toBe('user data');
  });
});

describe('writeManaged (one-shot)', () => {
  it('creates content dirs automatically', async () => {
    const root = await tempRoot();
    const result = await writeManaged(root, [{ path: 'docs/a.md', content: 'hi\n' }], {
      contentDirs: ['docs'],
    });
    expect(result.written).toEqual(['docs/a.md']);
    expect(await readFile(join(root, 'docs', 'a.md'), 'utf8')).toBe('hi\n');
  });

  it('honours dryRun across plan+apply', async () => {
    const root = await tempRoot();
    const result = await writeManaged(root, [{ path: 'a.txt', content: 'x\n' }], { dryRun: true });
    expect(result.written).toEqual(['a.txt']);
    await expect(readFile(join(root, 'a.txt'))).rejects.toThrow();
  });
});
