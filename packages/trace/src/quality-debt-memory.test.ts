import { describe, expect, it } from 'vitest';
import type { SessionMemoryRow } from '@planmo/workflow';
import type {
  DebtInput,
  DebtRecord,
  MemoryHealthInput,
  QualityFile,
  QualityInput,
} from './contracts.js';
import { qualityEngine, type QualityFileScan } from './quality.js';
import { debtEngine, type DebtInputWithPhase } from './debt.js';
import { memoryHealthEngine, type MemoryHealthReport } from './memory-health.js';

// ---------------------------------------------------------------- helpers

const file = (extra: Partial<QualityFile> = {}): QualityFile => ({
  path: 'src/a.ts',
  loc: 100,
  maxNesting: 2,
  todos: 0,
  exportsCount: 0,
  documentedExports: 0,
  hasTest: true,
  ...extra,
});

const scan = (extra: Partial<QualityFileScan> = {}): QualityFileScan => ({
  ...file(),
  ...extra,
});

const qualityInput = (files: readonly QualityFile[]): QualityInput => ({
  files,
  packages: {},
});

const debtRecord = (extra: Partial<DebtRecord> = {}): DebtRecord => ({
  id: 'DEBT-001',
  title: 'Legacy scanner coupling',
  status: 'closed',
  affectedPaths: ['packages/scan/src/parser.ts'],
  ...extra,
});

const memoryRow = (extra: Partial<SessionMemoryRow> = {}): SessionMemoryRow => ({
  id: 'mem-handoff-01',
  source: 'handoff',
  provenance: 'docs/decisions/ADR-0001.md',
  capturedAt: 0,
  sensitivity: 'public',
  statement: 'ADR-0001 was accepted.',
  ...extra,
});

// ---------------------------------------------------------------- quality

describe('qualityEngine (P09-06)', () => {
  it('flags an oversized file (QLT-001 info) and not the 400-line boundary', () => {
    const { diagnostics, counts } = qualityEngine().analyze(
      qualityInput([file({ path: 'src/huge.ts', loc: 401 })]),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'QLT-001',
      severity: 'info',
      target: 'src/huge.ts',
      category: 'excessive responsibility',
    });
    expect((diagnostics[0] as { evidence?: string }).evidence?.length ?? 0).toBeGreaterThan(0);
    expect(counts.info).toBe(1);

    // 400 exactly is not "in excess".
    expect(
      qualityEngine().analyze(qualityInput([file({ path: 'src/at-limit.ts', loc: 400 })]))
        .diagnostics,
    ).toEqual([]);
  });

  it('flags deep nesting (QLT-002 warning) and not depth 6', () => {
    const { diagnostics } = qualityEngine().analyze(
      qualityInput([
        file({ path: 'src/nested.ts', maxNesting: 7 }),
        file({ path: 'src/ok.ts', maxNesting: 6 }),
      ]),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'QLT-002',
      severity: 'warning',
      target: 'src/nested.ts',
    });
  });

  it('flags an uncovered file (QLT-004 error)', () => {
    const { diagnostics, counts } = qualityEngine().analyze(
      qualityInput([file({ path: 'src/untested.ts', hasTest: false })]),
    );
    expect(diagnostics[0]).toMatchObject({
      code: 'QLT-004',
      severity: 'error',
      target: 'src/untested.ts',
      category: 'missing tests',
    });
    expect(counts.error).toBe(1);
  });

  it('flags low API doc coverage (QLT-005 info) only below 50%', () => {
    const { diagnostics } = qualityEngine().analyze(
      qualityInput([
        file({ path: 'src/poor-docs.ts', exportsCount: 6, documentedExports: 2 }), // 33%
        file({ path: 'src/half-docs.ts', exportsCount: 6, documentedExports: 3 }), // 50% — ok
      ]),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'QLT-005',
      severity: 'info',
      target: 'src/poor-docs.ts',
      category: 'public API documentation gap',
    });
  });

  it('flags duplication markers (QLT-003) and side effects (QLT-006)', () => {
    const { diagnostics } = qualityEngine().analyze(
      qualityInput([
        scan({ path: 'src/dup.ts', duplicateOf: 'src/other.ts' }),
        scan({ path: 'src/impure.ts', sideEffects: true }),
      ]),
    );
    const dup = diagnostics.find((d) => d.code === 'QLT-003');
    expect(dup).toMatchObject({
      severity: 'warning',
      target: 'src/dup.ts',
      category: 'duplication',
      message: 'src/dup.ts duplicates src/other.ts',
    });
    expect(diagnostics.find((d) => d.code === 'QLT-006')).toMatchObject({
      severity: 'warning',
      target: 'src/impure.ts',
      category: 'hidden side effects',
    });
  });

  it('emits findings, never a vanity score', () => {
    const result = qualityEngine().analyze(
      qualityInput([
        file({ path: 'src/huge.ts', loc: 900 }),
        scan({ path: 'src/dup.ts', duplicateOf: 'src/other.ts' }),
        file({ path: 'src/untested.ts', hasTest: false }),
        file({ path: 'src/poor-docs.ts', exportsCount: 6, documentedExports: 1 }),
      ]),
    );
    expect(result).not.toHaveProperty('score');
    expect(Object.keys(result).sort()).toEqual(['counts', 'diagnostics']);
    // severity rank (error < warning < info), then code.
    expect(result.diagnostics.map((d) => d.code)).toEqual([
      'QLT-004',
      'QLT-003',
      'QLT-001',
      'QLT-005',
    ]);
  });

  it('clean input produces zero diagnostics', () => {
    const input = qualityInput([file(), file({ path: 'src/b.ts' })]);
    const result = qualityEngine().analyze(input);
    expect(result.diagnostics).toEqual([]);
    expect(result.counts).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it('is deterministic and byte-stable', () => {
    const input = qualityInput([
      scan({ path: 'src/dup.ts', duplicateOf: 'src/other.ts' }),
      file({ path: 'src/huge.ts', loc: 500 }),
      file({ path: 'src/untested.ts', hasTest: false }),
    ]);
    const a = JSON.stringify(qualityEngine().analyze(input));
    const b = JSON.stringify(qualityEngine().analyze(input));
    expect(a).toBe(b);
  });
});

// ------------------------------------------------------------------ debt

describe('debtEngine (P09-09)', () => {
  it('flags overdue open debt (DEBT-001 warning) using numeric phase compare', () => {
    const input: DebtInputWithPhase = {
      records: [debtRecord({ id: 'DEBT-A', status: 'open', targetPhase: '09' })],
      doneTasks: [],
      currentPhase: '10',
    };
    const { diagnostics, counts } = debtEngine().analyze(input);
    expect(diagnostics[0]).toMatchObject({
      code: 'DEBT-001',
      severity: 'warning',
      target: 'DEBT-A',
    });
    expect(counts.warning).toBe(1);

    // Not overdue: current phase at or before the target.
    const notDue = debtEngine().analyze({
      ...(input as DebtInput),
      currentPhase: '09',
    } as DebtInputWithPhase);
    expect(notDue.diagnostics.some((d) => d.code === 'DEBT-001')).toBe(false);
  });

  it('reports scheduled debt (DEBT-002 info)', () => {
    const { diagnostics } = debtEngine().analyze({
      records: [debtRecord({ id: 'DEBT-B', status: 'scheduled', targetPhase: '11' })],
      doneTasks: [],
    });
    expect(diagnostics[0]).toMatchObject({
      code: 'DEBT-002',
      severity: 'info',
      target: 'DEBT-B',
      message: 'debt DEBT-B is scheduled for 11',
    });
  });

  it('flags a pathless record (DEBT-003 warning) and an unknown status (DEBT-004 error)', () => {
    const pathless: DebtRecord = { id: 'DEBT-C', title: 'Wide refactor', status: 'open' };
    const { diagnostics } = debtEngine().analyze({
      records: [pathless, debtRecord({ id: 'DEBT-D', status: 'archived' })],
      doneTasks: [],
    });
    expect(diagnostics.find((d) => d.code === 'DEBT-003')).toMatchObject({
      severity: 'warning',
      target: 'DEBT-C',
    });
    expect(diagnostics.find((d) => d.code === 'DEBT-004')).toMatchObject({
      severity: 'error',
      target: 'DEBT-D',
      remediation: 'use one of: open, scheduled, closed',
    });
  });

  it('returns status counts alongside severity counts', () => {
    const result = debtEngine().analyze({
      records: [
        { id: 'DEBT-1', title: 'Open debt without paths', status: 'open' },
        debtRecord({ id: 'DEBT-2', status: 'open' }),
        debtRecord({ id: 'DEBT-3', status: 'closed' }),
      ],
      doneTasks: [],
    });
    expect(result.countsByStatus).toEqual({ closed: 1, open: 2 });
    expect(result.counts).toEqual({ error: 0, warning: 1, info: 0 }); // DEBT-003 x1
  });

  it('clean input produces zero diagnostics', () => {
    const input: DebtInput = {
      records: [debtRecord(), debtRecord({ id: 'DEBT-002', status: 'closed' })],
      doneTasks: ['P09-01'],
    };
    const result = debtEngine().analyze(input);
    expect(result.diagnostics).toEqual([]);
    expect(result.counts).toEqual({ error: 0, warning: 0, info: 0 });
    expect(result.countsByStatus).toEqual({ closed: 2 });
  });

  it('is deterministic and byte-stable', () => {
    const input: DebtInputWithPhase = {
      records: [
        debtRecord({ id: 'DEBT-A', status: 'open', targetPhase: '09' }),
        debtRecord({ id: 'DEBT-B', status: 'archived' }),
      ],
      doneTasks: [],
      currentPhase: '10',
    };
    const a = JSON.stringify(debtEngine().analyze(input));
    const b = JSON.stringify(debtEngine().analyze(input));
    expect(a).toBe(b);
  });
});

// ------------------------------------------------------------ memory health

describe('memoryHealthEngine (P09-10)', () => {
  it('flags a stale hash (MEM-001 warning) when the source changed', () => {
    const input: MemoryHealthInput = {
      rows: [memoryRow({ id: 'mem-handoff-01', sourceHash: 'hash-old' })],
      currentHashes: { 'docs/decisions/ADR-0001.md': 'hash-new' },
      indexEntries: [],
    };
    const { diagnostics, counts } = memoryHealthEngine().analyze(input);
    expect(diagnostics.find((d) => d.code === 'MEM-001')).toMatchObject({
      severity: 'warning',
      target: 'mem-handoff-01',
    });
    expect(counts.warning).toBe(1);
  });

  it('flags dangling provenance (MEM-002 warning) missing from currentHashes', () => {
    const input: MemoryHealthInput = {
      rows: [memoryRow({ id: 'mem-handoff-02', provenance: 'docs/missing.md' })],
      currentHashes: {},
      indexEntries: [],
    };
    const { diagnostics } = memoryHealthEngine().analyze(input);
    expect(diagnostics.find((d) => d.code === 'MEM-002')).toMatchObject({
      severity: 'warning',
      target: 'mem-handoff-02',
    });
  });

  it('flags duplicate (source, provenance) pairs (MEM-004 error)', () => {
    const input: MemoryHealthInput = {
      rows: [
        memoryRow({ id: 'mem-handoff-01' }),
        memoryRow({ id: 'mem-handoff-02' }), // same pair, different id
      ],
      currentHashes: { 'docs/decisions/ADR-0001.md': 'hash-01' },
      indexEntries: [],
    };
    const { diagnostics, counts } = memoryHealthEngine().analyze(input);
    expect(diagnostics.find((d) => d.code === 'MEM-004')).toMatchObject({
      severity: 'error',
      target: 'handoff/docs/decisions/ADR-0001.md',
      message: expect.stringContaining('dedupe needed'),
    });
    expect(counts.error).toBe(1);
  });

  it('sets rebuildRecommended and MEM-005 info when sourceHash rows exist', () => {
    const result: MemoryHealthReport = memoryHealthEngine().analyze({
      rows: [memoryRow({ id: 'mem-handoff-01', sourceHash: 'hash-01' })],
      currentHashes: { 'docs/decisions/ADR-0001.md': 'hash-01' },
      indexEntries: [],
    });
    expect(result.rebuildRecommended).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'MEM-005' && d.severity === 'info')).toBe(
      true,
    );

    const noHashes = memoryHealthEngine().analyze({
      rows: [memoryRow({ id: 'mem-handoff-01' })],
      currentHashes: { 'docs/decisions/ADR-0001.md': 'hash-01' },
      indexEntries: [],
    });
    expect(noHashes.rebuildRecommended).toBe(false);
  });

  it('reports MEM-003 info on an empty row set', () => {
    const result = memoryHealthEngine().analyze({
      rows: [],
      currentHashes: {},
      indexEntries: [],
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'MEM-003', severity: 'info', target: 'memory' }),
    ]);
    expect(result.rebuildRecommended).toBe(false);
    expect(result.counts.info).toBe(1);
  });

  it('clean input produces zero diagnostics', () => {
    const input: MemoryHealthInput = {
      rows: [
        memoryRow({ id: 'mem-handoff-01' }),
        memoryRow({ id: 'mem-handoff-02', provenance: 'docs/decisions/ADR-0002.md' }),
      ],
      currentHashes: {
        'docs/decisions/ADR-0001.md': 'hash-01',
        'docs/decisions/ADR-0002.md': 'hash-02',
      },
      indexEntries: [],
    };
    const result = memoryHealthEngine().analyze(input);
    expect(result.diagnostics).toEqual([]);
    expect(result.counts).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it('is deterministic and byte-stable', () => {
    const input: MemoryHealthInput = {
      rows: [
        memoryRow({ id: 'mem-handoff-02', sourceHash: 'hash-stale' }),
        memoryRow({ id: 'mem-handoff-01' }),
        memoryRow({ id: 'mem-handoff-03' }), // duplicate pair
      ],
      currentHashes: { 'docs/decisions/ADR-0001.md': 'hash-01' },
      indexEntries: [],
    };
    const a = JSON.stringify(memoryHealthEngine().analyze(input));
    const b = JSON.stringify(memoryHealthEngine().analyze(input));
    expect(a).toBe(b);
  });
});
