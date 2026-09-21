import { describe, expect, it } from 'vitest';
import type { DetectionReport, ScanReport } from '../contracts.js';
import { memoryBootstrap } from './memory-bootstrap.js';

const IMPERATIVE_PATTERNS: ReadonlyArray<RegExp> = [
  /^use\b/i,
  /^ensure\b/i,
  /^must\b/i,
  /^always\b/i,
  /^never\b/i,
  /^please\b/i,
  /^remember\b/i,
  /\byou must\b/i,
  /\byou will\b/i,
  /\bdo not\b/i,
  /\balways\b/i,
  /\bnever\b/i,
  /\bensure\b/i,
  /\bplease\b/i,
];

function makeScan(overrides: Partial<ScanReport> = {}): ScanReport {
  return {
    root: '/demo',
    entries: [
      { path: 'AGENTS.md', type: 'file', size: 900 },
      { path: 'README.md', type: 'file', size: 512 },
      { path: 'package.json', type: 'file', size: 1024 },
      { path: 'vendor', type: 'dir', size: 0 },
      { path: 'vendor/link', type: 'symlink', size: 20 },
      { path: 'src', type: 'dir', size: 0 },
      { path: 'src/app.ts', type: 'file', size: 2048 },
    ],
    warnings: [
      { code: 'SCN-004', path: 'big.bin', message: 'skipped over size' },
      { code: 'SCN-005', path: 'src/app.ts', message: 'unreadable entry' },
    ],
    stats: { files: 4, dirs: 2, symlinks: 1, totalBytes: 4504 },
    truncatedBy: null,
    ...overrides,
  };
}

function makeDetection(overrides: Partial<DetectionReport> = {}): DetectionReport {
  return {
    stacks: [
      {
        id: 'typescript',
        category: 'language',
        confidence: 'high',
        evidence: [
          { path: 'tsconfig.json', source: 'config', code: 'DET-003', match: 'compilerOptions' },
          {
            path: 'package.json',
            source: 'manifest',
            code: 'DET-001',
            match: 'devDependencies.typescript',
          },
        ],
      },
      {
        id: 'node',
        category: 'runtime',
        confidence: 'high',
        evidence: [
          { path: 'package.json', source: 'manifest', code: 'DET-001', match: 'engines.node' },
        ],
      },
    ],
    testFrameworks: ['vitest'],
    ciSystems: ['github-actions'],
    ...overrides,
  };
}

describe('memoryBootstrap.bootstrap()', () => {
  it('declares facts, not instructions', async () => {
    const facts = await memoryBootstrap.bootstrap(makeScan(), makeDetection());
    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) {
      for (const pattern of IMPERATIVE_PATTERNS) {
        expect(fact.fact, `fact "${fact.fact}" must not match ${pattern}`).not.toMatch(pattern);
      }
      expect(fact.fact).not.toContain('use TypeScript');
    }
  });

  it('assigns stable ids derived from content', async () => {
    const facts = await memoryBootstrap.bootstrap(makeScan(), makeDetection());
    for (const fact of facts) {
      expect(fact.id).toMatch(/^fact-[0-9a-f]{8}$/);
    }
    const ids = facts.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length); // unique
    expect(ids).toEqual([...ids].sort()); // sorted id asc
  });

  it('carries exact, unique, sorted provenance', async () => {
    const facts = await memoryBootstrap.bootstrap(makeScan(), makeDetection());
    for (const fact of facts) {
      expect(fact.provenance.length).toBeGreaterThan(0);
      expect(fact.provenance).toEqual([...new Set(fact.provenance)].sort());
    }
    const typescript = facts.find((f) => f.fact.includes('typescript'))!;
    expect(typescript.provenance).toEqual(['package.json', 'tsconfig.json']);
    const agents = facts.find((f) => f.fact.includes('AGENTS.md'))!;
    expect(agents.provenance).toEqual(['AGENTS.md']);
    expect(agents.scope).toBe('security');
  });

  it('covers all three scopes with deterministic contents', async () => {
    const facts = await memoryBootstrap.bootstrap(makeScan(), makeDetection());
    const scopes = new Set(facts.map((f) => f.scope));
    expect(scopes).toEqual(new Set(['repo', 'stack', 'security']));

    const texts = facts.map((f) => f.fact);
    expect(texts).toContain(
      'Repository at /demo contains 4 files, 2 directories and 1 symlinks (4504 bytes).',
    );
    expect(texts).toContain('Repository has a README.md at the root.');
    expect(texts).toContain('Repository has an AGENTS.md at the root.');
    expect(texts).toContain('Repository uses typescript (language, high confidence).');
    expect(texts).toContain('Repository uses node (runtime, high confidence).');
    expect(texts).toContain('Repository declares the vitest test framework.');
    expect(texts).toContain('Repository declares github-actions for CI.');
    expect(texts).toContain('Repository contains 1 symlink entries.');
    expect(texts).toContain('Scanner recorded 2 warnings while scanning the repository.');
  });

  it('derives the truncatedBy fact when a cap cut the scan short', async () => {
    const facts = await memoryBootstrap.bootstrap(
      makeScan({ truncatedBy: 'depth' }),
      makeDetection(),
    );
    expect(facts.map((f) => f.fact)).toContain('Scan was truncated by the depth cap.');
    const truncated = facts.find((f) => f.fact.startsWith('Scan was truncated'))!;
    expect(truncated.provenance).toEqual(['/demo']);
  });

  it('handles sparse repositories without fabrication', async () => {
    const facts = await memoryBootstrap.bootstrap(
      makeScan({
        entries: [{ path: 'main.py', type: 'file', size: 10 }],
        warnings: [],
        stats: { files: 1, dirs: 0, symlinks: 0, totalBytes: 10 },
      }),
      makeDetection({ stacks: [], testFrameworks: [], ciSystems: [] }),
    );
    expect(facts).toHaveLength(1); // only the aggregate repo fact
    expect(facts[0]!.scope).toBe('repo');
    expect(facts[0]!.fact).toContain('contains 1 files, 0 directories and 0 symlinks (10 bytes)');
  });

  it('is deterministic across repeated calls', async () => {
    const a = await memoryBootstrap.bootstrap(makeScan(), makeDetection());
    const b = await memoryBootstrap.bootstrap(makeScan(), makeDetection());
    expect(a).toEqual(b);
  });
});
