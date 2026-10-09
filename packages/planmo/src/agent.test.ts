import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initWorkspace } from '@planmo/core';
import { contentHash, installAgentCommands, refreshable } from './agent.js';

/**
 * `planmo agent init` installs PlanMo's command files into the agent's own
 * directory. The invariants that matter: the documented path per agent, a skill
 * name that matches its directory, refusal to write outside the project without
 * explicit consent, and an upgrade that never clobbers user edits.
 */
async function freshWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-agent-'));
  await initWorkspace({ root, name: 'agent-fixture' });
  return root;
}

describe('installAgentCommands', () => {
  it('writes opencode commands into .opencode/commands', async () => {
    const root = await freshWorkspace();
    const result = await installAgentCommands({ root, agent: 'opencode' });

    expect(result.written).toContain('.opencode/commands/planmo-next.md');
    expect(result.collisions).toEqual([]);
    const body = await readFile(join(root, '.opencode/commands/planmo-next.md'), 'utf8');
    expect(body).toContain('description:');
    expect(body).toContain('npx planmo next --print');
  });

  it('writes skills with a directory-matching name', async () => {
    const root = await freshWorkspace();
    const result = await installAgentCommands({ root, agent: 'codex' });

    expect(result.written).toContain('.agents/skills/planmo-next/SKILL.md');
    const body = await readFile(join(root, '.agents/skills/planmo-next/SKILL.md'), 'utf8');
    expect(body).toContain('name: planmo-next');
  });

  it('reports the command names the user should invoke', async () => {
    const root = await freshWorkspace();
    const result = await installAgentCommands({ root, agent: 'opencode' });
    expect(result.files.map((f) => f.commandName).sort()).toEqual([
      'planmo-next',
      'planmo-propose',
      'planmo-status',
    ]);
  });

  it('refuses a global target without explicit consent', async () => {
    const root = await freshWorkspace();
    await expect(installAgentCommands({ root, agent: 'hermes-global' })).rejects.toThrow(
      /--global/,
    );
  });

  it('installs a global target under the home directory when consent is given', async () => {
    const root = await freshWorkspace();
    const home = await mkdtemp(join(tmpdir(), 'planmo-home-'));
    const result = await installAgentCommands({ root, agent: 'hermes-global', global: true, home });

    expect(result.written).toContain('.hermes/skills/planmo-next/SKILL.md');
    const body = await readFile(join(home, '.hermes/skills/planmo-next/SKILL.md'), 'utf8');
    expect(body).toContain('name: planmo-next');
  });

  it('refuses an unknown agent', async () => {
    const root = await freshWorkspace();
    await expect(installAgentCommands({ root, agent: 'nope' })).rejects.toThrow(/unknown agent/);
  });

  it('refuses a directory with no workspace', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'planmo-agent-empty-'));
    await expect(installAgentCommands({ root: empty, agent: 'opencode' })).rejects.toThrow();
  });

  it('dry-run writes nothing', async () => {
    const root = await freshWorkspace();
    await installAgentCommands({ root, agent: 'opencode', dryRun: true });
    await expect(
      readFile(join(root, '.opencode/commands/planmo-next.md'), 'utf8'),
    ).rejects.toThrow();
  });

  it('refuses to overwrite an unmanaged file without --force', async () => {
    const root = await freshWorkspace();
    // A hand-written command file at the target path is unmanaged content.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(root, '.opencode/commands'), { recursive: true });
    await writeFile(join(root, '.opencode/commands/planmo-next.md'), 'mine\n', 'utf8');

    const result = await installAgentCommands({ root, agent: 'opencode' });
    expect(result.collisions).toContain('.opencode/commands/planmo-next.md');
    expect(await readFile(join(root, '.opencode/commands/planmo-next.md'), 'utf8')).toBe('mine\n');
  });

  it('re-running is a clean no-op', async () => {
    const root = await freshWorkspace();
    const first = await installAgentCommands({ root, agent: 'opencode' });
    expect(first.written.length).toBe(3);

    const second = await installAgentCommands({ root, agent: 'opencode' });
    expect(second.collisions).toEqual([]);
    expect(second.written).toEqual([]);
  });

  it('--force overwrites a file the user edited', async () => {
    const root = await freshWorkspace();
    await installAgentCommands({ root, agent: 'opencode' });
    const target = join(root, '.opencode/commands/planmo-next.md');
    await writeFile(target, 'mine\n', 'utf8');

    const forced = await installAgentCommands({ root, agent: 'opencode', allowOverwrite: true });
    expect(forced.collisions).toEqual([]);
    expect(forced.written).toContain('.opencode/commands/planmo-next.md');
    expect(await readFile(target, 'utf8')).toContain('npx planmo next --print');
  });
});

describe('refreshable', () => {
  it('hashes content as sha256 hex', () => {
    expect(contentHash('one')).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash('one')).not.toBe(contentHash('two'));
  });

  it('refreshes only files the user has not edited', () => {
    const files = [
      { path: 'a.md', content: 'one' },
      { path: 'b.md', content: 'two' },
    ];
    const onDisk = new Map([
      ['a.md', 'one'],
      ['b.md', 'edited by the user'],
    ]);
    expect(refreshable(files, onDisk)).toEqual(['a.md']);
  });

  it('does not report a missing file as refreshable', () => {
    const files = [{ path: 'missing.md', content: 'x' }];
    // Absent on disk means "create", not "refresh".
    expect(refreshable(files, new Map())).toEqual([]);
  });
});
