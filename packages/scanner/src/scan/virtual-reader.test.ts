import { describe, expect, it } from 'vitest';

import type { FileReader, VirtualTree } from '../contracts.js';
import { ReaderError } from '../contracts.js';
import { ConstructorReader, constructorReader } from './virtual-reader.js';
import { linkEscapes } from './safe-scanner.js';

describe('ConstructorReader — basic filesystem semantics', () => {
  const tree: VirtualTree = {
    'README.md': '# hello',
    src: null,
    'src/index.ts': 'export const x = 1;\n',
    'src/lib': null,
    'src/lib/util.ts': 'héllo', // 6 UTF-8 bytes
    notes: 'plain',
  };

  it('stats explicit files and dirs with byte-accurate sizes', async () => {
    const reader = new ConstructorReader(tree);
    expect(await reader.stat('README.md')).toEqual({ type: 'file', size: 7 });
    expect(await reader.stat('src')).toEqual({ type: 'dir', size: 0 });
    expect(await reader.stat('src/lib')).toEqual({ type: 'dir', size: 0 });
    expect(await reader.stat('src/lib/util.ts')).toEqual({ type: 'file', size: 6 });
    expect(await reader.stat('')).toEqual({ type: 'dir', size: 0 });
  });

  it('implies directories from their children', async () => {
    const reader = new ConstructorReader({ 'a/b/c.txt': 'x' });
    expect(await reader.stat('a')).toEqual({ type: 'dir', size: 0 });
    expect(await reader.stat('a/b')).toEqual({ type: 'dir', size: 0 });
    expect(await reader.readDir('a')).toEqual(['b']);
    expect(await reader.readDir('')).toEqual(['a']);
  });

  it('reads directory listings sorted, direct children only', async () => {
    const reader = new ConstructorReader(tree);
    expect(await reader.readDir('')).toEqual(['README.md', 'notes', 'src']);
    expect(await reader.readDir('src')).toEqual(['index.ts', 'lib']);
    expect(await reader.readDir('src/lib')).toEqual(['util.ts']);
  });

  it('returns exactly the authored content', async () => {
    const reader = new ConstructorReader(tree);
    expect(await reader.readFile('src/index.ts')).toBe('export const x = 1;\n');
    expect(await reader.readFile('README.md')).toBe('# hello');
  });

  it('exists is true for any present entry and false otherwise', async () => {
    const reader = new ConstructorReader(tree);
    expect(await reader.exists('src')).toBe(true);
    expect(await reader.exists('src/index.ts')).toBe(true);
    expect(await reader.exists('')).toBe(true);
    expect(await reader.exists('missing')).toBe(false);
    expect(await reader.exists('src/missing')).toBe(false);
  });

  it('throws ReaderError with stable reasons on missing/mismatched paths', async () => {
    const reader = new ConstructorReader(tree);
    await expect(reader.stat('missing')).rejects.toMatchObject({
      name: 'ReaderError',
      path: 'missing',
      reason: 'not-found',
    });
    await expect(reader.readDir('missing')).rejects.toMatchObject({ reason: 'not-found' });
    await expect(reader.readFile('missing')).rejects.toMatchObject({ reason: 'not-found' });
    await expect(reader.readFile('src')).rejects.toMatchObject({ reason: 'is-a-directory' });
    await expect(reader.readFile('src/lib')).rejects.toMatchObject({ reason: 'is-a-directory' });
    await expect(reader.readDir('README.md')).rejects.toMatchObject({ reason: 'not-a-directory' });
  });

  it('normalizes leading ./ and trailing / query forms', async () => {
    const reader = new ConstructorReader(tree);
    expect(await reader.stat('./src/index.ts')).toEqual({ type: 'file', size: 20 });
    expect(await reader.readDir('src/')).toEqual(['index.ts', 'lib']);
  });
});

describe('ConstructorReader — symlinks, other types, base, binary', () => {
  it('exposes symlinks via stat (size = target byte length) and linkTarget', async () => {
    const reader = new ConstructorReader(
      { src: null, 'src/index.ts': 'x' },
      {
        symlinks: new Map([
          ['link', 'src/index.ts'],
          ['abs', '/etc/passwd'],
        ]),
      },
    );
    expect(await reader.stat('link')).toEqual({ type: 'symlink', size: 12 });
    expect(await reader.linkTarget('link')).toBe('src/index.ts');
    expect(await reader.linkTarget('abs')).toBe('/etc/passwd');
    expect(await reader.exists('link')).toBe(true);
    // symlinks appear in listings
    expect(await reader.readDir('')).toEqual(['abs', 'link', 'src']);
  });

  it('fails closed on symlink reads and linkTarget of non-symlinks', async () => {
    const reader = new ConstructorReader(
      { src: null, 'src/index.ts': 'x' },
      { symlinks: new Map([['link', 'src/index.ts']]) },
    );
    await expect(reader.readFile('link')).rejects.toMatchObject({
      reason: 'refused: symlink not followed',
    });
    await expect(reader.readDir('link')).rejects.toMatchObject({ reason: 'not-a-directory' });
    await expect(reader.linkTarget('src')).rejects.toMatchObject({ reason: 'not-a-symlink' });
  });

  it('reports otherPaths as type other', async () => {
    const reader = new ConstructorReader({ normal: 'x' }, { otherPaths: ['weird'] });
    expect(await reader.stat('weird')).toEqual({ type: 'other', size: 0 });
    expect(await reader.readDir('')).toEqual(['normal', 'weird']);
  });

  it('strips the base prefix when scanning with a non-empty root', async () => {
    const reader = new ConstructorReader(
      { src: null, 'src/index.ts': 'x' },
      { base: 'virtual-root' },
    );
    expect(await reader.stat('virtual-root')).toEqual({ type: 'dir', size: 0 });
    expect(await reader.stat('virtual-root/src/index.ts')).toEqual({ type: 'file', size: 1 });
    expect(await reader.readDir('virtual-root/src')).toEqual(['index.ts']);
    expect(await reader.readDir('virtual-root')).toEqual(['src']);
  });

  it('detectBinary mirrors NodeFileReader when enabled', async () => {
    const binary = new ConstructorReader({ 'blob.bin': 'a\0b' }, { detectBinary: true });
    await expect(binary.readFile('blob.bin')).rejects.toMatchObject({ reason: 'binary-content' });
    const text = new ConstructorReader({ 'blob.bin': 'a\0b' });
    expect(await text.readFile('blob.bin')).toBe('a\0b');
  });
});

describe('ConstructorReader — failure injection', () => {
  const tree: VirtualTree = { a: null, 'a/x.txt': 'x', b: null, 'b/y.txt': 'y' };

  it('throws injected ReaderError per operation and path', async () => {
    const reader = new ConstructorReader(tree, {
      failures: {
        readDir: ['a'],
        readFile: ['a/x.txt'],
        stat: ['b'],
        linkTarget: ['a/x.txt'],
      },
    });
    await expect(reader.readDir('a')).rejects.toMatchObject({ reason: 'injected-failure' });
    await expect(reader.readFile('a/x.txt')).rejects.toMatchObject({ reason: 'injected-failure' });
    await expect(reader.stat('b')).rejects.toMatchObject({ reason: 'injected-failure' });
    await expect(reader.linkTarget('a/x.txt')).rejects.toMatchObject({
      reason: 'injected-failure',
    });
    // unrelated paths stay functional
    expect(await reader.readDir('')).toEqual(['a', 'b']);
    expect(await reader.readDir('b')).toEqual(['y.txt']);
    await expect(reader.readFile('b/y.txt')).resolves.toBe('y');
  });

  it('injected failures take precedence over normal results and exist()', async () => {
    const reader = new ConstructorReader(tree, { failures: { stat: ['a/x.txt'] } });
    await expect(reader.stat('a/x.txt')).rejects.toMatchObject({ reason: 'injected-failure' });
    expect(await reader.exists('a/x.txt')).toBe(false);
  });
});

describe('ConstructorReader — determinism', () => {
  it('produces identical listings regardless of tree key insertion order', async () => {
    const forward: VirtualTree = { z: '1', m: null, 'm/a': '2', a: '3' };
    const backward: VirtualTree = {};
    for (const [key, value] of Object.entries(forward).reverse()) backward[key] = value;
    const r1 = new ConstructorReader(forward);
    const r2 = new ConstructorReader(backward);
    expect(await r1.readDir('')).toEqual(['a', 'm', 'z']);
    expect(await r2.readDir('')).toEqual(['a', 'm', 'z']);
    expect(await r1.readDir('m')).toEqual(['a']);
    expect(await r2.readDir('m')).toEqual(['a']);
  });

  it('factory returns a working FileReader', async () => {
    const reader: FileReader = constructorReader({ 'f.txt': 'hi' });
    expect(await reader.readFile('f.txt')).toBe('hi');
  });
});

describe('ConstructorReader + linkEscapes integration', () => {
  it('targets are analysed relative to the symlink parent, not the root', async () => {
    const reader = constructorReader(
      { src: null, 'src/lib': null, 'src/lib/util.ts': 'x' },
      {
        symlinks: new Map([
          // from src/, ../lib/util.ts stays inside root
          ['src/up-safe', '../lib/util.ts'],
          // from src/lib/, ../../../etc escapes
          ['src/lib/out', '../../../etc/passwd'],
        ]),
      },
    );
    expect(await reader.linkTarget('src/up-safe')).toBe('../lib/util.ts');
    expect(linkEscapes('src', '../lib/util.ts')).toBe(false);
    expect(linkEscapes('src/lib', '../../../etc/passwd')).toBe(true);
  });
});
