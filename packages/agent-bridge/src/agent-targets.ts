/**
 * Where each agent looks for command files, and how the user invokes them.
 *
 * This is the spec-kit idea expressed as data: one row per agent, so adding an
 * agent is never an architecture change (ADR-0008 — the generic contract allows
 * adding adapters without it).
 *
 * The formats are third-party and will drift, so every row records the official
 * documentation it was read from, and `agent-targets.test.ts` pins the values.
 * A drift then shows up as a failing test rather than a silently broken command.
 *
 * Two layouts and two file formats cover the field:
 *   - `commands` — one flat file per command, named after the command.
 *   - `skills`   — one directory per command containing `SKILL.md`. The `name`
 *     frontmatter field must equal the directory name.
 *   - `md`       — YAML frontmatter + markdown body.
 *   - `toml`     — `prompt` (required) + `description`, per Gemini CLI, Tabnine
 *     and iFlow, which all use the same TOML shape.
 *
 * `.agents/skills/` is the cross-client convention published by the Agent Skills
 * standard (agentskills.io). It is not any one vendor's directory: several
 * agents read it in addition to their own, which is why more than one row below
 * points at it. Installing for two of those is idempotent, not a double write.
 */
export type AgentLayout = 'commands' | 'skills';
export type AgentFormat = 'md' | 'toml';

export interface AgentTarget {
  /** Adapter id this target corresponds to. */
  id: string;
  /** Display name for the picker and `agent list`. */
  label: string;
  /** Directory for command files, repo-relative (or `~/...` when global). */
  commandDir: string;
  /** `commands` = flat file per command; `skills` = `<name>/SKILL.md`. */
  layout: AgentLayout;
  /** File format for this agent. */
  format: AgentFormat;
  /** Command name prefix, e.g. `planmo` -> `planmo-next`. */
  prefix: string;
  /** How the user types the command in that agent's chat. */
  invocation: (name: string) => string;
  /**
   * How to reach the installed files when that is not a plain slash command —
   * a command palette, a key binding, or automatic agent invocation. Shown
   * instead of `invocation` when present.
   */
  howToRun?: string;
  /**
   * Filesystem evidence that this agent is used here. A trailing `/` is a
   * directory; a `~` prefix resolves against the home directory. Detection reads
   * these and nothing else, so the result is deterministic.
   */
  markers: readonly string[];
  /** Official documentation this row was verified against. */
  docs: string;
  /** True when the directory lives outside the project (needs --global). */
  global?: boolean;
}

/** Most agents: a bare slash command. */
const slash = (name: string): string => `/${name}`;

/**
 * Every supported agent, in deterministic order.
 *
 * `generic` is last and always works: it writes plain markdown into
 * `.planmo/agents/commands/` for any agent without a documented location.
 */
export const AGENT_TARGETS: readonly AgentTarget[] = [
  {
    id: 'amazon-q',
    label: 'Amazon Q Developer',
    commandDir: '.amazonq/prompts',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: (name) => `@${name}`,
    markers: ['.amazonq/'],
    docs: 'https://github.com/aws/amazon-q-developer-cli/pull/2799',
  },
  {
    id: 'amp',
    label: 'Amp (Sourcegraph)',
    commandDir: '.agents/skills',
    layout: 'skills',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    howToRun: 'command palette -> "skill: invoke" (Ctrl-O in the CLI)',
    markers: ['.amp/', 'AGENTS.md'],
    docs: 'https://ampcode.com/docs/customize/skills',
  },
  {
    id: 'augment',
    label: 'Augment Code',
    commandDir: '.augment/commands',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.augment/'],
    docs: 'https://docs.augmentcode.com/cli/custom-commands',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    commandDir: '.claude/skills',
    layout: 'skills',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.claude/', 'CLAUDE.md'],
    docs: 'https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview',
  },
  {
    id: 'cline',
    label: 'Cline',
    commandDir: '.clinerules/workflows',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    // Cline keeps the extension as part of the command name.
    invocation: (name) => `/${name}.md`,
    markers: ['.clinerules/'],
    docs: 'https://docs.cline.bot/features/slash-commands/workflows',
  },
  {
    id: 'codebuddy',
    label: 'CodeBuddy (Tencent)',
    commandDir: '.codebuddy/commands',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.codebuddy/'],
    docs: 'https://www.codebuddy.ai/docs/cli/slash-commands',
  },
  {
    id: 'codex',
    label: 'Codex (OpenAI)',
    commandDir: '.agents/skills',
    layout: 'skills',
    format: 'md',
    prefix: 'planmo',
    invocation: (name) => `$${name}`,
    markers: ['.codex/', 'AGENTS.md'],
    docs: 'https://agentskills.io/client-implementation/adding-skills-support',
  },
  {
    id: 'commandcode',
    label: 'Command Code',
    commandDir: '.commandcode/commands',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.commandcode/'],
    docs: 'https://commandcode.ai/docs/reference/slash-commands',
  },
  {
    id: 'continue',
    label: 'Continue',
    commandDir: '.continue/prompts',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.continue/'],
    docs: 'https://docs.continue.dev/customize/deep-dives/prompts',
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    commandDir: '.github/skills',
    layout: 'skills',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.github/copilot-instructions.md', '.github/skills/', '.github/prompts/'],
    docs: 'https://code.visualstudio.com/docs/agent-customization/agent-skills',
  },
  {
    id: 'crush',
    label: 'Crush (Charm)',
    commandDir: '.crush/commands',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    howToRun: 'type "/" or Ctrl-P, then Tab to "User Commands"',
    markers: ['.crush/', 'CRUSH.md'],
    docs: 'https://github.com/charmbracelet/crush/blob/main/COMMANDS.md',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    commandDir: '.cursor/skills',
    layout: 'skills',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.cursor/'],
    docs: 'https://cursor.com/docs/skills',
  },
  {
    id: 'factory-droid',
    label: 'Factory Droid',
    commandDir: '.factory/commands',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.factory/'],
    docs: 'https://docs.factory.ai/harness/custom-slash-commands',
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI (Google)',
    commandDir: '.gemini/commands',
    layout: 'commands',
    format: 'toml',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.gemini/', 'GEMINI.md'],
    docs: 'https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/custom-commands.md',
  },
  {
    id: 'goose',
    label: 'Goose (Block)',
    commandDir: '.agents/skills',
    layout: 'skills',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.goose/', '.goosehints'],
    docs: 'https://goose-docs.ai/docs/guides/recipes/storing-recipes',
  },
  {
    id: 'grok',
    label: 'Grok CLI (xAI)',
    commandDir: '.grok/skills',
    layout: 'skills',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.grok/'],
    docs: 'https://docs.x.ai/build/features/skills-plugins-marketplaces',
  },
  {
    id: 'iflow',
    label: 'iFlow CLI',
    commandDir: '.iflow/commands',
    layout: 'commands',
    format: 'toml',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.iflow/'],
    docs: 'https://platform.iflow.cn/en/cli/examples/subcommand',
  },
  {
    id: 'junie',
    label: 'JetBrains Junie',
    commandDir: '.junie/commands',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.junie/'],
    docs: 'https://junie.jetbrains.com/docs/custom-slash-commands.html',
  },
  {
    id: 'kilo-code',
    label: 'Kilo Code',
    commandDir: '.kilo/commands',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.kilo/', '.kilocode/', 'kilo.jsonc'],
    docs: 'https://kilo.ai/docs/customize/workflows',
  },
  {
    id: 'kimi',
    label: 'Kimi Code CLI (Moonshot)',
    commandDir: '.kimi-code/skills',
    layout: 'skills',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.kimi-code/'],
    docs: 'https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills.html',
  },
  {
    id: 'kiro',
    label: 'Kiro (AWS)',
    commandDir: '.kiro/skills',
    layout: 'skills',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.kiro/'],
    docs: 'https://kiro.dev/docs/skills/',
  },
  {
    id: 'opencode',
    label: 'opencode',
    commandDir: '.opencode/commands',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.opencode/'],
    docs: 'https://opencode.ai/docs/commands/',
  },
  {
    id: 'openhands',
    label: 'OpenHands',
    commandDir: '.agents/skills',
    layout: 'skills',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    howToRun: 'invoked by the agent, or auto-activated via a keyword trigger',
    markers: ['.openhands/', 'AGENTS.md'],
    docs: 'https://docs.openhands.dev/overview/skills',
  },
  {
    id: 'qwen-code',
    label: 'Qwen Code',
    commandDir: '.qwen/commands',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.qwen/', 'QWEN.md'],
    docs: 'https://qwenlm.github.io/qwen-code-docs/en/users/features/commands/',
  },
  {
    id: 'roo-code',
    label: 'Roo Code',
    commandDir: '.roo/commands',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.roo/'],
    docs: 'https://docs.roocode.com/features/slash-commands',
  },
  {
    id: 'tabnine',
    label: 'Tabnine',
    commandDir: '.tabnine/agent/commands',
    layout: 'commands',
    format: 'toml',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.tabnine/', 'TABNINE.md'],
    docs: 'https://docs.tabnine.com/main/getting-started/tabnine-cli/features/commands',
  },
  {
    id: 'trae',
    label: 'Trae (ByteDance)',
    commandDir: '.trae/commands',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.trae/'],
    docs: 'https://docs.trae.ai/ide/slash-commands',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    commandDir: '.windsurf/workflows',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.windsurf/'],
    docs: 'https://docs.devin.ai/windsurf/plugins/cascade/workflows',
  },
  {
    id: 'zed',
    label: 'Zed',
    commandDir: '.agents/skills',
    layout: 'skills',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.zed/', '.rules'],
    docs: 'https://zed.dev/docs/ai/skills',
  },
  {
    // Hermes reads repo-local skills from `<project>/.hermes/skills/` when it is
    // launched inside a checkout, alongside `<project>/.agents/skills/`. That is
    // the right target: project-scoped, and it needs no consent because it stays
    // inside the project.
    //
    // This used to point at `~/.hermes/skills`, which was wrong twice over: on
    // Windows Hermes's home is `%LOCALAPPDATA%\hermes`, so the file landed in a
    // directory Hermes never scans, and it required --global to write outside the
    // project at all. Verified by installing and then loading the generated skill
    // through Hermes itself.
    id: 'hermes',
    label: 'Hermes Agent',
    commandDir: '.hermes/skills',
    layout: 'skills',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['.hermes/'],
    docs: 'https://hermes.nousresearch.com/docs/user-guide/features/skills',
  },
  {
    // The user-level location, for making the commands available in every
    // project. Hermes documents `~/.hermes/skills/` as its source of truth, so
    // this is correct wherever the home directory is the default — but Hermes on
    // Windows resolves its home under %LOCALAPPDATA%, so treat this as the POSIX
    // path until the CLI can resolve the platform-specific home.
    id: 'hermes-global',
    label: 'Hermes Agent (all projects)',
    commandDir: '~/.hermes/skills',
    layout: 'skills',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: ['~/.hermes/'],
    docs: 'https://hermes.nousresearch.com/docs/user-guide/features/skills',
    global: true,
  },
  {
    id: 'generic',
    label: 'Generic (any agent)',
    commandDir: '.planmo/agents/commands',
    layout: 'commands',
    format: 'md',
    prefix: 'planmo',
    invocation: slash,
    markers: [],
    docs: 'https://agentskills.io/specification',
  },
];

/** Look up a target by adapter id; undefined when the agent is unknown. */
export function agentTarget(id: string): AgentTarget | undefined {
  return AGENT_TARGETS.find((target) => target.id === id);
}

/**
 * Every agent that can be detected, i.e. everything with filesystem markers.
 * `generic` has none by design: it is the fallback for an unknown agent.
 */
export const DETECTABLE_TARGETS: readonly AgentTarget[] = AGENT_TARGETS.filter(
  (target) => target.markers.length > 0,
);
