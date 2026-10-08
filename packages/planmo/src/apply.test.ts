import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyProposal } from './apply.js';
import { run } from './index.js';

/**
 * `planmo agent apply` validates an agent's proposal and records it. The two
 * things worth guarding are that an invalid proposal writes NOTHING, and that a
 * hostile `requestId` cannot name a path outside `.planmo/proposals/`.
 */
function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
}

const VALID = {
  schemaVersion: 1,
  agent: 'opencode',
  requestId: 'Add planmo next to the command surface',
  items: [
    { id: 'cli-next', summary: 'Wire the next command.', references: ['REQ-001'] },
    { id: 'docs', summary: 'Document it.', rationale: 'Users cannot find it.' },
  ],
};

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-apply-'));
  expect(await run(['init', root, '--yes'], capture().io)).toBe(0);
  return root;
}

async function proposalFile(contents: unknown | string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'planmo-proposal-'));
  const file = join(dir, 'proposal.json');
  await writeFile(file, typeof contents === 'string' ? contents : JSON.stringify(contents), 'utf8');
  return file;
}

describe('applyProposal', () => {
  it('records a valid proposal under .planmo/proposals/', async () => {
    const root = await workspace();
    const outcome = await applyProposal({ root, file: await proposalFile(VALID) });

    expect(outcome.recordPath).toBe(
      '.planmo/proposals/add-planmo-next-to-the-command-surface.json',
    );
    expect(outcome.written).toContain(outcome.recordPath);
    expect(existsSync(join(root, outcome.recordPath))).toBe(true);
  });

  it('records the normalised proposal, with schema defaults applied', async () => {
    const root = await workspace();
    const outcome = await applyProposal({ root, file: await proposalFile(VALID) });
    const recorded = JSON.parse(await readFile(join(root, outcome.recordPath), 'utf8')) as {
      items: { status: string; references: string[] }[];
    };
    expect(recorded.items[0]?.status).toBe('proposed');
    expect(recorded.items[1]?.references).toEqual([]);
  });

  it('writes nothing when the proposal is invalid', async () => {
    const root = await workspace();
    const file = await proposalFile({ ...VALID, execute: 'rm -rf /' });

    await expect(applyProposal({ root, file })).rejects.toThrow(/proposal rejected/);
    // The invariant: nothing partial. Not even the proposals directory.
    expect(existsSync(join(root, '.planmo', 'proposals'))).toBe(false);
  });

  it('names the offending field when rejecting', async () => {
    const root = await workspace();
    const file = await proposalFile({
      schemaVersion: 1,
      agent: 'x',
      requestId: 'r',
      items: [{ id: '' }],
    });
    await expect(applyProposal({ root, file })).rejects.toThrow(/items\.0/);
  });

  it('writes nothing when the file is not JSON', async () => {
    const root = await workspace();
    await expect(
      applyProposal({ root, file: await proposalFile('not json at all') }),
    ).rejects.toThrow(/not valid JSON/);
    expect(existsSync(join(root, '.planmo', 'proposals'))).toBe(false);
  });

  it('refuses a missing file', async () => {
    const root = await workspace();
    await expect(
      applyProposal({ root, file: join(root, 'nope', 'proposal.json') }),
    ).rejects.toThrow(/cannot read/);
  });

  it('refuses when there is no workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'planmo-apply-empty-'));
    await expect(applyProposal({ root, file: await proposalFile(VALID) })).rejects.toThrow(
      /no PlanMo project found/,
    );
  });

  it('reports a collision rather than overwriting an existing record', async () => {
    const root = await workspace();
    const file = await proposalFile(VALID);
    await applyProposal({ root, file });

    const changed = { ...VALID, items: [{ id: 'different', summary: 'Changed my mind.' }] };
    const second = await applyProposal({ root, file: await proposalFile(changed) });

    expect(second.collisions).toEqual([
      '.planmo/proposals/add-planmo-next-to-the-command-surface.json',
    ]);
    // The first record is intact.
    const recorded = JSON.parse(
      await readFile(
        join(root, '.planmo/proposals/add-planmo-next-to-the-command-surface.json'),
        'utf8',
      ),
    ) as { items: { id: string }[] };
    expect(recorded.items[0]?.id).toBe('cli-next');
  });

  it('replaces the record with --force', async () => {
    const root = await workspace();
    await applyProposal({ root, file: await proposalFile(VALID) });
    const changed = { ...VALID, items: [{ id: 'different', summary: 'Changed my mind.' }] };

    const forced = await applyProposal({
      root,
      file: await proposalFile(changed),
      allowOverwrite: true,
    });
    expect(forced.collisions).toEqual([]);
    expect(forced.written).toHaveLength(1);
  });

  it('is a no-op when the same proposal is applied twice', async () => {
    const root = await workspace();
    const file = await proposalFile(VALID);
    await applyProposal({ root, file });

    // Identical bytes, so the safe writer reports no collision and no change.
    const again = await applyProposal({ root, file, allowOverwrite: true });
    expect(again.written).toHaveLength(1);
    expect(await readFile(join(root, again.recordPath), 'utf8')).toBe(
      await readFile(join(root, again.recordPath), 'utf8'),
    );
  });

  it('writes nothing on a dry run', async () => {
    const root = await workspace();
    await applyProposal({ root, file: await proposalFile(VALID), dryRun: true });
    expect(existsSync(join(root, '.planmo', 'proposals'))).toBe(false);
  });

  it('cannot be made to write outside .planmo/proposals/', async () => {
    const root = await workspace();
    const hostile = { ...VALID, requestId: '../../../../etc/passwd' };
    const outcome = await applyProposal({ root, file: await proposalFile(hostile) });

    expect(outcome.recordPath).toBe('.planmo/proposals/etc-passwd.json');
    expect(outcome.recordPath).not.toContain('..');
    // Everything written really is inside the proposals directory.
    expect((await readdir(join(root, '.planmo', 'proposals'))).length).toBe(1);
  });
});

describe('planmo agent apply — CLI', () => {
  it('records the proposal and exits 0', async () => {
    const root = await workspace();
    const { io, out } = capture();

    expect(await run(['agent', 'apply', await proposalFile(VALID), '--dir', root], io)).toBe(0);
    expect(out.join('\n')).toContain('✓ wrote .planmo/proposals/');
    expect(out.join('\n')).toContain('Recorded proposal "Add planmo next to the command surface"');
  });

  it('says plainly that plan documents were not rewritten', async () => {
    const root = await workspace();
    const { io, out } = capture();
    await run(['agent', 'apply', await proposalFile(VALID), '--dir', root], io);
    expect(out.join('\n')).toContain('Plan documents were NOT rewritten');
  });

  it('lists the items so the user can see what was accepted', async () => {
    const root = await workspace();
    const { io, out } = capture();
    await run(['agent', 'apply', await proposalFile(VALID), '--dir', root], io);
    const text = out.join('\n');
    expect(text).toContain('cli-next  proposed  Wire the next command.');
    expect(text).toContain('ref: REQ-001');
    expect(text).toContain('why: Users cannot find it.');
  });

  it('exits 1 and writes nothing for an invalid proposal', async () => {
    const root = await workspace();
    const { io, err } = capture();
    const file = await proposalFile({ ...VALID, command: 'rm -rf /' });

    expect(await run(['agent', 'apply', file, '--dir', root], io)).toBe(1);
    expect(err.join('\n')).toContain('proposal rejected');
    expect(existsSync(join(root, '.planmo', 'proposals'))).toBe(false);
  });

  it('exits 2 when the proposal is already recorded', async () => {
    const root = await workspace();
    const file = await proposalFile(VALID);
    await run(['agent', 'apply', file, '--dir', root], capture().io);
    const { io, err } = capture();

    expect(await run(['agent', 'apply', file, '--dir', root], io)).toBe(2);
    expect(err.join('\n')).toContain('already recorded');
    expect(err.join('\n')).toContain('nothing changed');
  });

  it('exits 3 without a workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'planmo-apply-empty-'));
    const { io, err } = capture();
    expect(await run(['agent', 'apply', await proposalFile(VALID), '--dir', root], io)).toBe(3);
    expect(err.join('\n')).toContain('planmo agent apply:');
  });

  it('explains itself when no file is given', async () => {
    const { io, err } = capture();
    expect(await run(['agent', 'apply'], io)).toBe(1);
    expect(err.join('\n')).toContain('a proposal file is required');
    expect(err.join('\n')).toContain('usage: planmo agent apply');
  });
});

describe('USAGE', () => {
  it('documents agent apply', async () => {
    const { io, out } = capture();
    await run(['--help'], io);
    const text = out.join('\n');
    expect(text).toContain('agent apply');
    expect(text).toContain('plan documents are never rewritten');
  });
});
