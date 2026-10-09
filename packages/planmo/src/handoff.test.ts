import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectNotFoundError } from '@planmo/core';
import { HandoffSchema } from '@planmo/schema';
import { run } from './index.js';
import { buildHandoff, renderHandoffDocument } from './handoff.js';

/**
 * `planmo handoff` records the current phase's handoff from workspace state.
 * These tests drive the real adapter against a real generated workspace, so the
 * canonical paths and the schema-validated document are exercised, not stubbed.
 */
const HEADER = 'id,phase,title,status,priority';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
}

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-handoff-'));
  expect(await run(['init', root, '--yes'], capture().io)).toBe(0);
  return root;
}

/** Replace the generated task list with a fixture. */
async function setTasks(root: string, rows: string[]): Promise<void> {
  await writeFile(join(root, 'planning', 'tasks.csv'), [HEADER, ...rows].join('\n') + '\n', 'utf8');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('planmo handoff', () => {
  it('builds a handoff from a generated workspace', async () => {
    const root = await workspace();
    const outcome = await buildHandoff({ root });

    expect(outcome.phase).toBe('00');
    expect(outcome.nextPhase).toBe('01');
    expect(outcome.path).toBe('planning/handoffs/phase-00-handoff.md');
    expect(outcome.written).toContain(outcome.path);

    const text = await readFile(join(root, outcome.path), 'utf8');
    expect(text).toBe(outcome.text);
    expect(text).toContain('# Phase 00 Handoff');
    expect(text).toContain('## Next phase');
  });

  it('produces a schema-valid document and reports resume sufficiency', async () => {
    const fresh = await workspace();
    const freshOutcome = await buildHandoff({ root: fresh, dryRun: true });
    expect(HandoffSchema.safeParse(freshOutcome.document).success).toBe(true);
    // Nothing is DONE in a freshly generated workspace, so the handoff is not yet
    // sufficient to resume from — the engine says so rather than guessing.
    expect(freshOutcome.missingForResume).toEqual(['completedTasks']);

    const done = await workspace();
    await setTasks(done, ['P00-01,00,First,DONE,MUST']);
    expect((await buildHandoff({ root: done, dryRun: true })).missingForResume).toEqual([]);
  });

  it("derives the current phase's completed task ids", async () => {
    const root = await workspace();
    await setTasks(root, [
      'P00-01,00,First,DONE,MUST',
      'P00-02,00,Second,TODO,SHOULD',
      'P00-03,00,Third,DONE,SHOULD',
      'P01-01,01,Other phase,DONE,MUST',
    ]);

    const { document } = await buildHandoff({ root });
    expect(document.phase).toBe('00');
    expect(document.completedTasks).toEqual(['P00-01', 'P00-03']);
  });

  it('reads status at index 3, not the last field, for a quoted title', async () => {
    const root = await workspace();
    await setTasks(root, ['P00-01,00,"Define scope, users and risks",DONE,MUST']);

    const { document } = await buildHandoff({ root });
    expect(document.completedTasks).toEqual(['P00-01']);
  });

  it('derives PARTIAL and COMPLETE from the phase task rows', async () => {
    const partial = await workspace();
    await setTasks(partial, ['P00-01,00,First,DONE,MUST', 'P00-02,00,Second,TODO,SHOULD']);
    expect((await buildHandoff({ root: partial })).document.status).toBe('PARTIAL');

    const complete = await workspace();
    await setTasks(complete, ['P00-01,00,First,DONE,MUST', 'P00-02,00,Second,DONE,SHOULD']);
    expect((await buildHandoff({ root: complete })).document.status).toBe('COMPLETE');
  });

  it('derives BLOCKED and records the blocker', async () => {
    const root = await workspace();
    await setTasks(root, ['P00-01,00,Waiting,BLOCKED,MUST', 'P00-02,00,Workable,TODO,SHOULD']);

    const { document } = await buildHandoff({ root });
    expect(document.status).toBe('BLOCKED');
    expect(document.blocked.map((b) => b.task)).toEqual(['P00-01']);
    expect(document.blocked[0]?.reason).toContain('BLOCKED');
  });

  it('derives the next phase from the task list, with a numeric fallback', async () => {
    const root = await workspace();
    await setTasks(root, [
      'P00-01,00,First,TODO,MUST',
      'P01-01,01,Second,TODO,MUST',
      'P02-01,02,Third,TODO,MUST',
    ]);
    expect((await buildHandoff({ root, dryRun: true })).nextPhase).toBe('01');

    const last = await workspace();
    await setTasks(last, ['P00-01,00,Only,TODO,MUST']);
    expect((await buildHandoff({ root: last, dryRun: true })).nextPhase).toBe('01');
  });

  it('records material changes from the workspace manifest', async () => {
    const root = await workspace();
    const { document } = await buildHandoff({ root, dryRun: true });
    expect(document.materialChanges).toContain('planning/ROADMAP.md');
  });

  it('a dry run writes nothing', async () => {
    const root = await workspace();
    const target = join(root, 'planning', 'handoffs', 'phase-00-handoff.md');
    expect(await exists(target)).toBe(false);

    const outcome = await buildHandoff({ root, dryRun: true });
    expect(outcome.written).toContain(outcome.path);
    expect(await exists(target)).toBe(false);
  });

  it('reports a collision on a second run instead of overwriting', async () => {
    const root = await workspace();
    const first = await buildHandoff({ root });
    await writeFile(join(root, first.path), '# mine\n', 'utf8');

    const second = await buildHandoff({ root });
    expect(second.collisions).toContain(first.path);
    expect(second.written).toEqual([]);
    expect(await readFile(join(root, first.path), 'utf8')).toBe('# mine\n');
  });

  it('replaces an existing handoff only when overwrite is allowed', async () => {
    const root = await workspace();
    const first = await buildHandoff({ root });
    await writeFile(join(root, first.path), '# mine\n', 'utf8');

    const second = await buildHandoff({ root, allowOverwrite: true });
    expect(second.written).toContain(first.path);
    expect(await readFile(join(root, first.path), 'utf8')).toBe(second.text);
  });

  it('refuses a directory that is not a workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'planmo-handoff-empty-'));

    await expect(buildHandoff({ root })).rejects.toThrow(/no readable \.planmo\/project\.yml/);
    await expect(buildHandoff({ root })).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('refuses when the planning tree has not been generated', async () => {
    const root = await workspace();
    await rm(join(root, 'planning', 'tasks.csv'));

    await expect(buildHandoff({ root })).rejects.toThrow(/run 'planmo generate' first/);
  });

  it('renders deterministically and stamps the version only when given', async () => {
    const root = await workspace();
    const { document } = await buildHandoff({ root, dryRun: true });

    expect(renderHandoffDocument(document)).toBe(renderHandoffDocument(document));
    expect(renderHandoffDocument(document, '1.2.3')).toContain('PlanMo 1.2.3');
    expect(renderHandoffDocument(document)).not.toContain('PlanMo 1.2.3');
  });
});
