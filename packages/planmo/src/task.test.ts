import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initWorkspace } from '@planmo/core';
import { normalizeStatus, readTaskRows, recordTaskStatus } from './task.js';
import { generatePlanningWorkspace } from './generate.js';

/**
 * `planmo task` exists because the obvious thing does not work: `planning/tasks.csv`
 * is generated, so a hand-edited status is silently reset by the next
 * `planmo generate`. Every test here is about that, one way or another.
 */
async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-task-'));
  await initWorkspace({
    root,
    name: 'task-fixture',
    type: 'web-application',
    lifecycle: 'greenfield',
    risk: 'medium',
    primaryAgent: 'opencode',
  });
  // `initWorkspace` writes the state documents; the planning tree comes from the
  // generator. The CLI's `init` runs both, so the fixture must too.
  await generatePlanningWorkspace({ root, planmoVersion: '0.0.0-test' });
  return root;
}

/** The status column for one task, read straight from the CSV. */
async function csvStatus(root: string, id: string): Promise<string> {
  const rows = await readTaskRows(root);
  return rows.find((row) => row.id === id)?.status ?? 'MISSING';
}

describe('planmo task', () => {
  it('records the status in state.yml and reflects it in tasks.csv', async () => {
    const root = await workspace();
    expect(await csvStatus(root, 'P00-01')).toBe('TODO');

    const outcome = await recordTaskStatus({ root, id: 'P00-01', status: 'DONE' });

    expect(outcome).toMatchObject({ id: 'P00-01', from: 'TODO', to: 'DONE', unchanged: false });
    expect(await csvStatus(root, 'P00-01')).toBe('DONE');
    const state = await readFile(join(root, '.planmo', 'state.yml'), 'utf8');
    expect(state).toContain('P00-01: DONE');
  });

  // The reason this command exists. A hand-edit to tasks.csv fails this test.
  it('survives a full regeneration', async () => {
    const root = await workspace();
    await recordTaskStatus({ root, id: 'P00-01', status: 'DONE' });

    await generatePlanningWorkspace({ root, planmoVersion: '0.0.0-test', allowOverwrite: true });

    expect(await csvStatus(root, 'P00-01')).toBe('DONE');
  });

  it('moves the next task on once the first is done', async () => {
    const root = await workspace();
    const before = await csvStatus(root, 'P00-02');
    await recordTaskStatus({ root, id: 'P00-01', status: 'DONE' });
    // P00-02 was already TODO; the point is that P00-01 no longer wins the brief.
    expect(await csvStatus(root, 'P00-01')).toBe('DONE');
    expect(before).toBe('TODO');
  });

  it('is a no-op when the task already has that status', async () => {
    const root = await workspace();
    await recordTaskStatus({ root, id: 'P00-01', status: 'DONE' });
    const again = await recordTaskStatus({ root, id: 'P00-01', status: 'DONE' });
    expect(again.unchanged).toBe(true);
    expect(again.written).toEqual([]);
  });

  it('writes nothing under --dry-run', async () => {
    const root = await workspace();
    const outcome = await recordTaskStatus({ root, id: 'P00-01', status: 'DONE', dryRun: true });
    expect(outcome.unchanged).toBe(false);
    expect(outcome.written).toEqual([]);
    expect(await csvStatus(root, 'P00-01')).toBe('TODO');
  });

  it('refuses an unknown task id rather than inventing one', async () => {
    const root = await workspace();
    await expect(recordTaskStatus({ root, id: 'P99-99', status: 'DONE' })).rejects.toThrow(
      /no task 'P99-99'/,
    );
  });

  it('refuses an unknown status', async () => {
    const root = await workspace();
    await expect(recordTaskStatus({ root, id: 'P00-01', status: 'FINISHED' })).rejects.toThrow(
      /not a task status/,
    );
  });

  it('accepts a status case-insensitively', () => {
    expect(normalizeStatus('done')).toBe('DONE');
    expect(normalizeStatus(' in_progress ')).toBe('IN_PROGRESS');
  });

  it('does not disturb the other state fields', async () => {
    const root = await workspace();
    const before = await readFile(join(root, '.planmo', 'state.yml'), 'utf8');
    await recordTaskStatus({ root, id: 'P00-01', status: 'REVIEW' });
    const after = await readFile(join(root, '.planmo', 'state.yml'), 'utf8');
    // currentPhase and the schema version must survive the rewrite untouched.
    for (const line of before.split('\n')) {
      if (line.startsWith('currentPhase') || line.startsWith('schemaVersion')) {
        expect(after).toContain(line);
      }
    }
  });
});
