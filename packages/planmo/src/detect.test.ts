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

/** Detected agent ids for a project containing `files`, in detection order. */
const detect = async (files: string[]): Promise<string[]> =>
  (await detectAgents(await project(files), { home: EMPTY_HOME })).map((d) => d.id);

describe('detectAgents', () => {
  it('finds nothing in an empty project', async () => {
    expect(await detect([])).toEqual([]);
  });

  it('finds nothing in a project that only has unrelated tool directories', async () => {
    expect(await detect(['.idea/', '.sublime/', 'Makefile'])).toEqual([]);
  });

  it('detects an agent from its own directory', async () => {
    expect(await detect(['.opencode/'])).toEqual(['opencode']);
    expect(await detect(['.cursor/'])).toEqual(['cursor']);
    expect(await detect(['.gemini/'])).toEqual(['gemini-cli']);
    expect(await detect(['.kiro/'])).toEqual(['kiro']);
    expect(await detect(['.kimi-code/'])).toEqual(['kimi']);
    expect(await detect(['.grok/'])).toEqual(['grok']);
    expect(await detect(['.kilo/'])).toEqual(['kilo-code']);
    expect(await detect(['.roo/'])).toEqual(['roo-code']);
    expect(await detect(['.clinerules/'])).toEqual(['cline']);
    expect(await detect(['.windsurf/'])).toEqual(['windsurf']);
    expect(await detect(['.junie/'])).toEqual(['junie']);
    expect(await detect(['.trae/'])).toEqual(['trae']);
    expect(await detect(['.augment/'])).toEqual(['augment']);
    expect(await detect(['.tabnine/'])).toEqual(['tabnine']);
    expect(await detect(['.iflow/'])).toEqual(['iflow']);
    expect(await detect(['.codebuddy/'])).toEqual(['codebuddy']);
    expect(await detect(['.qwen/'])).toEqual(['qwen-code']);
    expect(await detect(['.crush/'])).toEqual(['crush']);
    expect(await detect(['.continue/'])).toEqual(['continue']);
    expect(await detect(['.factory/'])).toEqual(['factory-droid']);
    expect(await detect(['.amazonq/'])).toEqual(['amazon-q']);
    expect(await detect(['.openhands/'])).toEqual(['openhands']);
    expect(await detect(['.goose/'])).toEqual(['goose']);
  });

  it('detects an agent from its instruction file', async () => {
    expect(await detect(['CLAUDE.md'])).toEqual(['claude-code']);
    expect(await detect(['GEMINI.md'])).toEqual(['gemini-cli']);
    expect(await detect(['QWEN.md'])).toEqual(['qwen-code']);
    expect(await detect(['TABNINE.md'])).toEqual(['tabnine']);
    expect(await detect(['.goosehints'])).toEqual(['goose']);
    expect(await detect(['.github/copilot-instructions.md'])).toEqual(['copilot']);
  });

  it('reports every agent that shares a marker, rather than picking one', async () => {
    // AGENTS.md is the shared convention: several agents read it. Detection says
    // so instead of guessing which one the user means.
    expect(await detect(['AGENTS.md'])).toEqual(['amp', 'codex', 'openhands']);
  });

  it('detects hermes from the global ~/.hermes marker', async () => {
    const home = await mkdtemp(join(tmpdir(), 'planmo-home-'));
    await mkdir(join(home, '.hermes'), { recursive: true });
    const found = await detectAgents(await project([]), { home });
    expect(found.map((d) => d.id)).toEqual(['hermes']);
    expect(found[0]?.evidence).toContain('~/.hermes/');
  });

  it('reports the evidence it used', async () => {
    const found = await detectAgents(await project(['.opencode/']), { home: EMPTY_HOME });
    expect(found[0]?.evidence).toContain('.opencode/');
    expect(found[0]?.state).toBe('present');
  });

  it('reports installed when PlanMo commands are already there', async () => {
    const root = await project(['.opencode/commands/planmo-next.md']);
    const found = await detectAgents(root, { home: EMPTY_HOME });
    expect(found[0]?.id).toBe('opencode');
    expect(found[0]?.state).toBe('installed');
    expect(found[0]?.evidence).toContain('.opencode/commands/planmo-next.md');
  });

  it('reports installed for a skills agent too', async () => {
    const root = await project(['.cursor/skills/planmo-next/SKILL.md']);
    const found = await detectAgents(root, { home: EMPTY_HOME });
    expect(found[0]?.id).toBe('cursor');
    expect(found[0]?.state).toBe('installed');
  });

  it('sorts installed first, then by id', async () => {
    const root = await project(['.opencode/', '.claude/', '.agents/skills/planmo-next/SKILL.md']);
    const found = await detectAgents(root, { home: EMPTY_HOME });
    expect(found[0]?.state).toBe('installed');
    // Several agents read `.agents/skills`, so they are all reported as installed.
    expect(found.map((d) => d.id)).toEqual([
      'amp',
      'codex',
      'goose',
      'openhands',
      'zed',
      'claude-code',
      'opencode',
    ]);
  });
});
