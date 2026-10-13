# CLI Command Surface

Implemented:

- `planmo init [dir]` — create a workspace; compiles the planning tree with it
- `planmo plan "<idea>"` — author `.planmo/plan.yml` with a model, once (ADR-0027)
- `planmo generate` — recompile the planning documents from the project model
- `planmo diff` — show what `generate` would change, writing nothing
- `planmo validate` — validate the workspace documents and invariants (the CI gate)
- `planmo doctor` — report environment and workspace health
- `planmo next` — print the task to work next, and the documents to read first
- `planmo trace [id]` — render the requirements → tasks → tests trace graph
- `planmo handoff` — record the current phase's handoff document (refuses to overwrite one you own)
- `planmo pack` — inspect the pack catalog and reconcile `.planmo/lock.yml`
- `planmo agent init` — detect your coding agent and install command files (guided)
- `planmo agent list` — every supported agent, its directory and its format
- `planmo agent apply <proposal.json>` — validate an agent proposal and record it (ADR-0026)
- `planmo status` — validate and summarize the workspace
- `planmo adopt [dir]` — read-only analysis of an existing repository
- `planmo --version` / `planmo --help`

Not yet wired:

- (none — every command listed above is wired; `planmo plan` ships with the
  `@planmo/ai` engine)

`planmo pack` reads a catalog only from a local directory of `pack.yml` files
(`--source <dir>`). There is no remote registry and no bundled catalog, so with no
source it says so rather than pretending one exists.

Later:

- `planmo change`
- `planmo upgrade`
- `planmo export github`
- direct AI provider commands

`--help` is the source of truth: it lists exactly the implemented commands, and
`scripts/e2e-phase12-pilots.mjs` (pilot 7) asserts that it does.

## Flags

Every command accepts `--help`, which prints that command's options and nothing
else — it never runs the command. `planmo <command> --help` is the reliable way to
learn a command's flags; `usage.ts` is the single list they are checked against.

An option a command does not accept is a usage error (exit 1), never silence.
Flags used to be parsed into a map and ignored when a handler never read them,
which made a typo (`task P00-02 --stauts DONE`) indistinguishable from a
deliberate no-op: the status flag was dropped, the command fell through to its
interactive prompt, and the intended write never happened.

## Interactive commands

`init`, `adopt`, `task` (with no id), and `agent init` (with no `--agent`) prompt
when a value was not supplied on the command line. On a pipe, a CI runner, or a
redirected stdin there is nobody to answer, so each fails with exit 1 and says why
instead of waiting forever. Pass the documented flags — `--yes` accepts the
documented defaults — to run any of them without a terminal.
