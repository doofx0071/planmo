---
'@planmo/agent-bridge': minor
'planmo': minor
---

Support 30 coding agents, up from 6 — and support the two formats and two layouts
they actually use.

`planmo agent list` now covers Amazon Q Developer, Amp, Augment, Claude Code,
Cline, CodeBuddy, Codex, Continue, Copilot, Crush, Cursor, Factory Droid, Gemini
CLI, Goose, Grok CLI, iFlow, Junie, Kilo Code, Kimi Code CLI, Kiro, opencode,
OpenHands, Qwen Code, Roo Code, Tabnine, Trae, Windsurf, Zed, Hermes and a
`generic` fallback.

Every row records the official documentation URL it was read from, so a format can
be re-checked against the source rather than a memory of it. The full table is in
`docs/02-architecture/agent-command-files.md`.

Two things were needed beyond more rows:

**A second file format.** Gemini CLI, Tabnine and iFlow take **TOML** commands
(`description` + a required `prompt`), not markdown. The body is emitted as a TOML
literal multi-line string so markdown backticks and backslashes survive verbatim.

**Detection moved into the table.** Markers used to be a separate map in
`detect.ts`; they are now a field on each target, so adding an agent really is one
row. `AGENTS.md` is deliberately shared by `amp`, `codex` and `openhands`, and
detection reports all three rather than guessing which one is meant.

`.agents/skills/` is the cross-client convention from the Agent Skills standard
(agentskills.io), not any one vendor's directory — several agents read it in
addition to their own, so six rows point at it. Installing for two of those is
idempotent rather than a double write, and a test pins that this is the only
shared directory.

Deliberately absent: **aider**, which has no user-defined command mechanism (its
closest equivalent is the user's own `CONVENTIONS.md`, which PlanMo will not
write). `docs/02-architecture/agent-command-files.md` records that and the other
known gaps rather than shipping a row that cannot work.
