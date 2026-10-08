import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectAgents } from './detect.js';

/**
 * Agent detection drives the interactive default, so it must be honest about its
 * evidence: the user sees WHY an agent was detected and can untick it. Detection
 * reads the project (and the one global marker Hermes uses), never the network.
 *
 * Every test injects an empty home so the machine's real `~/.hermes` cannot leak
 * into the result.
 */
const EMPTY_HOME = await mkdtemp(join(tmpdir(), 'planmo-home-'));

async function project(files: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-detect-'));
  for (const file of files) {
    const path = join(root, file);
    if (file.endsWith('/')) {
      await mkdir(path, { recursive: true });
    } else {
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, '', 'utf8');
    }
  }
  return root;
}

const detect = async (files: string[]): Promise<string[]> =>
  (await detectAgents(await project(files), { home: EMPTY_HOME })).map((d) => d.id);

describe('detectAgents', () => {
  it('finds nothing in an empty project', async () => {
    expect(await detect([])).toEqual([]);
  });

  it('detects opencode from .opencode/', async () => {
    const found = await detectAgents(await project(['.opencode/']), { home: EMPTY_HOME });
    expect(found.map((d) => d.id)).toEqual(['opencode']);
    expect(found[0]?.evidence).toContain('.opencode/');
    expect(found[0]?.state).toBe('present');
  });

  it('detects claude-code from either .claude/ or CLAUDE.md', async () => {
    expect(await detect(['.claude/'])).toEqual(['claude-code']);
    expect(await detect(['CLAUDE.md'])).toEqual(['claude-code']);
  });

  it('detects copilot from .github/copilot-instructions.md', async () => {
    expect(await detect(['.github/copilot-instructions.md'])).toEqual(['copilot']);
  });

  it('detects codex from .codex/ or AGENTS.md', async () => {
    expect(await detect(['.codex/'])).toEqual(['codex']);
    expect(await detect(['AGENTS.md'])).toEqual(['codex']);
  });

  it('detects hermes from the global ~/.hermes marker', async () => {
    const home = await mkdtemp(join(tmpdir(), 'planmo-home-'));
    await mkdir(join(home, '.hermes'), { recursive: true });
    const found = await detectAgents(await project([]), { home });
    expect(found.map((d) => d.id)).toEqual(['hermes']);
    expect(found[0]?.evidence).toContain('~/.hermes/');
  });

  it('reports installed when PlanMo commands are already there', async () => {
    const root = await project(['.opencode/commands/planmo-next.md']);
    const found = await detectAgents(root, { home: EMPTY_HOME });
    expect(found[0]?.id).toBe('opencode');
    expect(found[0]?.state).toBe('installed');
    expect(found[0]?.evidence).toContain('.opencode/commands/planmo-next.md');
  });

  it('sorts installed first, then by id', async () => {
    const root = await project(['.opencode/', '.claude/', '.agents/skills/planmo-next/SKILL.md']);
    const found = await detectAgents(root, { home: EMPTY_HOME });
    expect(found[0]?.state).toBe('installed');
    expect(found[0]?.id).toBe('codex');
    expect(found.map((d) => d.id)).toEqual(['codex', 'claude-code', 'opencode']);
  });

  it('never reports an agent it cannot install for', async () => {
    expect(await detect(['.cursor/', '.gemini/', 'GEMINI.md'])).toEqual([]);
  });
});
