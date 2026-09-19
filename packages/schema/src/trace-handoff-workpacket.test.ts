import { describe, expect, it } from 'vitest';
import { expectRejected, roundTripJson, roundTripYaml } from './test-utils.js';
import { HandoffSchema, TraceGraphSchema, WorkPacketSchema } from './trace-handoff-workpacket.js';

describe('TraceGraphSchema', () => {
  const valid = {
    schemaVersion: 1,
    links: [
      { id: 't-001', kind: 'requirement', from: 'REQ-GEN-004', to: 'P05-03' },
      { id: 't-002', kind: 'risk', from: 'R-007', to: 'P03-02', note: 'ownership' },
    ],
  };

  it('parses and round-trips trace links', () => {
    const parsed = roundTripJson(TraceGraphSchema, valid);
    expect(parsed.links).toHaveLength(2);
  });

  it('rejects an unknown link kind', () => {
    expectRejected(TraceGraphSchema, {
      ...valid,
      links: [{ ...valid.links[0], kind: 'maybe' }],
    });
  });

  it('rejects a link with an empty id', () => {
    expectRejected(TraceGraphSchema, {
      ...valid,
      links: [{ ...valid.links[0], id: '  ' }],
    });
  });
});

describe('HandoffSchema', () => {
  const valid = {
    schemaVersion: 1,
    phase: '01',
    status: 'COMPLETE',
    completedTasks: ['P01-01', 'P01-02', 'P01-03', 'P01-04', 'P01-05'],
    blocked: [],
    materialChanges: ['packages/cli/**', 'docs/12-adrs/ADR-0010'],
    testsRun: [
      { command: 'pnpm check', result: 'PASS', notes: 'exit 0' },
      { command: 'github actions ci', result: 'BLOCKED', notes: 'ghost registration' },
    ],
    securityFindings: ['no secrets committed'],
    decisions: ['ADR-0009', 'ADR-0010'],
    git: { branch: 'feat/phase-01-eng-foundation', commits: ['c50b4f1'], pr: '#1' },
    knownDebt: ['typescript-eslint deferred (R-019)'],
    nextPhase: '02',
    instructions: ['run repo commands with Node 24 on PATH'],
  };

  it('parses and round-trips a complete handoff', () => {
    const parsed = roundTripYaml(HandoffSchema, valid);
    expect(parsed.status).toBe('COMPLETE');
    expect(parsed.testsRun[0]?.result).toBe('PASS');
  });

  it('parses PARTIAL and BLOCKED statuses', () => {
    expect(() => HandoffSchema.parse({ ...valid, status: 'PARTIAL' })).not.toThrow();
    expect(() => HandoffSchema.parse({ ...valid, status: 'BLOCKED' })).not.toThrow();
  });

  it('rejects an invalid handoff status', () => {
    expectRejected(HandoffSchema, { ...valid, status: 'DONE' });
  });

  it('rejects an unknown test result value', () => {
    expectRejected(HandoffSchema, { ...valid, testsRun: [{ command: 'x', result: 'MAYBE' }] });
  });

  it('rejects unknown root fields', () => {
    expectRejected(HandoffSchema, { ...valid, summary: 'nope' }, 'Unrecognized key');
  });
});

describe('WorkPacketSchema', () => {
  const valid = {
    schemaVersion: 1,
    id: 'wp-001',
    taskId: 'P08-04',
    title: 'Compile parallel work packets',
    scope: 'workflow package only',
    inputs: ['planning/tasks.csv'],
    outputs: ['planning/work-packets/'],
    dependencies: ['task.P08-03'],
    status: 'planned',
  };

  it('parses and round-trips a work packet', () => {
    const parsed = roundTripJson(WorkPacketSchema, valid);
    expect(parsed.status).toBe('planned');
  });

  it('accepts an assignee', () => {
    const parsed = WorkPacketSchema.parse({ ...valid, assignee: 'worker-a' });
    expect(parsed.assignee).toBe('worker-a');
  });

  it('rejects an unknown status', () => {
    expectRejected(WorkPacketSchema, { ...valid, status: 'parked' });
  });

  it('rejects unknown packet fields', () => {
    expectRejected(WorkPacketSchema, { ...valid, estimate: '3d' }, 'Unrecognized key');
  });
});
