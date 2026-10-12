---
'planmo': patch
---

Reliability pass over the CLI and its tests.

- `doctor`: the Node version band is injectable, so the suite is green on any Node
  the project permits (>= 24) instead of only on the CI's LTS line.
- `generate`/`diff`/`validate`/`doctor`: a broken workspace now maps to exit `1`
  instead of masquerading as "no project found" (`3`); only a genuine
  `ProjectNotFoundError` returns `3`.
- `task`: fails fast with usage when a prompt would be needed but stdin is not a
  terminal, instead of hanging on a prompt that can never be answered.
- The CLI's input/output and interactive-prompt layer (`CliIO`, `WizardIO`,
  `parseArgs`, `terminalWizard`) moved to `src/cli-io.ts`; no behavior change.
