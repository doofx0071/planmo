/**
 * Where each agent looks for command files, and how the user invokes them.
 *
 * This is the spec-kit idea expressed as data: one row per agent, so adding an
 * agent is never an architecture change (ADR-0008 — the generic contract allows
 * adding adapters without it).
 *
 * The formats are third-party and will drift, so they are pinned by
 * `agent-targets.test.ts` and recorded in
 * docs/02-architecture/agent-command-files.md. Verified against each agent's own
 * documentation:
 *   - opencode: `.opencode/commands/<name>.md`, flat markdown, optional
 *     frontmatter, invoked `/name`.
 *   - Agent Skills (Claude Code, Codex, Copilot, Hermes): `<dir>/<name>/SKILL.md`
 *     with `name` + `description` frontmatter, where `name` must equal the
 *     directory name.
 *   - Codex spells invocation with `$` rather than `/`.
 */
export interface AgentTarget {
  /** Adapter id this target corresponds to. */
  id: string;
  /** Directory for command files, repo-relative (or `~/...` when global). */
  commandDir: string;
  /** `commands` = flat `<name>.md`; `skills` = `<name>/SKILL.md`. */
  layout: 'commands' | 'skills';
  /** Command name prefix, e.g. `planmo` -> `planmo-next`. */
  prefix: string;
  /** How the user types the command in that agent's chat. */
  invocation: (name: string) => string;
  /** True when the directory lives outside the project (needs --global). */
  global?: boolean;
}

/**
 * Every supported agent, in deterministic order.
 *
 * `generic` is last and always works: it writes plain markdown into
 * `.planmo/agents/commands/` for any agent without a documented location.
 */
export const AGENT_TARGETS: readonly AgentTarget[] = [
  {
    id: 'opencode',
    commandDir: '.opencode/commands',
    layout: 'commands',
    prefix: 'planmo',
    invocation: (name) => `/${name}`,
  },
  {
    id: 'claude-code',
    commandDir: '.claude/skills',
    layout: 'skills',
    prefix: 'planmo',
    invocation: (name) => `/${name}`,
  },
  {
    id: 'codex',
    commandDir: '.agents/skills',
    layout: 'skills',
    prefix: 'planmo',
    invocation: (name) => `$${name}`,
  },
  {
    id: 'copilot',
    commandDir: '.github/skills',
    layout: 'skills',
    prefix: 'planmo',
    invocation: (name) => `/${name}`,
  },
  {
    // Global by design: Hermes reads user-level skills from ~/.hermes/skills.
    // PlanMo refuses this target unless --global is passed explicitly, because
    // generation never writes outside the project root without consent.
    id: 'hermes',
    commandDir: '~/.hermes/skills',
    layout: 'skills',
    prefix: 'planmo',
    invocation: (name) => `/${name}`,
    global: true,
  },
  {
    id: 'generic',
    commandDir: '.planmo/agents/commands',
    layout: 'commands',
    prefix: 'planmo',
    invocation: (name) => `/${name}`,
  },
];

/** Look up a target by adapter id; undefined when the agent is unknown. */
export function agentTarget(id: string): AgentTarget | undefined {
  return AGENT_TARGETS.find((target) => target.id === id);
}
