import { describe, expect, it } from 'vitest';

import type { FileReader, ReaderStat, VirtualTree } from '../contracts.js';
import { ReaderError } from '../contracts.js';
import { constructorReader } from './virtual-reader.js';
import { isSafeRelativePath, linkEscapes, safeScanner, SCAN_DEFAULTS } from './safe-scanner.js';

const textEncoder = new TextEncoder();
const bytes = (value: string): number => textEncoder.encode(value).length;

/** Small canonical tree reused across suites. */
export function sampleTree(): VirtualTree {
  return {
    'README.md': '# hello',
    'package.json': '{"name":"x"}',
    src: null,
    'src/index.ts': 'export const x = 1;',
    'src/lib': null,
    'src/lib/util.ts': 'export const u = 2;',
    'src/lib/README': 'lib notes',
    docs: null,
    'docs/guide.md': 'guide',
    node_modules: null,
    'node_modules/dep': null,
    'node_modules/dep/index.js': 'module.exports = 1;',
  };
}

function deepTree(depth: number): VirtualTree {
  const tree: VirtualTree = {};
  let path = '';
  for (let i = 1; i <= depth; i += 1) {
    path = path === '' ? `d${i}` : `${path}/d${i}`;
    tree[path] = null;
  }
  tree[`${path}/file.txt`] = 'x';
  return tree;
}

describe('safeScanner.scan — ordering + stats', () => {
  it('scans a tree depth-first, parents before children, siblings sorted', async () => {
    const scanner = safeScanner();
    const report = await scanner.scan('', constructorReader(sampleTree()));
    expect(report.entries.map((e) => e.path)).toEqual([
      'README.md',
      'docs',
      'docs/guide.md',
      'node_modules',
      'node_modules/dep',
      'node_modules/dep/index.js',
      'package.json',
      'src',
      'src/index.ts',
      'src/lib',
      'src/lib/README',
      'src/lib/util.ts',
    ]);
    // parents strictly before children
    const index = new Map(report.entries.map((e, i) => [e.path, i]));
    for (const entry of report.entries) {
      if (entry.type === 'dir') {
        const after = report.entries
          .map((e, i) => ({ e, i }))
          .filter(({ e }) => e.path.startsWith(`${entry.path}/`));
        for (const { i } of after) {
          expect(i).toBeGreaterThan(index.get(entry.path) as number);
        }
      }
    }
  });

  it('reports exact stats (files, dirs, symlinks, totalBytes)', async () => {
    const report = await safeScanner().scan('', constructorReader(sampleTree()));
    const fileEntries = report.entries.filter((e) => e.type === 'file');
    expect(report.stats.files).toBe(7);
    expect(report.stats.dirs).toBe(5);
    expect(report.stats.symlinks).toBe(0);
    expect(report.stats.totalBytes).toBe(
      fileEntries.reduce((acc, e) => acc + bytes(sampleTree()[e.path] as string), 0),
    );
    for (const entry of report.entries) {
      expect(entry.size).toBe(
        entry.type === 'file' ? bytes(sampleTree()[entry.path] as string) : 0,
      );
    }
    expect(report.truncatedBy).toBeNull();
    expect(report.warnings).toEqual([]);
  });

  it('strips trailing slashes from root and reports it', async () => {
    const scanner = safeScanner();
    const reader = constructorReader(sampleTree(), { base: 'repo' });
    const without = await scanner.scan('repo', reader);
    const withSlash = await scanner.scan('repo/', reader);
    expect(without.root).toBe('repo');
    expect(withSlash.root).toBe('repo');
    expect(without.entries).toEqual(withSlash.entries);
  });

  it('is deterministic across repeated scans and shuffled tree insertion order', async () => {
    const scanner = safeScanner();
    const readerA = constructorReader(sampleTree());
    const first = await scanner.scan('', readerA);
    const second = await scanner.scan('', readerA);
    expect(second).toEqual(first);

    const shuffled: VirtualTree = {};
    for (const [key, value] of Object.entries(sampleTree()).reverse()) {
      shuffled[key] = value;
    }
    const readerB = constructorReader(shuffled);
    const third = await scanner.scan('', readerB);
    expect(third.entries).toEqual(first.entries);
    expect(third.warnings).toEqual(first.warnings);
  });

  it('default depth cap (32) prunes deeper subtrees without error', async () => {
    const report = await safeScanner().scan('', constructorReader(deepTree(40)));
    expect(report.truncatedBy).toBe('depth');
    expect(report.entries.length).toBe(32);
    expect(report.stats.dirs).toBe(32);
    expect(report.warnings.filter((w) => w.code === 'SCN-001').map((w) => w.path)).toEqual([
      'd1/d2/d3/d4/d5/d6/d7/d8/d9/d10/d11/d12/d13/d14/d15/d16/d17/d18/d19/d20/d21/d22/d23/d24/d25/d26/d27/d28/d29/d30/d31/d32',
    ]);
  });
});

describe('safeScanner.scan — caps', () => {
  it('SCN-001 depth cap: prunes subtrees, one warning per pruned dir', async () => {
    const report = await safeScanner().scan('', constructorReader(deepTree(4)), { maxDepth: 2 });
    expect(report.entries.map((e) => e.path)).toEqual(['d1', 'd1/d2']);
    expect(report.truncatedBy).toBe('depth');
    const depthWarnings = report.warnings.filter((w) => w.code === 'SCN-001');
    expect(depthWarnings.map((w) => w.path)).toEqual(['d1/d2']);
    expect(depthWarnings[0]?.message).toContain('depth cap reached (2)');
  });

  it('SCN-001 with maxDepth 0: root itself is pruned', async () => {
    const report = await safeScanner().scan('', constructorReader(sampleTree()), { maxDepth: 0 });
    expect(report.entries).toEqual([]);
    expect(report.truncatedBy).toBe('depth');
    expect(report.warnings.some((w) => w.code === 'SCN-001' && w.path === '')).toBe(true);
  });

  it('SCN-002 entry cap: hard stop, exactly one warning, truncatedBy entries', async () => {
    const report = await safeScanner().scan('', constructorReader(sampleTree()), { maxEntries: 3 });
    expect(report.entries.length).toBe(3);
    expect(report.entries.map((e) => e.path)).toEqual(['README.md', 'docs', 'docs/guide.md']);
    expect(report.truncatedBy).toBe('entries');
    const capWarnings = report.warnings.filter((w) => w.code === 'SCN-002');
    expect(capWarnings.length).toBe(1);
    expect(capWarnings[0]?.message).toContain('entry cap reached (3)');
  });

  it('SCN-002 entry cap 0: nothing scanned, one warning', async () => {
    const report = await safeScanner().scan('', constructorReader(sampleTree()), { maxEntries: 0 });
    expect(report.entries).toEqual([]);
    expect(report.truncatedBy).toBe('entries');
    expect(report.warnings.filter((w) => w.code === 'SCN-002')).toHaveLength(1);
  });

  it('SCN-004 size cap: oversized files skipped, stats exclude them', async () => {
    const reader = constructorReader({
      'small.txt': 'small',
      'big.txt': 'x'.repeat(10),
      nested: null,
      'nested/also-big.txt': 'y'.repeat(10),
    });
    const report = await safeScanner().scan('', reader, { maxFileBytes: 5 });
    expect(report.entries.map((e) => e.path)).toEqual(['nested', 'small.txt']);
    expect(report.stats.files).toBe(1);
    expect(report.stats.totalBytes).toBe(bytes('small'));
    const sizeWarnings = report.warnings.filter((w) => w.code === 'SCN-004').map((w) => w.path);
    expect(sizeWarnings).toEqual(['big.txt', 'nested/also-big.txt']);
  });
});

describe('safeScanner.scan — include/exclude', () => {
  it('include narrows the scan to matching prefixes silently', async () => {
    const report = await safeScanner().scan('', constructorReader(sampleTree()), {
      include: ['src'],
    });
    expect(report.entries.map((e) => e.path)).toEqual([
      'src',
      'src/index.ts',
      'src/lib',
      'src/lib/README',
      'src/lib/util.ts',
    ]);
    expect(report.warnings).toEqual([]);
  });

  it('include with segments matches the dir and everything under it', async () => {
    const report = await safeScanner().scan('', constructorReader(sampleTree()), {
      include: ['src/lib'],
    });
    // the ancestor dir is included so the scanner can descend into it
    expect(report.entries.map((e) => e.path)).toEqual([
      'src',
      'src/lib',
      'src/lib/README',
      'src/lib/util.ts',
    ]);
  });

  it('exclude prunes subtrees and emits SCN-007 for the pruned entry', async () => {
    const report = await safeScanner().scan('', constructorReader(sampleTree()), {
      exclude: ['node_modules'],
    });
    expect(report.entries.some((e) => e.path.startsWith('node_modules'))).toBe(false);
    const excluded = report.warnings.filter((w) => w.code === 'SCN-007').map((w) => w.path);
    expect(excluded).toEqual(['node_modules']);
  });

  it('exclude matches files and keeps the rest of the scan', async () => {
    const report = await safeScanner().scan('', constructorReader(sampleTree()), {
      exclude: ['package.json', 'src/lib'],
    });
    expect(report.entries.some((e) => e.path === 'package.json')).toBe(false);
    expect(report.entries.some((e) => e.path.startsWith('src/lib'))).toBe(false);
    expect(report.entries.some((e) => e.path === 'src/index.ts')).toBe(true);
    expect(report.warnings.filter((w) => w.code === 'SCN-007').map((w) => w.path)).toEqual([
      'package.json',
      'src/lib',
    ]);
  });

  it('prefix matching is segment-based: src does not match srcx', async () => {
    const reader = constructorReader({ src: null, 'src/a.ts': 'a', srcx: null, 'srcx/b.ts': 'b' });
    const report = await safeScanner().scan('', reader, { include: ['src'] });
    expect(report.entries.map((e) => e.path)).toEqual(['src', 'src/a.ts']);
  });

  it('trailing-slash prefixes behave identically', async () => {
    const a = await safeScanner().scan('', constructorReader(sampleTree()), {
      exclude: ['node_modules/'],
    });
    const b = await safeScanner().scan('', constructorReader(sampleTree()), {
      exclude: ['node_modules'],
    });
    expect(a.entries).toEqual(b.entries);
  });
});

describe('safeScanner.scan — symlinks (fail-closed)', () => {
  const symlinkTree = (): VirtualTree => ({
    src: null,
    'src/index.ts': 'export const x = 1;',
  });

  it('refuses escaping symlinks by default (SCN-003); allows safe ones', async () => {
    const reader = constructorReader(symlinkTree(), {
      symlinks: new Map([
        ['safe-link', 'src/index.ts'],
        ['escape-link', '../../etc/passwd'],
        ['absolute-link', '/etc/passwd'],
      ]),
    });
    const report = await safeScanner().scan('', reader);
    expect(report.entries.map((e) => e.path)).toEqual(['safe-link', 'src', 'src/index.ts']);
    expect(report.stats.symlinks).toBe(1);
    const refused = report.warnings.filter((w) => w.code === 'SCN-003').map((w) => w.path);
    expect(refused).toEqual(['absolute-link', 'escape-link']);
    expect(report.warnings[0]?.message).toContain('escapes repo root');
  });

  it('refuseAllSymlinks refuses every symlink even when otherwise safe', async () => {
    const reader = constructorReader(symlinkTree(), {
      symlinks: new Map([
        ['safe-link', 'src/index.ts'],
        ['escape-link', '../../etc/passwd'],
      ]),
    });
    const report = await safeScanner().scan('', reader, {
      refuseAllSymlinks: true,
      refuseEscapingSymlinks: false,
    });
    expect(report.entries.map((e) => e.path)).toEqual(['src', 'src/index.ts']);
    expect(report.stats.symlinks).toBe(0);
    expect(report.warnings.filter((w) => w.code === 'SCN-003').map((w) => w.path)).toEqual([
      'escape-link',
      'safe-link',
    ]);
    expect(report.warnings[1]?.message).toBe('refused: all symlinks refused');
  });

  it('refuseEscapingSymlinks: false includes escaping symlinks', async () => {
    const reader = constructorReader(symlinkTree(), {
      symlinks: new Map([['escape-link', '../../etc/passwd']]),
    });
    const report = await safeScanner().scan('', reader, { refuseEscapingSymlinks: false });
    expect(report.entries.map((e) => e.path)).toEqual(['escape-link', 'src', 'src/index.ts']);
    expect(report.stats.symlinks).toBe(1);
    expect(report.warnings).toEqual([]);
  });

  it('refuses symlinks whose target cannot be verified (reader without linkTarget)', async () => {
    const stubReader: FileReader = {
      readDir: async () => ['link'],
      readFile: async (path) => {
        throw new ReaderError(path, 'not-found');
      },
      stat: async (path): Promise<ReaderStat> =>
        path.endsWith('link') ? { type: 'symlink', size: 4 } : { type: 'file', size: 1 },
      exists: async () => true,
    };
    const report = await safeScanner().scan('', stubReader);
    expect(report.entries).toEqual([]);
    expect(report.stats.symlinks).toBe(0);
    const refused = report.warnings.filter((w) => w.code === 'SCN-003');
    expect(refused).toHaveLength(1);
    expect(refused[0]?.message).toBe('refused: symlink target cannot be verified');
  });

  it('refuses when linkTarget read fails even with a capability present', async () => {
    const failingCapacity: FileReader & { linkTarget: (p: string) => Promise<string> } = {
      readDir: async () => ['link'],
      readFile: async (path) => {
        throw new ReaderError(path, 'not-found');
      },
      stat: async (): Promise<ReaderStat> => ({ type: 'symlink', size: 4 }),
      exists: async () => true,
      linkTarget: async (path) => {
        throw new ReaderError(path, 'permission-denied');
      },
    };
    const report = await safeScanner().scan('', failingCapacity);
    expect(report.warnings.filter((w) => w.code === 'SCN-003')).toHaveLength(1);
  });

  it('a symlinked directory is a leaf: never followed for traversal', async () => {
    const reader = constructorReader(
      { src: null, 'src/index.ts': 'x' },
      { symlinks: new Map([['linked-dir', 'src']]) },
    );
    const report = await safeScanner().scan('', reader);
    expect(report.entries.map((e) => e.path)).toEqual(['linked-dir', 'src', 'src/index.ts']);
  });
});

describe('safeScanner.scan — unreadable and unsupported entries', () => {
  it('SCN-005 when readDir fails: dir listed but subtree missing', async () => {
    const reader = constructorReader(sampleTree(), { failures: { readDir: ['src'] } });
    const report = await safeScanner().scan('', reader);
    expect(report.entries.some((e) => e.path === 'src')).toBe(true);
    expect(report.entries.some((e) => e.path.startsWith('src/'))).toBe(false);
    const warnings = report.warnings.filter((w) => w.code === 'SCN-005');
    expect(warnings.map((w) => w.path)).toEqual(['src']);
    expect(warnings[0]?.message).toContain('cannot read directory: injected-failure');
  });

  it('SCN-005 when stat fails: entry missing', async () => {
    const reader = constructorReader(sampleTree(), { failures: { stat: ['package.json'] } });
    const report = await safeScanner().scan('', reader);
    expect(report.entries.some((e) => e.path === 'package.json')).toBe(false);
    expect(report.warnings.some((w) => w.code === 'SCN-005' && w.path === 'package.json')).toBe(
      true,
    );
  });

  it('SCN-006 unsupported type: skipped, not counted', async () => {
    const reader = constructorReader(sampleTree(), { otherPaths: ['weird-entry'] });
    const report = await safeScanner().scan('', reader);
    expect(report.entries.some((e) => e.path === 'weird-entry')).toBe(false);
    expect(report.stats.files + report.stats.dirs + report.stats.symlinks).toBe(12);
    const warnings = report.warnings.filter((w) => w.code === 'SCN-006');
    expect(warnings.map((w) => w.path)).toEqual(['weird-entry']);
    expect(warnings[0]?.message).toContain("unsupported entry type 'other'");
  });
});

describe('safeScanner.scan — warnings sorted', () => {
  it('publishes warnings sorted by path (then code)', async () => {
    const reader = constructorReader(
      {
        aaa: null,
        deep: null,
        'deep/sub': null,
        mmm: 'x',
        zzz: 'x'.repeat(20),
        excluded: null,
      },
      {
        failures: { stat: ['aaa'] },
        otherPaths: ['mmm'],
      },
    );
    const report = await safeScanner().scan('', reader, {
      maxFileBytes: 5,
      maxDepth: 1,
      exclude: ['excluded'],
    });
    // sorted by path ascending (contract: paths ascending, then codes)
    const paths = report.warnings.map((w) => w.path);
    expect(paths).toEqual([...paths].sort());
    // every mechanism exercised, deterministic contents
    const byPath = new Map(report.warnings.map((w) => [w.path, w.code]));
    expect(byPath).toEqual(
      new Map([
        ['aaa', 'SCN-005'], // stat failure
        ['deep', 'SCN-001'], // children pruned at maxDepth 1
        ['excluded', 'SCN-007'], // exclude prefix
        ['mmm', 'SCN-006'], // unsupported type
        ['zzz', 'SCN-004'], // oversized
      ]),
    );
  });
});

describe('safeScanner.isSafeRelativePath', () => {
  it('accepts ordinary POSIX-relative paths', () => {
    for (const path of [
      'a',
      'a/b',
      'src/index.ts',
      'README.md',
      'a/b/c.txt',
      '-rf',
      '--upload.txt',
      '..hidden.ts',
    ]) {
      expect(isSafeRelativePath(path), path).toBe(true);
    }
  });

  it('rejects traversal, NUL, absolute, and degenerate paths', () => {
    for (const path of [
      '',
      '.',
      '..',
      '../x',
      'a/../x',
      'a/../../x',
      'a/..',
      '/etc/passwd',
      'C:/x',
      'c:\\x',
      'a\\b',
      'a\0b',
      'a//b',
      'a/',
      'a/./b',
      './a',
    ]) {
      expect(isSafeRelativePath(path), path).toBe(false);
    }
  });
});

describe('safeScanner.linkEscapes (pure math)', () => {
  it('resolves relative targets against baseDir', () => {
    expect(linkEscapes('a/b', '../c')).toBe(false);
    expect(linkEscapes('a/b', '../../c')).toBe(false);
    expect(linkEscapes('a/b', '../../../c')).toBe(true);
    expect(linkEscapes('a/b', '../../../../c')).toBe(true);
    expect(linkEscapes('', 'x')).toBe(false);
    expect(linkEscapes('', 'x/y')).toBe(false);
  });

  it('climbing above the root is an escape, touching the root is not', () => {
    expect(linkEscapes('a', '..')).toBe(false); // resolves to root
    expect(linkEscapes('a', '../b')).toBe(false); // still inside root
    expect(linkEscapes('a', '../..')).toBe(true);
    expect(linkEscapes('', '..')).toBe(true);
    expect(linkEscapes('', '../..')).toBe(true);
  });

  it('absolute targets and NUL always escape', () => {
    expect(linkEscapes('a', '/etc/passwd')).toBe(true);
    expect(linkEscapes('', '/abs')).toBe(true);
    expect(linkEscapes('a', 'C:/x')).toBe(true);
    expect(linkEscapes('a', 'x\0y')).toBe(true);
  });

  it('normalizes backslashes like Windows symlink targets', () => {
    expect(linkEscapes('a', '..\\..\\evil')).toBe(true);
    expect(linkEscapes('a', '..\\b')).toBe(false);
    expect(linkEscapes('', '..\\x')).toBe(true);
  });

  it('empty/dot targets resolve to the base itself', () => {
    expect(linkEscapes('a/b', '')).toBe(false);
    expect(linkEscapes('a/b', '.')).toBe(false);
  });

  it('is idempotent and locale-independent (pure math)', () => {
    const inputs: Array<[string, string]> = [
      ['src/lib', '../../etc/passwd'],
      ['src/lib', '../shared'],
      ['', 'a/b/../c'],
      ['nested/deep/dir', '../../..'],
    ];
    for (const [base, target] of inputs) {
      expect(linkEscapes(base, target)).toBe(linkEscapes(base, target));
    }
  });
});

describe('SCAN_DEFAULTS', () => {
  it('matches the frozen contract defaults', () => {
    expect(SCAN_DEFAULTS.maxDepth).toBe(32);
    expect(SCAN_DEFAULTS.maxEntries).toBe(100_000);
    expect(SCAN_DEFAULTS.maxFileBytes).toBe(5 * 1024 * 1024);
  });
});

describe('ScanReport shape', () => {
  it('is fully deterministic: same input yields byte-identical JSON', async () => {
    const scanner = safeScanner();
    const reader = constructorReader(sampleTree());
    const a = await scanner.scan('', reader, { exclude: ['node_modules'] });
    const b = await scanner.scan('', reader, { exclude: ['node_modules'] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.entries.some((e) => e.path.startsWith('node_modules'))).toBe(false);
  });
});
