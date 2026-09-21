import { describe, expect, it } from 'vitest';
import type { TraceInput } from './contracts.js';
import {
  driftFixture,
  driftFixtureExpectedMissingEvidence,
  driftFixtureExpectedOrphans,
} from './fixtures/drift.js';
import { createTraceGraphEngine, type TraceGraphReport } from './trace-graph.js';
import { traceRenderer } from './trace-render.js';

const engine = createTraceGraphEngine();
const renderer = traceRenderer();

const build = (input: TraceInput): TraceGraphReport => engine.build(input) as TraceGraphReport;

/** Fully linked + tested input: every DONE task has passing evidence. */
const cleanInput = (): TraceInput => ({
  requirements: ['REQ-A', 'REQ-B'],
  tasks: [
    { id: 'P01-01', phase: '01', title: 'Setup', status: 'DONE' },
    { id: 'P02-01', phase: '02', title: 'Model', status: 'DONE' },
  ],
  decisions: [],
  tests: [
    { name: 'setup works', file: 'setup.test.ts', task: 'P01-01', passing: true },
    { name: 'model works', file: 'model.test.ts', task: 'P02-01', passing: true },
  ],
  links: [
    { from: 'REQ-A', to: 'P01-01' },
    { from: 'REQ-B', to: 'P02-01' },
  ],
});

describe('createTraceGraphEngine (P09-01)', () => {
  it('flags the orphaned requirement REQ-C on the drift fixture (TRC-001)', () => {
    const report = build(driftFixture);
    expect(report.orphans).toEqual(driftFixtureExpectedOrphans);
    expect(
      report.diagnostics.some(
        (d) => d.code === 'TRC-001' && d.target === 'REQ-C' && d.severity === 'warning',
      ),
    ).toBe(true);
    expect(report.diagnostics.find((d) => d.code === 'TRC-001')?.message).toBe(
      'orphaned requirement REQ-C: no trace links',
    );
  });

  it('flags P03-01 as having no test evidence on the drift fixture (TRC-002)', () => {
    const report = build(driftFixture);
    expect(report.missingEvidence).toEqual(driftFixtureExpectedMissingEvidence);
    expect(
      report.diagnostics.some(
        (d) => d.code === 'TRC-002' && d.target === 'P03-01' && d.severity === 'warning',
      ),
    ).toBe(true);
    expect(report.diagnostics.find((d) => d.code === 'TRC-002')?.message).toBe(
      'task P03-01 has no test evidence',
    );
  });

  it('reports per-kind counts on the drift fixture', () => {
    const report = build(driftFixture);
    expect(report.counts).toEqual({ requirements: 3, tasks: 4, tests: 4, links: 2 });
  });

  it('keeps the frozen TraceGraph shape (nodes/orphans/untested/diagnostics)', () => {
    const report = build(driftFixture);
    expect(report.nodes.length).toBe(3 + 4 + 2 + 4); // requirements + tasks + decisions + tests
    expect(report.untested).toEqual([]);
    expect(report.nodes.every((n) => n.edges.every((e) => e.includes(' -> ')))).toBe(true);
    const reqC = report.nodes.find((n) => n.id === 'REQ-C');
    expect(reqC?.kind).toBe('requirement');
    expect(reqC?.edges).toEqual([]);
  });

  it('yields zero diagnostics for a clean fully-linked and tested input', () => {
    const report = build(cleanInput());
    expect(report.diagnostics).toEqual([]);
    expect(report.orphans).toEqual([]);
    expect(report.untested).toEqual([]);
    expect(report.missingEvidence).toEqual([]);
  });

  it('flags a test referencing a missing task as an error (TRC-003)', () => {
    const input: TraceInput = {
      ...cleanInput(),
      tests: [
        ...cleanInput().tests,
        { name: 'ghost task test', file: 'ghost.test.ts', task: 'PX-99', passing: true },
      ],
    };
    const report = build(input);
    const d = report.diagnostics.find((x) => x.code === 'TRC-003');
    expect(d).toBeDefined();
    expect(d?.severity).toBe('error');
    expect(d?.target).toBe('ghost task test');
    expect(d?.message).toBe('test ghost task test references unknown task PX-99');
  });

  it('flags a link targeting a missing entity as an error (TRC-004)', () => {
    const input: TraceInput = {
      ...driftFixture,
      links: [...driftFixture.links, { from: 'REQ-A', to: 'PX-99' }],
    };
    const report = build(input);
    const d = report.diagnostics.find((x) => x.code === 'TRC-004');
    expect(d).toBeDefined();
    expect(d?.severity).toBe('error');
    expect(d?.target).toBe('REQ-A -> PX-99');
    expect(d?.message).toBe('link REQ-A -> PX-99 references unknown target PX-99');
  });

  it('sorts diagnostics by severity rank, then code, then target', () => {
    const input: TraceInput = {
      ...driftFixture,
      links: [...driftFixture.links, { from: 'REQ-A', to: 'PX-99' }],
    };
    const report = build(input);
    const codes = report.diagnostics.map((d) => d.code);
    expect(codes).toEqual(['TRC-004', 'TRC-001', 'TRC-002']); // error first, then warnings by code

    const twoOrphans: TraceInput = {
      ...cleanInput(),
      requirements: ['REQ-A', 'REQ-B', 'REQ-Z', 'REQ-C'],
    };
    const orphanDiags = build(twoOrphans).diagnostics.filter((d) => d.code === 'TRC-001');
    expect(orphanDiags.map((d) => d.target)).toEqual(['REQ-C', 'REQ-Z']);
  });

  it('is deterministic: identical input → identical report', () => {
    expect(build(driftFixture)).toEqual(build(driftFixture));
  });
});

describe('traceRenderer (P09-04)', () => {
  it('renders the report header, diagnostics, counts and result', () => {
    const rendered = renderer.render(build(driftFixture));
    expect(rendered.startsWith('TRACE REPORT - trace graph\n')).toBe(true);
    expect(rendered).toContain(
      'TRC-001 [warning] REQ-C: orphaned requirement REQ-C: no trace links',
    );
    expect(rendered).toContain('TRC-002 [warning] P03-01: task P03-01 has no test evidence');
    expect(rendered).toContain('counts: requirements=3 tasks=4 tests=4 links=2');
    expect(rendered).toContain('result: WARN');
  });

  it('is byte-identical for identical input', () => {
    expect(renderer.render(build(driftFixture))).toBe(renderer.render(build(driftFixture)));
  });

  it('counts line matches the report counts', () => {
    const report = build(driftFixture);
    const countsLine = renderer
      .render(report)
      .split('\n')
      .find((l) => l.startsWith('counts: '));
    expect(countsLine).toBe(
      `counts: requirements=${report.counts.requirements} tasks=${report.counts.tasks} ` +
        `tests=${report.counts.tests} links=${report.counts.links}`,
    );
  });

  it('yields PASS for a clean report', () => {
    const rendered = renderer.render(build(cleanInput()));
    expect(rendered).toContain('result: PASS');
    expect(rendered).toContain('counts: requirements=2 tasks=2 tests=2 links=2');
  });

  it('yields FAIL when any error diagnostic exists', () => {
    const input: TraceInput = {
      ...cleanInput(),
      tests: [
        ...cleanInput().tests,
        { name: 'ghost task test', file: 'ghost.test.ts', task: 'PX-99', passing: true },
      ],
    };
    const rendered = renderer.render(build(input));
    expect(rendered).toContain(
      'TRC-003 [error] ghost task test: test ghost task test references unknown task PX-99',
    );
    expect(rendered).toContain('result: FAIL');
  });

  it('yields WARN when only warnings exist', () => {
    expect(renderer.render(build(driftFixture))).toContain('result: WARN');
  });
});
