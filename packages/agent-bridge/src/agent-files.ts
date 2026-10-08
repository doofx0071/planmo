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

/** A value as a TOML basic (double-quoted) string, on one line. */
function tomlBasicString(value: string): string {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ')}"`;
}

/**
 * A TOML command, per Gemini CLI, Tabnine and iFlow — all three use the same
 * shape: `prompt` is required, `description` is optional.
 *
 * The body is emitted as a literal multi-line string (`'''`), which performs no
 * escape processing, so markdown backslashes and backticks survive verbatim. A
 * body that itself contains `'''` cannot use the literal form, so it falls back
 * to an escaped basic string (`"""`) — the only case where the body is rewritten.
 */
function renderTomlCommand(description: string, body: string): string {
  const prompt = body.includes("'''")
    ? `"""\n${body.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')}\n"""`
    : `'''\n${body}\n'''`;
  return `description = ${tomlBasicString(description)}\nprompt = ${prompt}\n`;
}

export function renderAgentFiles(
  target: AgentTarget,
  templates: readonly AgentCommandTemplate[],
): RenderedAgentFile[] {
  return templates.map((template) => {
    const commandName = `${target.prefix}-${template.name}`;
    if (target.layout === 'skills') {
      // Skills are always `SKILL.md`, whatever the agent's command format is.
      return {
        path: `${target.commandDir}/${commandName}/SKILL.md`,
        commandName,
        content: renderSkillFile(commandName, template.description, template.body),
      };
    }
    return {
      path: `${target.commandDir}/${commandName}.${target.format}`,
      commandName,
      content:
        target.format === 'toml'
          ? renderTomlCommand(template.description, template.body)
          : renderCommandFile(template.description, template.body),
    };
  });
}
