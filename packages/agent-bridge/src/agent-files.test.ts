import { describe, expect, it } from 'vitest';
import { renderAgentFiles } from './agent-files.js';
import { AGENT_COMMANDS } from './agent-templates.js';
import { agentTarget } from './agent-targets.js';

const opencode = agentTarget('opencode');
const codex = agentTarget('codex');

describe('renderAgentFiles', () => {
  it('requires a known target', () => {
    expect(opencode).toBeDefined();
    expect(codex).toBeDefined();
  });

  it('writes flat markdown commands for the commands layout', () => {
    const files = renderAgentFiles(opencode!, AGENT_COMMANDS);
    expect(files[0]?.path).toBe('.opencode/commands/planmo-next.md');
    expect(files[0]?.content).toContain('description:');
  });

  it('writes <name>/SKILL.md for the skills layout', () => {
    const files = renderAgentFiles(codex!, AGENT_COMMANDS);
    expect(files[0]?.path).toBe('.agents/skills/planmo-next/SKILL.md');
  });

  it('makes the skill name equal its directory name', () => {
    for (const file of renderAgentFiles(codex!, AGENT_COMMANDS)) {
      const parts = file.path.split('/');
      const dir = parts[parts.length - 2];
      expect(file.content, file.path).toContain(`name: ${dir}`);
    }
  });

  it('is deterministic', () => {
    expect(renderAgentFiles(codex!, AGENT_COMMANDS)).toEqual(
      renderAgentFiles(codex!, AGENT_COMMANDS),
    );
  });

  it('emits no timestamp and no absolute path', () => {
    for (const file of renderAgentFiles(opencode!, AGENT_COMMANDS)) {
      expect(file.content).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(file.content).not.toMatch(/[A-Za-z]:[\\/]/);
    }
  });

  it('produces one file per template', () => {
    expect(renderAgentFiles(opencode!, AGENT_COMMANDS)).toHaveLength(AGENT_COMMANDS.length);
  });
});
