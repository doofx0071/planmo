# Agent command files

PlanMo installs command files into whichever AI coding agent you already run. It
holds no LLM key: the agent does the AI, PlanMo writes the files that tell it what
to do. This document is the record of **where** each agent looks and **how** the
user invokes the result, so the table can be re-checked against the source rather
than against a memory of it.

The machine-readable source of truth is
`packages/agent-bridge/src/agent-targets.ts`. `agent-targets.test.ts` pins every
value here, so a third-party format drifting shows up as a failing test rather
than a silently broken command. Each row in the code carries the official
documentation URL it was verified against.

## Two layouts, two formats

- **`commands`** — one flat file per command, named after the command:
  `<dir>/planmo-next.md`.
- **`skills`** — one directory per command containing `SKILL.md`:
  `<dir>/planmo-next/SKILL.md`. The `name` field in the frontmatter **must equal
  the directory name**; this is enforced by a test.
- **`md`** — YAML frontmatter, then a markdown body.
- **`toml`** — `description` plus a `prompt` (the required field), per Gemini CLI,
  Tabnine and iFlow, which all three use the same shape. The body is emitted as a
  TOML literal multi-line string (`'''`), which performs no escape processing, so
  markdown backticks and backslashes survive verbatim.

## Supported agents

| id | Agent | Directory | Layout | Format | Invoke |
| --- | --- | --- | --- | --- | --- |
| `amazon-q` | Amazon Q Developer | `.amazonq/prompts` | commands | md | `@name` |
| `amp` | Amp (Sourcegraph) | `.agents/skills` | skills | md | palette → `skill: invoke` |
| `augment` | Augment Code | `.augment/commands` | commands | md | `/name` |
| `claude-code` | Claude Code | `.claude/skills` | skills | md | `/name` |
| `cline` | Cline | `.clinerules/workflows` | commands | md | `/name.md` |
| `codebuddy` | CodeBuddy (Tencent) | `.codebuddy/commands` | commands | md | `/name` |
| `codex` | Codex (OpenAI) | `.agents/skills` | skills | md | `$name` |
| `commandcode` | Command Code | `.commandcode/commands` | commands | md | `/name` |
| `continue` | Continue | `.continue/prompts` | commands | md | `/name` |
| `copilot` | GitHub Copilot | `.github/skills` | skills | md | `/name` |
| `crush` | Crush (Charm) | `.crush/commands` | commands | md | palette → User Commands |
| `cursor` | Cursor | `.cursor/skills` | skills | md | `/name` |
| `factory-droid` | Factory Droid | `.factory/commands` | commands | md | `/name` |
| `gemini-cli` | Gemini CLI (Google) | `.gemini/commands` | commands | **toml** | `/name` |
| `goose` | Goose (Block) | `.agents/skills` | skills | md | `/name` |
| `grok` | Grok CLI (xAI) | `.grok/skills` | skills | md | `/name` |
| `iflow` | iFlow CLI | `.iflow/commands` | commands | **toml** | `/name` |
| `junie` | JetBrains Junie | `.junie/commands` | commands | md | `/name` |
| `kilo-code` | Kilo Code | `.kilo/commands` | commands | md | `/name` |
| `kimi` | Kimi Code CLI (Moonshot) | `.kimi-code/skills` | skills | md | `/name` |
| `kiro` | Kiro (AWS) | `.kiro/skills` | skills | md | `/name` |
| `opencode` | opencode | `.opencode/commands` | commands | md | `/name` |
| `openhands` | OpenHands | `.agents/skills` | skills | md | agent-invoked |
| `qwen-code` | Qwen Code | `.qwen/commands` | commands | md | `/name` |
| `roo-code` | Roo Code | `.roo/commands` | commands | md | `/name` |
| `tabnine` | Tabnine | `.tabnine/agent/commands` | commands | **toml** | `/name` |
| `trae` | Trae (ByteDance) | `.trae/commands` | commands | md | `/name` |
| `windsurf` | Windsurf | `.windsurf/workflows` | commands | md | `/name` |
| `zed` | Zed | `.agents/skills` | skills | md | `/name` |
| `hermes` | Hermes Agent | `~/.hermes/skills` | skills | md | `/name` |
| `generic` | Generic (any agent) | `.planmo/agents/commands` | commands | md | `/name` |

`generic` is the fallback: it always works, and is the right choice for an agent
without a documented location.

## `.agents/skills` is shared, on purpose

`.agents/skills/` is the cross-client convention published by the Agent Skills
standard (agentskills.io). It is not any one vendor's directory — several agents
read it *in addition to* their own. That is why six rows point at it.

Installing for two of those is **idempotent, not a double write**: the second
target sees files that already match and writes nothing. Detection reports all of
them as `already installed`, which is accurate.

## Detection

Each row carries `markers` — the filesystem evidence that the agent is used in a
project. Detection reads these and nothing else (never the network, never an
environment variable), so the result is identical on every run, and the evidence
is printed next to each agent so a wrong guess is visible and can be unticked.

`AGENTS.md` is the one deliberately shared marker: `amp`, `codex` and `openhands`
all read it, so detection reports all three rather than guessing which is meant.
`generic` has no markers by design.

`hermes` is the only **global** target — it writes to `~/.hermes/skills`, outside
the project, so it needs an explicit `--global` (or a confirmation in the guided
flow). Everything else stays inside the project root.

## Known gaps

- **aider** has no user-defined command mechanism. Its closest equivalent is a
  read-only `CONVENTIONS.md` at the project root loaded with `/read`, which is the
  user's own file — PlanMo will not write it. So aider is deliberately absent
  rather than present-but-broken. Use `generic` if you want the files anyway.
- **Tabnine's CLI is in maintenance mode** (deprecated 2026-12-31); it is
  migrating users to a plugin for opencode, which uses opencode's own convention.
- **Cursor removed its dedicated commands directory** in favour of skills. The
  legacy flat `.cursor/commands/<name>.md` still works in the product, but its
  documentation page is gone, so the skills layout is what PlanMo targets.
- **Trae's CLI** is a separate product using `.traecli/commands/`; the row above
  targets the IDE.
