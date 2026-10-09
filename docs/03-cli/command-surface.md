# CLI Command Surface

Implemented:

- `planmo init [dir]` — create a workspace; compiles the planning tree with it
- `planmo generate` — recompile the planning documents from the project model
- `planmo diff` — show what `generate` would change, writing nothing
- `planmo validate` — validate the workspace documents and invariants (the CI gate)
- `planmo doctor` — report environment and workspace health
- `planmo next` — print the task to work next, and the documents to read first
- `planmo agent init` — detect your coding agent and install command files (guided)
- `planmo agent list` — every supported agent, its directory and its format
- `planmo agent apply <proposal.json>` — validate an agent proposal and record it (ADR-0026)
- `planmo status` — validate and summarize the workspace
- `planmo adopt [dir]` — read-only analysis of an existing repository
- `planmo --version` / `planmo --help`

Not yet wired (the engines exist in the packages; see `ROADMAP.md`):

- `planmo plan`
- `planmo doctor`
- `planmo trace <id>`
- `planmo handoff`
- `planmo diff`
- `planmo pack ...`

Later:

- `planmo change`
- `planmo upgrade`
- `planmo export github`
- direct AI provider commands

`--help` is the source of truth: it lists exactly the implemented commands, and
`scripts/e2e-phase12-pilots.mjs` (pilot 7) asserts that it does.
