import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './index.js';
import { nextBrief, renderNextBrief } from './next.js';

/**
 * `planmo next` reads the canonical task list and reports the task to work next.
 * These tests drive the real adapter against a real generated workspace, so the
 * canonical paths and the phase documents are exercised, not stubbed.
 */
const HEADER = 'id,phase,title,status,priority';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
}

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-next-'));
  expect(await run(['init', root, '--yes'], capture().io)).toBe(0);
  return root;
}

/** Replace the generated task list with a fixture. */
async function setTasks(root: string, rows: string[]): Promise<void> {
  await writeFile(join(root, 'planning', 'tasks.csv'), [HEADER, ...rows].join('\n') + '\n', 'utf8');
}

describe('planmo next', () => {
  it('reports the first task of a freshly generated workspace', async () => {
    const root = await workspace();
    const { brief, text } = await nextBrief({ root });

    expect(brief.task?.id).toBe('P00-01');
    expect(brief.phase).toBe('00');
    expect(brief.progress).toEqual({ done: 0, total: 28 });
    expect(text).toContain('Next task  P00-01');
  });

  it('reads the phase title from the generated phase document', async () => {
    const root = await workspace();
    const { brief } = await nextBrief({ root });
    expect(brief.phaseTitle).toBe('Product & research foundation');
  });

  it('advances past DONE tasks', async () => {
    const root = await workspace();
    await setTasks(root, [
      'P00-01,00,First,DONE,MUST',
      'P00-02,00,Second,TODO,SHOULD',
      'P01-01,01,Next phase,TODO,MUST',
    ]);

    const { brief } = await nextBrief({ root });
    expect(brief.task?.id).toBe('P00-02');
    expect(brief.progress).toEqual({ done: 1, total: 3 });
  });

  it('moves to the next phase when the current one is finished', async () => {
    const root = await workspace();
    await setTasks(root, ['P00-01,00,First,DONE,MUST', 'P01-01,01,Monorepo toolchain,TODO,MUST']);

    const { brief, text } = await nextBrief({ root });
    expect(brief.task?.id).toBe('P01-01');
    expect(brief.phaseDoc).toBe('planning/phases/phase-01.md');
    expect(text).toContain('planning/phases/phase-01.md');
  });

  it('surfaces a BLOCKED task instead of stepping over it', async () => {
    const root = await workspace();
    await setTasks(root, ['P00-01,00,Waiting,BLOCKED,MUST', 'P00-02,00,Workable,TODO,SHOULD']);

    const { brief, text } = await nextBrief({ root });
    expect(brief.task?.id).toBe('P00-02');
    expect(brief.blocked.map((t) => t.id)).toEqual(['P00-01']);
    expect(text).toContain('Blocked (1):');
    expect(text).toContain('P00-01  Waiting');
  });

  it('lists the documents to read before starting', async () => {
    const root = await workspace();
    const { text } = await nextBrief({ root });
    expect(text).toContain('Read before you start:');
    expect(text).toContain('planning/phases/phase-00.md');
    expect(text).toContain('planning/STANDARDS.md');
    expect(text).toContain('planning/CONTEXT.md');
  });

  it('reports completion when everything is DONE', async () => {
    const root = await workspace();
    await setTasks(root, ['P00-01,00,First,DONE,MUST', 'P00-02,00,Second,DONE,SHOULD']);

    const { brief, text } = await nextBrief({ root });
    expect(brief.complete).toBe(true);
    expect(brief.task).toBeNull();
    expect(text).toContain('All 2 tasks are DONE.');
  });

  it('warns about a row it could not read', async () => {
    const root = await workspace();
    await setTasks(root, ['P00-01,00,First,TODO,MUST', 'broken row']);

    const { text } = await nextBrief({ root });
    expect(text).toContain('could not be read');
    expect(text).toContain('expected 5 columns');
  });

  it('refuses when the workspace has no task list', async () => {
    const root = await workspace();
    const { rm } = await import('node:fs/promises');
    await rm(join(root, 'planning', 'tasks.csv'));

    await expect(nextBrief({ root })).rejects.toThrow(/run 'planmo generate' first/);
  });

  it('renders deterministically', async () => {
    const root = await workspace();
    expect(renderNextBrief((await nextBrief({ root })).brief)).toBe(
      renderNextBrief((await nextBrief({ root })).brief),
    );
  });
});

describe('planmo next — CLI', () => {
  it('prints the brief and exits 0', async () => {
    const root = await workspace();
    const { io, out } = capture();

    expect(await run(['next', '--dir', root], io)).toBe(0);
    expect(out.join('\n')).toContain('Next task  P00-01');
  });

  it('--print prints to stdout and writes nothing', async () => {
    const root = await workspace();
    const before = await readFile(join(root, 'planning', 'tasks.csv'), 'utf8');
    const { io, out } = capture();

    expect(await run(['next', '--print', '--dir', root], io)).toBe(0);
    expect(out.join('\n')).toContain('Next task');
    expect(await readFile(join(root, 'planning', 'tasks.csv'), 'utf8')).toBe(before);
  });

  it('--json emits the brief as machine-readable JSON', async () => {
    const root = await workspace();
    const { io, out } = capture();

    expect(await run(['next', '--json', '--dir', root], io)).toBe(0);
    const parsed = JSON.parse(out.join('\n')) as { task: { id: string }; complete: boolean };
    expect(parsed.task.id).toBe('P00-01');
    expect(parsed.complete).toBe(false);
  });

  it('exits 3 without a workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'planmo-next-empty-'));
    const { io, err } = capture();

    expect(await run(['next', '--dir', root], io)).toBe(3);
    expect(err.join('\n')).toContain('planmo next:');
  });

  it('exits 1 when the planning tree has not been generated', async () => {
    const root = await workspace();
    const { rm } = await import('node:fs/promises');
    await rm(join(root, 'planning'), { recursive: true, force: true });
    const { io, err } = capture();

    expect(await run(['next', '--dir', root], io)).toBe(1);
    expect(err.join('\n')).toContain('planmo generate');
  });
});

describe('USAGE', () => {
  it('documents the next command', async () => {
    const { io, out } = capture();
    await run(['--help'], io);
    const text = out.join('\n');
    expect(text).toContain('planmo next');
    expect(text).toContain('--print');
    expect(text).toContain('--json');
  });
});
