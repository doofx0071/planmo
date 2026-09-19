# Agent Engine

PlanMo translates canonical semantics into agent-specific invocation assets.

Core stays agent-neutral.

Capability concept:

```yaml
id: opencode
capabilities:
  commandFiles: true
  skills: true
  subagents: true
  worktrees: true
  directStructuredOutput: true
```

Initial adapters:
- generic
- OpenCode
- Codex
- Claude Code

Do not claim integration support without fixture/contract tests.
