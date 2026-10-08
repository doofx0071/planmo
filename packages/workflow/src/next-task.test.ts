import { describe, expect, it } from 'vitest';
import {
  composeNextBrief,
  parseTaskList,
  phaseDocPath,
  phaseTitleFromDoc,
  type PlanTask,
} from './next-task.js';

const HEADER = 'id,phase,title,status,priority';
const row = (id: string, phase: string, status: string, title = 'Do the thing') =>
  `${id},${phase},${title},${status},MUST`;

function tasks(rows: string[]): PlanTask[] {
  return [...parseTaskList([HEADER, ...rows].join('\n')).tasks];
}

describe('parseTaskList', () => {
  it('parses the canonical columns', () => {
    const parsed = parseTaskList([HEADER, row('P03-01', '03', 'TODO', 'Build the CLI')].join('\n'));
    expect(parsed.tasks).toEqual([
      { id: 'P03-01', phase: '03', title: 'Build the CLI', status: 'TODO', priority: 'MUST' },
    ]);
    expect(parsed.skipped).toEqual([]);
  });

  it('keeps a quoted title containing a comma in one field', () => {
    const parsed = parseTaskList(
      [HEADER, 'P00-01,00,"Lock boundaries, naming, and non-goals.",TODO,MUST'].join('\n'),
    );
    expect(parsed.tasks[0]?.title).toBe('Lock boundaries, naming, and non-goals.');
    expect(parsed.tasks[0]?.priority).toBe('MUST');
  });

  it('tolerates CRLF line endings', () => {
    const parsed = parseTaskList(`${HEADER}\r\n${row('P00-01', '00', 'TODO')}\r\n`);
    expect(parsed.tasks).toHaveLength(1);
  });

  it('ignores blank lines', () => {
    const parsed = parseTaskList(`${HEADER}\n\n${row('P00-01', '00', 'TODO')}\n\n`);
    expect(parsed.tasks).toHaveLength(1);
  });

  it('reports a row it cannot read rather than dropping it silently', () => {
    const parsed = parseTaskList(
      [HEADER, 'P00-01,00,too few columns', row('P00-02', '00', 'MAYBE')].join('\n'),
    );
    expect(parsed.tasks).toHaveLength(0);
    expect(parsed.skipped).toHaveLength(2);
    expect(parsed.skipped[0]).toContain('expected 5 columns');
    expect(parsed.skipped[1]).toContain('unknown status "MAYBE"');
  });

  it('accepts every canonical status', () => {
    const parsed = parseTaskList(
      [
        HEADER,
        ...['TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE'].map((status, i) =>
          row(`P00-0${i + 1}`, '00', status),
        ),
      ].join('\n'),
    );
    expect(parsed.tasks.map((t) => t.status)).toEqual([
      'TODO',
      'IN_PROGRESS',
      'BLOCKED',
      'REVIEW',
      'DONE',
    ]);
  });
});

describe('composeNextBrief', () => {
  it('picks the lowest-id task that is not DONE', () => {
    const brief = composeNextBrief({
      tasks: tasks([
        row('P00-01', '00', 'DONE'),
        row('P00-02', '00', 'TODO', 'Tests & evidence'),
        row('P01-01', '01', 'TODO', 'Monorepo toolchain'),
      ]),
    });
    expect(brief.task?.id).toBe('P00-02');
    expect(brief.phase).toBe('00');
  });

  it('advances to the next phase once a phase is done', () => {
    const brief = composeNextBrief({
      tasks: tasks([
        row('P00-01', '00', 'DONE'),
        row('P00-02', '00', 'DONE'),
        row('P01-01', '01', 'TODO', 'Monorepo toolchain'),
      ]),
    });
    expect(brief.task?.id).toBe('P01-01');
    expect(brief.phaseDoc).toBe('planning/phases/phase-01.md');
  });

  it('never picks a BLOCKED task, and surfaces it instead', () => {
    const brief = composeNextBrief({
      tasks: tasks([
        row('P00-01', '00', 'BLOCKED', 'Waiting on a decision'),
        row('P00-02', '00', 'TODO', 'Tests & evidence'),
      ]),
    });
    expect(brief.task?.id).toBe('P00-02');
    expect(brief.blocked.map((t) => t.id)).toEqual(['P00-01']);
  });

  it('counts progress over the whole list', () => {
    const brief = composeNextBrief({
      tasks: tasks([
        row('P00-01', '00', 'DONE'),
        row('P00-02', '00', 'DONE'),
        row('P01-01', '01', 'TODO'),
        row('P01-02', '01', 'TODO'),
      ]),
    });
    expect(brief.progress).toEqual({ done: 2, total: 4 });
  });

  it('reports how many tasks are ready right now', () => {
    const brief = composeNextBrief({
      tasks: tasks([row('P00-01', '00', 'TODO'), row('P00-02', '00', 'TODO')]),
    });
    expect(brief.readyCount).toBe(2);
  });

  it('reports completion when every task is DONE', () => {
    const brief = composeNextBrief({
      tasks: tasks([row('P00-01', '00', 'DONE'), row('P00-02', '00', 'DONE')]),
    });
    expect(brief.complete).toBe(true);
    expect(brief.task).toBeNull();
    expect(brief.phaseDoc).toBeNull();
  });

  it('does not claim completion for an empty list', () => {
    const brief = composeNextBrief({ tasks: [] });
    expect(brief.complete).toBe(false);
    expect(brief.task).toBeNull();
  });

  it('carries a supplied phase title', () => {
    const brief = composeNextBrief({
      tasks: tasks([row('P03-01', '03', 'TODO')]),
      phaseTitles: { '03': 'CLI foundation' },
    });
    expect(brief.phaseTitle).toBe('CLI foundation');
  });

  it('passes through rows the reader skipped', () => {
    const parsed = parseTaskList([HEADER, 'broken'].join('\n'));
    const brief = composeNextBrief({ tasks: parsed.tasks, skipped: parsed.skipped });
    expect(brief.skipped).toHaveLength(1);
  });

  it('lists the phase document first, then the shared documents', () => {
    const brief = composeNextBrief({
      tasks: tasks([row('P03-01', '03', 'TODO')]),
    });
    expect(brief.read[0]).toBe('planning/phases/phase-03.md');
    expect(brief.read).toContain('planning/STANDARDS.md');
    expect(brief.read).toContain('planning/CONTEXT.md');
  });

  it('is deterministic', () => {
    const input = {
      tasks: tasks([row('P00-02', '00', 'TODO'), row('P00-01', '00', 'TODO')]),
    };
    expect(composeNextBrief(input)).toEqual(composeNextBrief(input));
  });

  it('orders by id, so a zero-padded task sorts before a later one', () => {
    const brief = composeNextBrief({
      tasks: tasks([row('P07-10', '07', 'TODO'), row('P07-09', '07', 'TODO')]),
    });
    expect(brief.task?.id).toBe('P07-09');
  });
});

describe('phaseDocPath', () => {
  it('builds the canonical phase document path', () => {
    expect(phaseDocPath('03')).toBe('planning/phases/phase-03.md');
  });
});

describe('phaseTitleFromDoc', () => {
  it('reads the title from the phase heading', () => {
    expect(phaseTitleFromDoc('# Phase 03 — CLI foundation\n\n## Objective\n')).toBe(
      'CLI foundation',
    );
  });

  it('accepts a plain hyphen', () => {
    expect(phaseTitleFromDoc('# Phase 01 - Repo foundation')).toBe('Repo foundation');
  });

  it('returns undefined when there is no recognisable heading', () => {
    expect(phaseTitleFromDoc('## Objective\nnothing here')).toBeUndefined();
  });
});
