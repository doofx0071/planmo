import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffWorkspace, renderDiff } from './diff.js';
import { run } from './index.js';

/**
 * `planmo diff` answers "is the planning tree stale?" without writing anything.
 * These tests drive the real adapter against a real generated workspace.
 */
function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
}

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-diff-'));
  expect(await run(['init', root, '--yes'], capture().io)).toBe(0);
  return root;
}

describe('diffWorkspace', () => {
  it('reports a freshly generated workspace as up to date', async () => {
    const root = await workspace();
    const outcome = await diffWorkspace({ root, planmoVersion: '0.0.0' });

    expect(outcome.upToDate).toBe(true);
    expect(outcome.added).toEqual([]);
    expect(outcome.updated).toEqual([]);
    expect(outcome.collisions).toEqual([]);
    // Seeded documents are deliberately left alone, so they are reported as
    // skipped rather than as no-ops.
    expect(outcome.skipped.length).toBeGreaterThan(0);
  });

  it('reports a deleted generated document as one that would be created', async () => {
    const root = await workspace();
    await rm(join(root, 'planning', 'testing', 'TEST-STRATEGY.md'));

    const outcome = await diffWorkspace({ root, planmoVersion: '0.0.0' });
    expect(outcome.upToDate).toBe(false);
    expect(outcome.added).toContain('planning/testing/TEST-STRATEGY.md');
  });

  it('reports an edited generated document as one that would be updated, with a diff', async () => {
    const root = await workspace();
    const target = join(root, 'planning', 'testing', 'TEST-STRATEGY.md');
    await writeFile(target, '# hand edited\n', 'utf8');

    const outcome = await diffWorkspace({ root, planmoVersion: '0.0.0' });
    expect(outcome.updated).toContain('planning/testing/TEST-STRATEGY.md');
    expect(outcome.diff).toContain('TEST-STRATEGY.md');
    expect(outcome.diff).toContain('-# hand edited');
  });

  it('never reports a seeded document as one it would overwrite', async () => {
    const root = await workspace();
    // DECISIONS.md is seeded: the user owns it, so an edit must not appear as an
    // update. This is the ownership rule, asserted through the diff surface.
    await writeFile(join(root, 'planning', 'DECISIONS.md'), '# mine\n', 'utf8');

    const outcome = await diffWorkspace({ root, planmoVersion: '0.0.0' });
    expect(outcome.updated).not.toContain('planning/DECISIONS.md');
    expect(outcome.merged).not.toContain('planning/DECISIONS.md');
    expect(outcome.skipped.map((s) => s.path)).toContain('planning/DECISIONS.md');
  });

  it('writes nothing', async () => {
    const root = await workspace();
    const target = join(root, 'planning', 'testing', 'TEST-STRATEGY.md');
    await rm(target);
    await diffWorkspace({ root, planmoVersion: '0.0.0' });
    // diff plans; it does not apply. The deleted file must still be gone.
    await expect(readFile(target)).rejects.toThrow();
  });
});

describe('renderDiff', () => {
  it('says so plainly when there is nothing to do', async () => {
    const root = await workspace();
    const text = renderDiff(await diffWorkspace({ root, planmoVersion: '0.0.0' }));
    expect(text).toContain('already matches the project model');
  });

  it('groups the pending work by action', async () => {
    const root = await workspace();
    await rm(join(root, 'planning', 'testing', 'TEST-STRATEGY.md'));
    const text = renderDiff(await diffWorkspace({ root, planmoVersion: '0.0.0' }));
    expect(text).toContain('Would create (1):');
    expect(text).toContain('planning/testing/TEST-STRATEGY.md');
    expect(text).toContain('would change');
  });
});

describe('planmo diff — CLI', () => {
  it('exits 0 and reports an up-to-date tree', async () => {
    const root = await workspace();
    const { io, out } = capture();
    expect(await run(['diff', '--dir', root], io)).toBe(0);
    expect(out.join('\n')).toContain('already matches the project model');
  });

  it('exits 0 without --exit-code even when there are changes', async () => {
    const root = await workspace();
    await rm(join(root, 'planning', 'testing', 'TEST-STRATEGY.md'));
    const { io, out } = capture();
    expect(await run(['diff', '--dir', root], io)).toBe(0);
    expect(out.join('\n')).toContain('Would create');
  });

  it('exits 1 with --exit-code when the tree is out of date', async () => {
    const root = await workspace();
    await rm(join(root, 'planning', 'testing', 'TEST-STRATEGY.md'));
    const { io } = capture();
    expect(await run(['diff', '--dir', root, '--exit-code'], io)).toBe(1);
  });

  it('exits 0 with --exit-code when the tree is current', async () => {
    const root = await workspace();
    const { io } = capture();
    expect(await run(['diff', '--dir', root, '--exit-code'], io)).toBe(0);
  });

  it('exits 3 without a workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'planmo-diff-empty-'));
    const { io, err } = capture();
    expect(await run(['diff', '--dir', root], io)).toBe(3);
    expect(err.join('\n')).toContain('planmo diff:');
  });
});

describe('USAGE', () => {
  it('documents the diff command', async () => {
    const { io, out } = capture();
    await run(['--help'], io);
    const text = out.join('\n');
    expect(text).toContain('planmo diff');
    expect(text).toContain('--exit-code');
  });
});
