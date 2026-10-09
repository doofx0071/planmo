import { describe, expect, it } from 'vitest';
import { AGENT_TARGETS, DETECTABLE_TARGETS, agentTarget } from './agent-targets.js';

/**
 * The agent target table is the whole spec-kit idea in one data structure: where
 * each agent looks for command files, and how the user types the command. The
 * formats are third-party, so they are pinned here — a drift shows up as a
 * failing test rather than a silently broken command.
 *
 * Every row records the official documentation it was read from, so a future
 * change can be re-checked against the source rather than against this file.
 */
describe('agent targets', () => {
  it('covers every agent the CLI advertises', () => {
    const ids = AGENT_TARGETS.map((t) => t.id);
    for (const required of [
      'amazon-q',
      'amp',
      'augment',
      'claude-code',
      'cline',
      'codebuddy',
      'codex',
      'commandcode',
      'continue',
      'copilot',
      'crush',
      'cursor',
      'factory-droid',
      'gemini-cli',
      'goose',
      'grok',
      'hermes',
      'hermes-global',
      'iflow',
      'junie',
      'kilo-code',
      'kimi',
      'kiro',
      'opencode',
      'openhands',
      'qwen-code',
      'roo-code',
      'tabnine',
      'trae',
      'windsurf',
      'zed',
      'generic',
    ]) {
      expect(ids, required).toContain(required);
    }
  });

  it('uses the documented directory, layout and format per agent', () => {
    // Flat markdown command files.
    expect(agentTarget('opencode')).toMatchObject({
      commandDir: '.opencode/commands',
      layout: 'commands',
      format: 'md',
    });
    expect(agentTarget('roo-code')).toMatchObject({ commandDir: '.roo/commands' });
    expect(agentTarget('kilo-code')).toMatchObject({ commandDir: '.kilo/commands' });
    expect(agentTarget('junie')).toMatchObject({ commandDir: '.junie/commands' });
    expect(agentTarget('trae')).toMatchObject({ commandDir: '.trae/commands' });
    expect(agentTarget('augment')).toMatchObject({ commandDir: '.augment/commands' });
    expect(agentTarget('factory-droid')).toMatchObject({ commandDir: '.factory/commands' });
    expect(agentTarget('codebuddy')).toMatchObject({ commandDir: '.codebuddy/commands' });
    expect(agentTarget('commandcode')).toMatchObject({
      commandDir: '.commandcode/commands',
      layout: 'commands',
      format: 'md',
    });
    expect(agentTarget('qwen-code')).toMatchObject({ commandDir: '.qwen/commands' });
    expect(agentTarget('crush')).toMatchObject({ commandDir: '.crush/commands' });
    expect(agentTarget('continue')).toMatchObject({ commandDir: '.continue/prompts' });
    expect(agentTarget('amazon-q')).toMatchObject({ commandDir: '.amazonq/prompts' });
    // These two call them workflows.
    expect(agentTarget('windsurf')).toMatchObject({ commandDir: '.windsurf/workflows' });
    expect(agentTarget('cline')).toMatchObject({ commandDir: '.clinerules/workflows' });

    // Agent Skills: a directory per command containing SKILL.md.
    expect(agentTarget('claude-code')).toMatchObject({
      commandDir: '.claude/skills',
      layout: 'skills',
    });
    expect(agentTarget('cursor')).toMatchObject({ commandDir: '.cursor/skills', layout: 'skills' });
    expect(agentTarget('kiro')).toMatchObject({ commandDir: '.kiro/skills', layout: 'skills' });
    expect(agentTarget('kimi')).toMatchObject({
      commandDir: '.kimi-code/skills',
      layout: 'skills',
    });
    expect(agentTarget('grok')).toMatchObject({ commandDir: '.grok/skills', layout: 'skills' });
    expect(agentTarget('copilot')).toMatchObject({ commandDir: '.github/skills' });
    expect(agentTarget('zed')).toMatchObject({ commandDir: '.agents/skills', layout: 'skills' });

    // TOML command files.
    expect(agentTarget('gemini-cli')).toMatchObject({
      commandDir: '.gemini/commands',
      format: 'toml',
    });
    expect(agentTarget('tabnine')).toMatchObject({
      commandDir: '.tabnine/agent/commands',
      format: 'toml',
    });
    expect(agentTarget('iflow')).toMatchObject({ commandDir: '.iflow/commands', format: 'toml' });
  });

  it('spells invocation per agent', () => {
    expect(agentTarget('codex')?.invocation('planmo-next')).toBe('$planmo-next');
    expect(agentTarget('opencode')?.invocation('planmo-next')).toBe('/planmo-next');
    expect(agentTarget('hermes')?.invocation('planmo-next')).toBe('/planmo-next');
    expect(agentTarget('amazon-q')?.invocation('planmo-next')).toBe('@planmo-next');
    // Cline keeps the extension as part of the command name.
    expect(agentTarget('cline')?.invocation('planmo-next')).toBe('/planmo-next.md');
  });

  it('records the official documentation each row was verified against', () => {
    for (const target of AGENT_TARGETS) {
      expect(target.docs, target.id).toMatch(/^https:\/\//);
    }
  });

  it('keeps only the documented layouts and formats', () => {
    for (const target of AGENT_TARGETS) {
      expect(['commands', 'skills'], target.id).toContain(target.layout);
      expect(['md', 'toml'], target.id).toContain(target.format);
      // A skill is always SKILL.md, whatever the agent's command format is.
      if (target.layout === 'skills') expect(target.format, target.id).toBe('md');
    }
  });

  it('marks only the out-of-project target as global', () => {
    expect(AGENT_TARGETS.filter((t) => t.global === true).map((t) => t.id)).toEqual([
      'hermes-global',
    ]);
  });

  it('installs Hermes project-locally, where Hermes actually looks', () => {
    // Hermes reads repo-local skills from `<project>/.hermes/skills/`. It used to
    // point at `~/.hermes/skills`, which on Windows is not Hermes's home at all,
    // so the file landed where Hermes never scanned — and it needed --global.
    expect(agentTarget('hermes')).toMatchObject({
      commandDir: '.hermes/skills',
      layout: 'skills',
    });
    expect(agentTarget('hermes')?.global).toBeUndefined();
    expect(agentTarget('hermes-global')).toMatchObject({
      commandDir: '~/.hermes/skills',
      global: true,
    });
  });

  it('keeps every command directory inside the project except the global one', () => {
    for (const target of AGENT_TARGETS) {
      if (target.global === true) continue;
      expect(target.commandDir.startsWith('.'), target.id).toBe(true);
      expect(target.commandDir, target.id).not.toContain('..');
    }
  });

  it('gives every detectable agent a marker, and generic none', () => {
    expect(agentTarget('generic')?.markers).toEqual([]);
    expect(DETECTABLE_TARGETS).toHaveLength(AGENT_TARGETS.length - 1);
    for (const target of DETECTABLE_TARGETS) {
      expect(target.markers.length, target.id).toBeGreaterThan(0);
    }
  });

  it('keeps every marker inside the project, except for the global target', () => {
    for (const target of DETECTABLE_TARGETS) {
      for (const marker of target.markers) {
        if (marker.startsWith('~')) {
          expect(target.global, target.id).toBe(true);
        } else {
          // A marker is a repo-relative path: it must not be absolute or escape.
          expect(marker.startsWith('/'), `${target.id}: ${marker}`).toBe(false);
          expect(marker, `${target.id}: ${marker}`).not.toContain('..');
        }
      }
    }
  });

  it('has no duplicate ids', () => {
    const ids = AGENT_TARGETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shares only the cross-client .agents/skills directory', () => {
    const byDir = new Map<string, string[]>();
    for (const target of AGENT_TARGETS) {
      byDir.set(target.commandDir, [...(byDir.get(target.commandDir) ?? []), target.id]);
    }
    for (const [dir, ids] of byDir) {
      if (ids.length === 1) continue;
      // Several agents read the Agent Skills cross-client convention in addition
      // to their own directory, so sharing is intentional and installing for two
      // of them is idempotent rather than a double write.
      expect(dir, ids.join(', ')).toBe('.agents/skills');
      for (const id of ids) expect(agentTarget(id)?.layout, id).toBe('skills');
    }
  });
});
