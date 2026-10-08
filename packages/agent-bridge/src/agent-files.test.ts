import { describe, expect, it } from 'vitest';
import { renderAgentFiles } from './agent-files.js';
import { AGENT_COMMANDS } from './agent-templates.js';
import { AGENT_TARGETS, agentTarget } from './agent-targets.js';

const opencode = agentTarget('opencode')!;
const codex = agentTarget('codex')!;
const gemini = agentTarget('gemini-cli')!;

describe('renderAgentFiles', () => {
  it('requires a known target', () => {
    expect(opencode).toBeDefined();
    expect(codex).toBeDefined();
    expect(gemini).toBeDefined();
  });

  it('writes flat markdown commands for the commands layout', () => {
    const files = renderAgentFiles(opencode, AGENT_COMMANDS);
    expect(files[0]?.path).toBe('.opencode/commands/planmo-next.md');
    expect(files[0]?.content).toContain('description:');
  });

  it('writes <name>/SKILL.md for the skills layout', () => {
    const files = renderAgentFiles(codex, AGENT_COMMANDS);
    expect(files[0]?.path).toBe('.agents/skills/planmo-next/SKILL.md');
  });

  it('makes the skill name equal its directory name', () => {
    for (const target of AGENT_TARGETS.filter((t) => t.layout === 'skills')) {
      for (const file of renderAgentFiles(target, AGENT_COMMANDS)) {
        const parts = file.path.split('/');
        const dir = parts[parts.length - 2];
        expect(file.content, file.path).toContain(`name: ${dir}`);
      }
    }
  });

  it('writes TOML for the agents whose commands are TOML', () => {
    const files = renderAgentFiles(gemini, AGENT_COMMANDS);
    expect(files[0]?.path).toBe('.gemini/commands/planmo-next.toml');
    expect(files[0]?.content).toMatch(/^description = "/);
    expect(files[0]?.content).toContain("prompt = '''");
  });

  it('keeps the TOML prompt body verbatim', () => {
    const content = renderAgentFiles(gemini, AGENT_COMMANDS)[0]!.content;
    const start = content.indexOf("'''\n") + 4;
    const end = content.lastIndexOf("\n'''");
    expect(content.slice(start, end)).toBe(AGENT_COMMANDS[0]!.body);
  });

  it('escapes a TOML description onto one line', () => {
    for (const file of renderAgentFiles(gemini, AGENT_COMMANDS)) {
      const line = file.content.split('\n')[0]!;
      expect(line, file.path).toMatch(/^description = "[^"]*"$/);
    }
  });

  it('uses SKILL.md for skills and the target format for commands', () => {
    for (const target of AGENT_TARGETS) {
      for (const file of renderAgentFiles(target, AGENT_COMMANDS)) {
        if (target.layout === 'skills') {
          expect(file.path, target.id).toMatch(/\/SKILL\.md$/);
        } else {
          expect(file.path, target.id).toMatch(new RegExp(`\\.${target.format}$`));
        }
      }
    }
  });

  it('produces one file per template for every agent', () => {
    for (const target of AGENT_TARGETS) {
      expect(renderAgentFiles(target, AGENT_COMMANDS), target.id).toHaveLength(
        AGENT_COMMANDS.length,
      );
    }
  });

  it('puts every rendered file inside the target directory', () => {
    for (const target of AGENT_TARGETS) {
      for (const file of renderAgentFiles(target, AGENT_COMMANDS)) {
        expect(file.path.startsWith(`${target.commandDir}/`), file.path).toBe(true);
      }
    }
  });

  it('is deterministic', () => {
    for (const target of AGENT_TARGETS) {
      expect(renderAgentFiles(target, AGENT_COMMANDS)).toEqual(
        renderAgentFiles(target, AGENT_COMMANDS),
      );
    }
  });

  it('emits no timestamp and no absolute path', () => {
    for (const target of AGENT_TARGETS) {
      for (const file of renderAgentFiles(target, AGENT_COMMANDS)) {
        expect(file.content, file.path).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
        expect(file.content, file.path).not.toMatch(/[A-Za-z]:[\\/]/);
      }
    }
  });
});
