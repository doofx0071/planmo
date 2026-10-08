import type { AgentCommandTemplate } from './agent-templates.js';
import type { AgentTarget } from './agent-targets.js';

/**
 * Render the exact bytes for one agent target.
 *
 * PURE: no I/O, no clock, no randomness, deterministic order. The safe writer
 * stays the only thing that touches disk, so every installed file is checksummed
 * into `.planmo/manifest.json` like any other generated artifact.
 */
export interface RenderedAgentFile {
  /** Repo-relative path (or `~/...` for a global target). */
  path: string;
  /** Exact UTF-8 content. */
  content: string;
  /** Command name as the user invokes it, e.g. `planmo-next`. */
  commandName: string;
}

/** A flat markdown command: optional frontmatter, then the prompt body. */
function renderCommandFile(description: string, body: string): string {
  return `---\ndescription: ${description}\n---\n${body}\n`;
}

/** An Agent Skills file: `name` must equal the containing directory name. */
function renderSkillFile(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`;
}

export function renderAgentFiles(
  target: AgentTarget,
  templates: readonly AgentCommandTemplate[],
): RenderedAgentFile[] {
  return templates.map((template) => {
    const commandName = `${target.prefix}-${template.name}`;
    if (target.layout === 'skills') {
      return {
        path: `${target.commandDir}/${commandName}/SKILL.md`,
        commandName,
        content: renderSkillFile(commandName, template.description, template.body),
      };
    }
    return {
      path: `${target.commandDir}/${commandName}.md`,
      commandName,
      content: renderCommandFile(template.description, template.body),
    };
  });
}
