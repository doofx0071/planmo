import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './index.js';
import { parseTasksCsv, renderTraceGraph, traceWorkspace } from './trace.js';

/**
 * `planmo trace` builds the requirements trace graph from the canonical
 * workspace documents and renders it. These tests drive the real adapter
 * against a real generated workspace, so the canonical paths and the
 * traceability table are exercised, not stubbed.
 */

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
}

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-trace-'));
  expect(await run(['init', root, '--yes'], capture().io)).toBe(0);
  return root;
}

const HEADER = 'id,phase,title,status,priority';

describe('planmo trace — adapter', () => {
  it('builds the trace graph for a freshly generated workspace', async () => {
    const root = await workspace();
    const { graph, text } = await traceWorkspace({ root });

    expect(graph.counts.requirements).toBe(7);
    expect(graph.counts.tasks).toBe(28);
    expect(graph.counts.links).toBe(28);
    // One evidence row per exit gate for each `verification.required` task, so the
    // count is positive and divisible by the phase count. It used to be 0 — that
    // was the gap this schema closes.
    expect(graph.counts.tests).toBeGreaterThan(0);
    expect(graph.counts.tests % 7).toBe(0);
    expect(text.startsWith('TRACE REPORT - trace graph')).toBe(true);
    expect(text).toContain(`tests=${graph.counts.tests}`);
    expect(text).toContain('result: WARN');
  });

  it('links each requirement to the tasks of its phase', async () => {
    const root = await workspace();
    const { graph } = await traceWorkspace({ root });

    const req = graph.nodes.find((node) => node.id === 'REQ-001');
    expect(req?.kind).toBe('requirement');
    expect(req?.edges).toEqual([
      'REQ-001 -> P00-01',
      'REQ-001 -> P00-02',
      'REQ-001 -> P00-03',
      'REQ-001 -> P00-04',
    ]);
    // Every requirement is trace-linked, so none is orphaned.
    expect(graph.orphans).toEqual([]);
  });

  it('records the decisions declared in DECISIONS.md', async () => {
    const root = await workspace();
    const { graph } = await traceWorkspace({ root });

    const decisions = graph.nodes.filter((node) => node.kind === 'decision').map((n) => n.id);
    expect(decisions).toEqual(['D-000', 'D-001', 'D-002', 'D-003']);
  });

  it('records the evidence scaffold as unrun, never as passing', async () => {
    const root = await workspace();
    const { graph, text } = await traceWorkspace({ root });

    // The scaffold is real: the generator seeds a row per required check, so the
    // graph has test nodes.
    expect(graph.nodes.some((node) => node.kind === 'test')).toBe(true);
    // `untested` counts tasks with NO test coverage at all — the docs and handoff
    // workstreams, which nothing gates on. The gate-bearing tasks are covered by
    // the scaffold, but covered is not passing: every task still reports TRC-002
    // because a blank `result` means the check was never run. Treating a seeded row
    // as a pass would fabricate exactly the evidence this schema exists to require.
    expect(graph.untested).toHaveLength(14);
    expect(text).toContain('TRC-002');
  });

  it('clears TRC-002 for a task once a check is recorded as passing', async () => {
    const root = await workspace();
    const warnings = (text: string) =>
      text.split('\n').filter((line) => line.includes('TRC-002')).length;
    const before = warnings((await traceWorkspace({ root })).text);

    const csv = join(root, 'planning', 'testing', 'TEST-EVIDENCE.csv');
    const recorded = (await readFile(csv, 'utf8'))
      .split('\n')
      // A blank row is `P00-01,unit tests,,` — fill the result column.
      .map((line) => (line.startsWith('P00-01,') ? line.replace(/,$/, ',pass') : line))
      .join('\n');
    await writeFile(csv, recorded, 'utf8');

    // Exactly one task stops being untested — evidence clears the warning, and
    // nothing else moves.
    expect(warnings((await traceWorkspace({ root })).text)).toBe(before - 1);
  });

  it('renders deterministically', async () => {
    const root = await workspace();
    const first = await traceWorkspace({ root });
    const second = await traceWorkspace({ root });
    expect(first.text).toBe(second.text);
    expect(renderTraceGraph(first.graph)).toBe(renderTraceGraph(second.graph));
  });

  it('does not filter on a focus id — the engine renders whole-graph only', async () => {
    const root = await workspace();
    const whole = await traceWorkspace({ root });
    const focused = await traceWorkspace({ root, id: 'REQ-001' });

    expect(focused.focus).toBe('REQ-001');
    expect(focused.focusNote).toContain('whole-graph only');
    // The report is identical: the id never narrows the output.
    expect(focused.text).toBe(whole.text);

    const unknown = await traceWorkspace({ root, id: 'REQ-999' });
    expect(unknown.focusNote).toContain('not a node');
    expect(unknown.text).toBe(whole.text);
  });

  it('reads status from field 4 (index 3), never the last field', () => {
    const csv = [
      HEADER,
      'P00-01,00,"Lock boundaries, naming, and non-goals.",DONE,MUST',
      'P00-02,00,Plain title,TODO,SHOULD',
    ].join('\n');

    const tasks = parseTasksCsv(csv);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual({
      id: 'P00-01',
      phase: '00',
      title: 'Lock boundaries, naming, and non-goals.',
      status: 'DONE',
    });
    expect(tasks[1]?.status).toBe('TODO');
  });

  it('ignores malformed task rows and keeps the graph consistent', async () => {
    const root = await workspace();
    await writeFile(
      join(root, 'planning', 'tasks.csv'),
      [HEADER, 'P00-01,00,"Comma, in title",TODO,MUST', 'broken row'].join('\n') + '\n',
      'utf8',
    );

    const { graph } = await traceWorkspace({ root });
    // The quoted comma did not inflate the row, and the broken row was dropped.
    expect(graph.counts.tasks).toBe(1);
  });
});

describe('planmo trace — no workspace', () => {
  it('rejects a directory with no .planmo workspace', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'planmo-trace-empty-'));
    await expect(traceWorkspace({ root: empty })).rejects.toThrow();
  });

  it('rejects when .planmo has no readable project.yml', async () => {
    const root = await mkdtemp(join(tmpdir(), 'planmo-trace-noproject-'));
    await mkdir(join(root, '.planmo'), { recursive: true });

    await expect(traceWorkspace({ root })).rejects.toThrow(/no readable \.planmo\/project\.yml/);

    await rm(root, { recursive: true, force: true });
  });
});
