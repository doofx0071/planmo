import { describe, expect, it } from 'vitest';
import { AGENT_TARGETS, agentTarget } from './agent-targets.js';

/**
 * The agent target table is the whole spec-kit idea in one data structure: where
 * each agent looks for command files, and how the user types the command. The
 * formats are third-party, so they are pinned here — a drift shows up as a
 * failing test rather than a silently broken command.
 */
describe('agent targets', () => {
  it('covers every adapter id the registry knows', () => {
    const ids = AGENT_TARGETS.map((t) => t.id);
    for (const required of ['opencode', 'claude-code', 'codex', 'generic']) {
      expect(ids, required).toContain(required);
    }
  });

  it('uses the documented directory and layout per agent', () => {
    expect(agentTarget('opencode')).toMatchObject({
      commandDir: '.opencode/commands',
      layout: 'commands',
    });
    expect(agentTarget('claude-code')).toMatchObject({
      commandDir: '.claude/skills',
      layout: 'skills',
    });
    expect(agentTarget('codex')).toMatchObject({ commandDir: '.agents/skills', layout: 'skills' });
    expect(agentTarget('copilot')).toMatchObject({
      commandDir: '.github/skills',
      layout: 'skills',
    });
  });

  it('spells invocation per agent', () => {
    expect(agentTarget('codex')?.invocation('planmo-next')).toBe('$planmo-next');
    expect(agentTarget('opencode')?.invocation('planmo-next')).toBe('/planmo-next');
    expect(agentTarget('hermes')?.invocation('planmo-next')).toBe('/planmo-next');
  });

  it('marks only the out-of-project target as global', () => {
    expect(AGENT_TARGETS.filter((t) => t.global === true).map((t) => t.id)).toEqual(['hermes']);
  });

  it('keeps every command directory inside the project except the global one', () => {
    for (const target of AGENT_TARGETS) {
      if (target.global === true) continue;
      expect(target.commandDir.startsWith('.'), target.id).toBe(true);
      expect(target.commandDir, target.id).not.toContain('..');
    }
  });
});
