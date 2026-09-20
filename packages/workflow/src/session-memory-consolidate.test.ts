import { describe, expect, it } from 'vitest';
import { handoffBuilder } from './handoff.js';
import { sessionMemory } from './session-memory.js';
import { memoryConsolidator } from './consolidate.js';
import { MEMORY_SOURCES } from './contracts.js';
import type { SessionMemoryRow } from './contracts.js';

/** A handoff exercising all SIX capture sources (P08-08 mapping contract). */
function fullHandoff() {
  return handoffBuilder().build({
    phase: '08',
    status: 'PARTIAL',
    completedTasks: ['P08-01', 'P08-02'],
    blocked: [{ task: 'P08-03', reason: 'missing upstream dependency' }],
    decisions: ['DEC-0001 accepted', 'DEC-0002 accepted'],
    materialChanges: [
      'packages/workflow/src/consolidate.ts',
      'docs/14-context-memory/lifecycle.md',
    ],
    securityFindings: ['handoff writer must not persist secrets'],
    knownDebt: ['transition engine holds no debt record'],
    nextPhase: '09',
  });
}

/** First row of a non-empty set (guards noUncheckedIndexedAccess). */
function first<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('expected at least one row');
  return row;
}

function sortedBySourceId(rows: readonly SessionMemoryRow[]): boolean {
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const row = rows[i];
    if (prev === undefined || row === undefined) return false;
    if (row.source === prev.source ? row.id < prev.id : row.source < prev.source) {
      return false;
    }
  }
  return true;
}

describe('sessionMemory (P08-08)', () => {
  const memory = sessionMemory();

  it('beginSession returns the deterministic empty set (no chat text, REQ-MEM-005)', () => {
    expect(memory.beginSession({ sessionId: 's1', startedAt: 100 })).toEqual([]);
    // Deterministic: identical input -> identical (empty) row set.
    expect(memory.beginSession({ sessionId: 's1', startedAt: 100 })).toEqual(
      memory.beginSession({ sessionId: 's1', startedAt: 100 }),
    );
  });

  it('record appends the candidate and sorts by (source, id); pure', () => {
    const task: SessionMemoryRow = {
      id: 'mem-task-evidence-00',
      source: 'task-evidence',
      provenance: 'planning/tasks.csv',
      capturedAt: 0,
      sensitivity: 'public',
      statement: 'completed P08-01',
    };
    const decision: SessionMemoryRow = {
      id: 'mem-decision-00',
      source: 'decision',
      provenance: 'planning/DECISIONS.md',
      capturedAt: 0,
      sensitivity: 'public',
      statement: 'decided DEC-0001',
    };
    const blocker: SessionMemoryRow = {
      id: 'mem-blocker-resolution-00',
      source: 'blocker-resolution',
      provenance: 'planning/handoffs/phase-08-handoff.md',
      capturedAt: 0,
      sensitivity: 'internal',
      statement: 'blocked P08-03: reason',
    };

    const before = [task, decision];
    const recorded = memory.record(before, blocker);

    expect(recorded).toEqual([blocker, decision, task]); // sorted (source, id)
    expect(before).toEqual([task, decision]); // caller's array untouched
    expect(memory.record(before, blocker)).toEqual(recorded); // deterministic
  });

  it('candidatesFromHandoff maps all six fields with correct sources/provenances', () => {
    const rows = memory.candidatesFromHandoff(fullHandoff());

    expect(rows).toHaveLength(9);
    expect(sortedBySourceId(rows)).toBe(true);
    for (const row of rows) expect(MEMORY_SOURCES).toContain(row.source);
    for (const row of rows) expect(row.capturedAt).toBe(0); // stamped at consolidation

    // completedTasks -> task-evidence / planning/tasks.csv
    const completed = rows.filter((r) => r.provenance === 'planning/tasks.csv');
    expect(completed.map((r) => r.statement)).toEqual(['completed P08-01', 'completed P08-02']);
    for (const r of completed) {
      expect(r.source).toBe('task-evidence');
      expect(r.sensitivity).toBe('public');
    }

    // blocked -> blocker-resolution / handoff doc, sensitivity INTERNAL
    const blocked = rows.filter((r) => r.source === 'blocker-resolution');
    expect(blocked).toHaveLength(1);
    const blockedRow = first(blocked);
    expect(blockedRow.provenance).toBe('planning/handoffs/phase-08-handoff.md');
    expect(blockedRow.statement).toBe('blocked P08-03: missing upstream dependency');
    expect(blockedRow.sensitivity).toBe('internal');

    // decisions -> decision / planning/DECISIONS.md
    const decisions = rows.filter((r) => r.source === 'decision');
    expect(decisions.map((r) => r.statement)).toEqual([
      'decided DEC-0001 accepted',
      'decided DEC-0002 accepted',
    ]);
    for (const r of decisions) {
      expect(r.provenance).toBe('planning/DECISIONS.md');
      expect(r.sensitivity).toBe('public');
    }

    // materialChanges -> task-evidence, provenance = the changed path itself
    const changed = rows.filter((r) => r.statement.startsWith('changed '));
    // doc.materialChanges arrives sorted (handoffBuilder sorts), so the
    // docs path precedes the packages path.
    expect(changed.map((r) => [r.provenance, r.statement])).toEqual([
      ['docs/14-context-memory/lifecycle.md', 'changed docs/14-context-memory/lifecycle.md'],
      ['packages/workflow/src/consolidate.ts', 'changed packages/workflow/src/consolidate.ts'],
    ]);

    // securityFindings -> task-evidence / handoff doc
    const finding = rows.find((r) => r.statement.startsWith('finding '));
    expect(finding).toMatchObject({
      source: 'task-evidence',
      provenance: 'planning/handoffs/phase-08-handoff.md',
      sensitivity: 'public',
      statement: 'finding handoff writer must not persist secrets',
    });

    // knownDebt -> task-evidence / handoff doc
    const debt = rows.find((r) => r.statement.startsWith('debt '));
    expect(debt).toMatchObject({
      source: 'task-evidence',
      provenance: 'planning/handoffs/phase-08-handoff.md',
      sensitivity: 'public',
      statement: 'debt transition engine holds no debt record',
    });

    // Deterministic zero-padded candidate ids.
    for (const row of rows) {
      expect(row.id).toMatch(/^cand-(task-evidence|decision|blocker-resolution)-\d{2}$/);
    }
  });

  it('candidatesFromHandoff ignores non-capture fields (testsRun, git, instructions)', () => {
    const doc = handoffBuilder().build({
      phase: '08',
      status: 'COMPLETE',
      completedTasks: [],
      testsRun: [{ command: 'pnpm test', result: 'PASS' }],
      git: { branch: 'main', commits: ['abc123'] },
      instructions: ['do a thing'],
      nextPhase: '09',
    });
    expect(memory.candidatesFromHandoff(doc)).toEqual([]);
  });

  it('pruneStale removes only rows with a stale/missing sourceHash; unhashable rows are kept', () => {
    const rows: SessionMemoryRow[] = [
      {
        id: 'm1',
        source: 'task-evidence',
        provenance: 'planning/tasks.csv',
        capturedAt: 0,
        sensitivity: 'public',
        statement: 'completed P08-01',
        sourceHash: 'abc',
      },
      {
        id: 'm2',
        source: 'task-evidence',
        provenance: 'planning/tasks.csv',
        capturedAt: 0,
        sensitivity: 'public',
        statement: 'completed P08-02',
        sourceHash: 'stale-hash',
      },
      {
        id: 'm3',
        source: 'decision',
        provenance: 'planning/DECISIONS.md',
        capturedAt: 0,
        sensitivity: 'public',
        statement: 'decided DEC-0001',
        // no sourceHash: not prunable
      },
      {
        id: 'm4',
        source: 'task-evidence',
        provenance: 'planning/tasks.csv',
        capturedAt: 0,
        sensitivity: 'public',
        statement: 'completed P08-03',
        sourceHash: 'ghost', // provenance absent from current index
      },
    ];

    const pruned = memory.pruneStale(rows, { 'planning/tasks.csv': 'abc' });

    expect(pruned.map((r) => r.id)).toEqual(['m3', 'm1']); // kept + sorted
    expect(rows).toHaveLength(4); // pure
  });
});

describe('memoryConsolidator (P08-09)', () => {
  const consolidator = memoryConsolidator();

  it('consolidates a handoff into deterministic sorted memory rows', () => {
    const doc = handoffBuilder().build({
      phase: '08',
      status: 'PARTIAL',
      completedTasks: ['P08-01'],
      blocked: [{ task: 'P08-02', reason: 'no test oracle' }],
      decisions: ['DEC-9 accepted'],
      nextPhase: '09',
    });

    expect(consolidator.consolidate(doc, { now: 500 })).toEqual([
      {
        id: 'mem-blocker-resolution-00',
        source: 'blocker-resolution',
        provenance: 'planning/handoffs/phase-08-handoff.md',
        capturedAt: 500,
        sensitivity: 'internal',
        statement: 'blocked P08-02: no test oracle',
      },
      {
        id: 'mem-decision-00',
        source: 'decision',
        provenance: 'planning/DECISIONS.md',
        capturedAt: 500,
        sensitivity: 'public',
        statement: 'decided DEC-9 accepted',
      },
      {
        id: 'mem-task-evidence-00',
        source: 'task-evidence',
        provenance: 'planning/tasks.csv',
        capturedAt: 500,
        sensitivity: 'public',
        statement: 'completed P08-01',
      },
    ]);
  });

  it('dedupes identical (source, provenance) rows keeping the first', () => {
    const doc = handoffBuilder().build({
      phase: '08',
      status: 'COMPLETE',
      completedTasks: ['P08-01', 'P08-01'], // duplicate entry
      nextPhase: '09',
    });

    const rows = consolidator.consolidate(doc);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'mem-task-evidence-00',
      source: 'task-evidence',
      provenance: 'planning/tasks.csv',
      statement: 'completed P08-01',
      sensitivity: 'public',
      capturedAt: 0,
    });
  });

  it('supersedes same-provenance changed statements (later sort position wins)', () => {
    const doc = handoffBuilder().build({
      phase: '08',
      status: 'COMPLETE',
      completedTasks: [],
      decisions: ['DEC-0001 accepted', 'DEC-0002 accepted'],
      nextPhase: '09',
    });

    const rows = consolidator.consolidate(doc, { now: 7 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'mem-decision-00',
      statement: 'decided DEC-0002 accepted',
      capturedAt: 7,
    });
  });

  it('one row per (source, provenance): the newest completed-task statement wins', () => {
    // Both tasks map to (task-evidence, planning/tasks.csv). The later sort
    // position (later completed task) supersedes; the canonical tasks.csv
    // retains the full list (ADR-0013: canonical state outranks memory).
    const doc = handoffBuilder().build({
      phase: '08',
      status: 'COMPLETE',
      completedTasks: ['P08-01', 'P08-02', 'P08-03'],
      nextPhase: '09',
    });

    const rows = consolidator.consolidate(doc);
    expect(rows).toHaveLength(1);
    expect(first(rows).statement).toBe('completed P08-03');
  });

  it('stamps capturedAt from opts.now; 0 when absent', () => {
    const doc = handoffBuilder().build({
      phase: '08',
      status: 'COMPLETE',
      completedTasks: ['P08-01'],
      nextPhase: '09',
    });

    expect(first(consolidator.consolidate(doc, { now: 4242 })).capturedAt).toBe(4242);
    expect(first(consolidator.consolidate(doc)).capturedAt).toBe(0);
  });

  it('is deterministic byte-identical for the same input', () => {
    const first = consolidator.consolidate(fullHandoff(), { now: 123 });
    const second = memoryConsolidator().consolidate(fullHandoff(), { now: 123 });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(consolidator.consolidate(fullHandoff(), { now: 123 }))).toBe(
      JSON.stringify(first),
    );
  });

  it('returns no rows when the handoff carries no capture sources', () => {
    const doc = handoffBuilder().build({
      phase: '08',
      status: 'COMPLETE',
      completedTasks: [],
      nextPhase: '09',
    });
    expect(consolidator.consolidate(doc)).toEqual([]);
  });
});
