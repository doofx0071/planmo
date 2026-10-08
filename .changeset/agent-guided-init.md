---
'planmo': minor
---

`planmo agent init` now detects your coding agent and asks you, instead of needing
`--agent` typed out.

```console
$ planmo agent init

Detected in this project:
  opencode (already installed) — .opencode/, .opencode/commands/planmo-next.md
  claude-code (detected) — CLAUDE.md

◆  Which agent(s) should PlanMo install commands for?
│  ◼ opencode        .opencode/commands
│  ◻ claude-code     .claude/skills
│  ◻ codex           .agents/skills
│  ◻ copilot         .github/skills
│  ◻ hermes          ~/.hermes/skills (global)
│  ◻ generic         .planmo/agents/commands
└
◆  Install 1 command set(s) now? (Y/n)
```

Detection reads **filesystem markers only** — never the network, never an
environment variable — so it is identical on every run, and the evidence is shown
next to each agent so a wrong guess is visible and can be unticked. Markers:
`.opencode/`, `.claude/` or `CLAUDE.md`, `.codex/` or `AGENTS.md`,
`.github/copilot-instructions.md`, and `~/.hermes/` for Hermes. A file PlanMo has
already installed is the strongest signal and is reported as `already installed`.
`PLANMO_HOME` overrides the home directory used for the Hermes marker, so
detection stays deterministic in CI and sandboxes.

Interactive selection is offered only on a real terminal. Everywhere else the
behaviour is unchanged and scriptable:

- `--agent <id>` (still the documented flag, comma-separated for several) skips
  detection and every prompt.
- `--yes` never prompts: detection decides, or the command errors telling you to
  pass `--agent`.
- With no terminal, no flag and markers present, detection decides and says so.
- A **global** target (`hermes`) is never auto-installed: it writes outside the
  project, so it needs the explicit `--global`. In the guided flow it asks first.

The guided flow adds one runtime dependency, `@clack/prompts`, for arrow-key
select and multi-select. The existing `WizardIO` is extended with
`select`/`multiSelect`/`confirm` rather than growing a second prompt mechanism,
and those three return `undefined` on cancel so every caller must decide what
cancelling means — here, writing nothing.
