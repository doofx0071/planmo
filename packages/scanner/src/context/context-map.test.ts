import { describe, expect, it } from 'vitest';

import type {
  DetectionEvidence,
  DetectionReport,
  DetectedStack,
  RepositoryContextMap,
  ScanEntry,
  ScanReport,
} from '../contracts.js';
import { contextMapEngine } from './context-map.js';

// ---------------------------------------------------------------------------
// Small constructors (test doubles; detection evidence follows the documented
// manifest-evidence convention — see context-map.ts module header).
// ---------------------------------------------------------------------------

function file(path: string, size = 10): ScanEntry {
  return { path, type: 'file', size };
}

function dir(path: string): ScanEntry {
  return { path, type: 'dir', size: 0 };
}

function symlink(path: string): ScanEntry {
  return { path, type: 'symlink', size: 4 };
}

function evidence(path: string, code: string, match: string, source: DetectionEvidence['source'] = 'manifest'): DetectionEvidence {
  return { path, source, code, match };
}

function stack(id: string, ...items: DetectionEvidence[]): DetectedStack {
  return { id, category: 'language', confidence: 'high', evidence: items };
}

function detection(...stacks: DetectedStack[]): DetectionReport {
  return { stacks, testFrameworks: [], ciSystems: [] };
}

// ---------------------------------------------------------------------------
// Repository context map (P10-06 / CHG-001)
// ---------------------------------------------------------------------------

describe('contextMapEngine.map — entry points', () => {
  it('finds README and src/ from the scan', async () => {
    const scan: ScanReport = {
      root: 'repo',
      entries: [dir('src'), file('README.md'), file('package.json')],
      warnings: [],
      stats: { files: 2, dirs: 1, symlinks: 0, totalBytes: 0 },
      truncatedBy: null,
    };
    const map = await contextMapEngine().map(scan, detection());
    expect(map.entryPoints).toEqual(['README.md', 'src/']);
  });

  it('includes manifest main/bin/exports keys from detection evidence', async () => {
    const scan: ScanReport = {
      root: 'repo',
      entries: [dir('src'), file('README.md'), file('package.json'), file('packages/a/package.json')],
      warnings: [],
      stats: { files: 4, dirs: 1, symlinks: 0, totalBytes: 0 },
      truncatedBy: null,
    };
    const det = detection(
      stack(
        'ts',
        evidence('package.json', 'DET-001', 'main'),
        evidence('package.json', 'DET-001', 'bin'),
        evidence('package.json', 'DET-001', 'bin.brownfield'),
        evidence('package.json', 'DET-001', 'exports'),
        evidence('package.json', 'DET-001', 'dependencies.express'), // not an entry point
        evidence('packages/a/package.json', 'DET-001', 'bin.a'),
      ),
    );
    const map = await contextMapEngine().map(scan, det);
    expect(map.entryPoints).toEqual([
      'README.md',
      'package.json#bin',
      'package.json#bin.brownfield',
      'package.json#exports',
      'package.json#main',
      'packages/a/package.json#bin.a',
      'src/',
    ]);
  });

  it('dedupes evidence that appears in multiple stacks', async () => {
    const scan: ScanReport = {
      root: 'repo',
      entries: [file('package.json')],
      warnings: [],
      stats: { files: 1, dirs: 0, symlinks: 0, totalBytes: 0 },
      truncatedBy: null,
    };
    const det = detection(
      stack('ts', evidence('package.json', 'DET-001', 'main')),
      stack('js', evidence('package.json', 'DET-001', 'main')),
    );
    const map = await contextMapEngine().map(scan, det);
    expect(map.entryPoints.filter((e) => e === 'package.json#main')).toHaveLength(1);
  });
});

describe('contextMapEngine.map — scripts', () => {
  it('collects scripts from DET-002 manifest scripts evidence, sorted', async () => {
    const scan: ScanReport = {
      root: 'repo',
      entries: [file('package.json')],
      warnings: [],
      stats: { files: 1, dirs: 0, symlinks: 0, totalBytes: 0 },
      truncatedBy: null,
    };
    const det = detection(
      stack(
        'ts',
        evidence('package.json', 'DET-002', 'scripts.build'),
        evidence('package.json', 'DET-002', 'scripts.test'),
        evidence('package.json', 'DET-002', 'scripts.lint'),
      ),
    );
    const map = await contextMapEngine().map(scan, det);
    expect(map.scripts).toEqual([
      { path: 'package.json', name: 'build' },
      { path: 'package.json', name: 'lint' },
      { path: 'package.json', name: 'test' },
    ]);
  });

  it('keeps per-manifest path grouping; ignores non-script evidence and empty names', async () => {
    const scan: ScanReport = {
      root: 'repo',
      entries: [file('package.json'), file('packages/a/package.json')],
      warnings: [],
      stats: { files: 2, dirs: 0, symlinks: 0, totalBytes: 0 },
      truncatedBy: null,
    };
    const det = detection(
      stack(
        'ts',
        evidence('package.json', 'DET-002', 'scripts.build'),
        evidence('package.json', 'DET-002', 'scripts.'), // empty name -> dropped
        evidence('package.json', 'DET-001', 'scripts.build'), // wrong code -> dropped
        evidence('package.json', 'DET-002', 'dependencies.x'), // not scripts.
        evidence('packages/a/package.json', 'DET-002', 'scripts.test'),
      ),
    );
    const map = await contextMapEngine().map(scan, det);
    expect(map.scripts).toEqual([
      { path: 'package.json', name: 'build' },
      { path: 'packages/a/package.json', name: 'test' },
    ]);
  });
});

describe('contextMapEngine.map — topLevel counts', () => {
  const scan: ScanReport = {
    root: 'repo',
    entries: [
      dir('src'),
      file('src/index.ts'),
      dir('src/components'),
      file('src/components/Button.tsx'),
      file('src/README.md'), // depth-2 file under src
      dir('docs'),
      file('docs/guide.md'),
      dir('scripts'),
      file('scripts/build.js'),
      // beyond depth 2
      dir('src/components/ui'),
      file('src/components/ui/Modal.tsx'),
      dir('deep'),
      dir('deep/a'),
      dir('deep/a/b'),
      file('deep/a/b/c.txt'),
      file('root-file.txt'),
      symlink('src/link'),
    ],
    warnings: [],
    stats: { files: 1, dirs: 1, symlinks: 1, totalBytes: 0 },
    truncatedBy: null,
  };

  it('lists dirs at depth 1..2 with direct file/dir counts', async () => {
    const map: RepositoryContextMap = await contextMapEngine().map(scan, detection());
    expect(map.topLevel).toEqual([
      { path: 'deep', files: 0, dirs: 1 },
      { path: 'deep/a', files: 0, dirs: 1 },
      { path: 'docs', files: 1, dirs: 0 },
      { path: 'scripts', files: 1, dirs: 0 },
      { path: 'src', files: 2, dirs: 1 },
      { path: 'src/components', files: 1, dirs: 1 },
    ]);
  });

  it('ignores symlinks in counts but keeps them out of topLevel', async () => {
    const map = await contextMapEngine().map(scan, detection());
    expect(map.topLevel.every((t) => t.path !== 'src/link')).toBe(true);
    expect(map.topLevel.find((t) => t.path === 'src')?.files).toBe(2); // index.ts + README.md
  });
});

describe('contextMapEngine.map — config files', () => {
  const scan: ScanReport = {
    root: 'repo',
    entries: [
      file('.env'),
      file('.env.example'),
      file('.env.local'),
      file('package.json'), // not a config file by convention
      file('tsconfig.json'),
      file('tsconfig.build.json'),
      file('eslint.config.js'),
      file('webpack.config.ts'),
      file('rollup.config.mjs'),
      file('Makefile'),
      file('Dockerfile'),
      dir('src'),
      file('src/tsconfig.app.json'), // tsconfig* under src still matches
    ],
    warnings: [],
    stats: { files: 9, dirs: 1, symlinks: 0, totalBytes: 0 },
    truncatedBy: null,
  };

  it('matches .env*, *.config.*, tsconfig*.json conventions only', async () => {
    const map = await contextMapEngine().map(scan, detection());
    expect(map.configFiles).toEqual([
      '.env',
      '.env.example',
      '.env.local',
      'eslint.config.js',
      'rollup.config.mjs',
      'src/tsconfig.app.json',
      'tsconfig.build.json',
      'tsconfig.json',
      'webpack.config.ts',
    ]);
  });
});

describe('contextMapEngine.map — warnings passthrough + CTX warnings', () => {
  it('passes scan warnings through (formatted) and appends CTX warnings', async () => {
    const scan: ScanReport = {
      root: 'repo',
      entries: [file('.env.local'), file('src/index.ts'), dir('src')],
      warnings: [
        { code: 'SCN-004', path: 'big.bin', message: 'file exceeds maxFileBytes (20 > 10); skipped' },
        { code: 'SCN-007', path: 'node_modules', message: 'excluded by exclude prefix' },
      ],
      stats: { files: 2, dirs: 1, symlinks: 0, totalBytes: 20 },
      truncatedBy: null,
    };
    const map = await contextMapEngine().map(scan, detection());
    expect(map.warnings).toContain('SCN-004 big.bin: file exceeds maxFileBytes (20 > 10); skipped');
    expect(map.warnings).toContain('SCN-007 node_modules: excluded by exclude prefix');
    expect(map.warnings.some((w) => w.startsWith('CTX-001 .env.local:'))).toBe(true);
  });

  it('CTX-001 fires for .env files that are not *.example; .env.example is silent', async () => {
    const scan = (files: ScanEntry[]): ScanReport => ({
      root: 'repo',
      entries: files,
      warnings: [],
      stats: { files: files.length, dirs: 0, symlinks: 0, totalBytes: 0 },
      truncatedBy: null,
    });
    const withEnv = await contextMapEngine().map(scan([file('.env'), file('src/.env.local')]), detection());
    expect(withEnv.warnings.filter((w) => w.startsWith('CTX-001'))).toHaveLength(2);

    const exampleOnly = await contextMapEngine().map(scan([file('.env.example')]), detection());
    expect(exampleOnly.warnings.filter((w) => w.startsWith('CTX-001'))).toHaveLength(0);
  });

  it('CTX-002 when no manifest is present; CTX-003 when no entry points', async () => {
    const scan: ScanReport = {
      root: 'repo',
      entries: [file('notes.txt'), dir('lib')],
      warnings: [],
      stats: { files: 1, dirs: 1, symlinks: 0, totalBytes: 0 },
      truncatedBy: null,
    };
    const map = await contextMapEngine().map(scan, detection());
    expect(map.warnings).toContain('CTX-002 (root): no package.json manifest found in scan');
    expect(map.warnings).toContain('CTX-003 (root): no entry points discovered');
  });

  it('sorts and dedupes warnings deterministically', async () => {
    const scan: ScanReport = {
      root: 'repo',
      entries: [file('package.json'), file('a.env')],
      warnings: [
        { code: 'SCN-007', path: 'zzz', message: 'excluded by exclude prefix' },
        { code: 'SCN-004', path: 'aaa', message: 'file exceeds maxFileBytes (1 > 0); skipped' },
        { code: 'SCN-004', path: 'aaa', message: 'file exceeds maxFileBytes (1 > 0); skipped' }, // duplicate
      ],
      stats: { files: 2, dirs: 0, symlinks: 0, totalBytes: 0 },
      truncatedBy: null,
    };
    const det = detection(stack('ts', evidence('package.json', 'DET-001', 'main')));
    const map = await contextMapEngine().map(scan, det);
    const sorted = [...map.warnings].sort();
    expect(map.warnings).toEqual(sorted);
    expect(new Set(map.warnings).size).toBe(map.warnings.length); // deduped
  });
});

describe('contextMapEngine.map — determinism + extras', () => {
  it('maps the same scan+detection to byte-identical JSON twice', async () => {
    const scan: ScanReport = {
      root: 'repo',
      entries: [
        dir('src'),
        file('README.md'),
        file('package.json'),
        file('.env.example'),
        dir('docs'),
        file('docs/guide.md'),
      ],
      warnings: [],
      stats: { files: 3, dirs: 2, symlinks: 0, totalBytes: 0 },
      truncatedBy: null,
    };
    const det = detection(
      stack(
        'ts',
        evidence('package.json', 'DET-001', 'main'),
        evidence('package.json', 'DET-002', 'scripts.test'),
      ),
    );
    const a = await contextMapEngine().map(scan, det);
    const b = await contextMapEngine().map(scan, det);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.root).toBe('repo');
    expect(a.entryPoints).toEqual(['README.md', 'package.json#main', 'src/']);
    expect(a.scripts).toEqual([{ path: 'package.json', name: 'test' }]);
    expect(a.configFiles).toEqual(['.env.example']);
  });

  it('handles an empty scan gracefully', async () => {
    const scan: ScanReport = {
      root: 'empty',
      entries: [],
      warnings: [],
      stats: { files: 0, dirs: 0, symlinks: 0, totalBytes: 0 },
      truncatedBy: null,
    };
    const map = await contextMapEngine().map(scan, detection());
    expect(map.entryPoints).toEqual([]);
    expect(map.topLevel).toEqual([]);
    expect(map.configFiles).toEqual([]);
    expect(map.scripts).toEqual([]);
    expect(map.warnings).toEqual(['CTX-003 (root): no entry points discovered']);
  });
});

describe('contextMapEngine name', () => {
  it('is context-map', () => {
    expect(contextMapEngine().name).toBe('context-map');
  });
});