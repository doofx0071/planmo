import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initWorkspace } from '@planmo/core';
import { generatePlanningWorkspace } from './generate.js';
import { validateWorkspace } from './validate.js';

/**
 * `planmo validate` is the CI gate for a workspace, so these tests pin the two
 * properties that matter: a freshly generated workspace must validate clean
 * (otherwise `init` produces something the tool itself rejects), and each
 * documented invariant must actually fire when it is violated.
 */
async function freshWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-validate-'));
  await initWorkspace({ root, name: 'validate-fixture' });
  await generatePlanningWorkspace({ root, planmoVersion: '0.0.0-test' });
  return root;
}

async function patchState(root: string, edit: (yaml: string) => string): Promise<void> {
  const path = join(root, '.planmo', 'state.yml');
  await writeFile(path, edit(await readFile(path, 'utf8')), 'utf8');
}

describe('validateWorkspace', () => {
  it('a freshly generated workspace validates clean', async () => {
    const root = await freshWorkspace();
    const result = await validateWorkspace({ root });

    expect(result.diagnostics).toEqual([]);
    expect(result.counts).toEqual({ error: 0, warning: 0, info: 0 });
    expect(result.ok).toBe(true);
  });

  it('reports a phase gap as an error (VLD-001)', async () => {
    const root = await freshWorkspace();
    // No phases completed, so the zero-padded next phase must be "00".
    await patchState(root, (yaml) => yaml.replace(/currentPhase:.*/, 'currentPhase: "05"'));

    const result = await validateWorkspace({ root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain('VLD-001');
    expect(result.counts.error).toBeGreaterThan(0);
  });

  it('reports a blocked task with no matching row (VLD-002)', async () => {
    const root = await freshWorkspace();
    await patchState(root, (yaml) =>
      yaml.replace(/blockedTasks: \[\]/, 'blockedTasks:\n  - P99-99'),
    );

    const result = await validateWorkspace({ root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain('VLD-002');
  });

  it('rejects a tasks.csv that is not the canonical five columns (VLD-004)', async () => {
    const root = await freshWorkspace();
    await writeFile(
      join(root, 'planning', 'tasks.csv'),
      'id,phase,title,status,priority,extra\nP00-01,00,do the thing,TODO,P1,oops\n',
      'utf8',
    );

    const result = await validateWorkspace({ root });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toContain('VLD-004');
  });

  it('rejects a directory with no .planmo workspace', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'planmo-validate-empty-'));
    await expect(validateWorkspace({ root: empty })).rejects.toThrow();
  });
});
