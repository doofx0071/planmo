# CLI Command Surface

Implemented:

- `planmo init [dir]` — create a workspace and compile its planning tree
- `planmo status` — validate and summarize the workspace
- `planmo adopt [dir]` — analyze a repository, then offer to record reports and create the workspace
- `planmo plan "<idea>"` — author `.planmo/plan.yml` with a model, once (ADR-0027)
- `planmo suggest` — read-only, consent-gated codebase suggestions (advisory; upload opt-in)
- `planmo generate` — recompile the planning documents from the project model
- `planmo diff` — show what `generate` would change, writing nothing
- `planmo validate` — validate workspace documents and invariants (the CI gate)
- `planmo doctor` — report environment and workspace health
- `planmo next` — print the next task and the documents to read first
- `planmo task [id]` — record a task's status (interactive without an id)
- `planmo trace [id]` — render the requirements → tasks → tests trace graph
- `planmo handoff` — record the current phase's handoff document (refuses to overwrite one you own)
- `planmo pack` — inspect the pack catalog and reconcile `.planmo/lock.yml`
- `planmo agent init` — detect your coding agent and install command files (guided)
- `planmo agent list` — list supported agents, their directories, and formats
- `planmo provider list` — list runtime provider presets and required API-key environment names
- `planmo setup` — configure one saved default AI profile
- `planmo model [<model-id>]` — change the saved default profile model
- `planmo auth status` — show saved profile credential availability
- `planmo auth remove <profile-id>` — remove a profile and any attached OS keyring credential; leave provider environment variables unchanged
- `planmo agent apply <proposal.json>` — validate and record an agent proposal (ADR-0026)
- `planmo --version` / `planmo --help`

`--help` is the source of truth for implemented commands. `usage.ts` is the
single list the help text is checked against, and
`scripts/e2e-phase12-pilots.mjs` (pilot 7) asserts that it matches.

`planmo pack` reads a catalog only from a local directory of `pack.yml` files
(`--source <dir>`). There is no remote registry and no bundled catalog, so with no
source it says so rather than pretending one exists.

Later:

- `planmo change`
- `planmo upgrade`
- `planmo export github`

## AI profiles and model behavior

`planmo provider list` lists exactly the eight runtime presets — `tokenharbor`,
`openai`, `anthropic`, `deepseek`, `moonshot`, `xai`, `openrouter`, and the
`custom` endpoint profile — with each one's API-key environment name, and says
that OAuth/account-plan sign-in is not supported by this release.
`@planmo/agent-bridge` coding-agent targets are not inference providers and never
appear in this list.

`planmo setup` configures the saved default profile. `--model <id>` supplies a
model id manually and makes no discovery request. Credentials may come from the
provider-named environment variable or a masked prompt saved in the OS keyring.
A nonblank provider environment key takes precedence over a saved keyring key;
the keyring is used only when that variable is blank.

`planmo plan "<idea>"` uses the saved default profile's provider, model, endpoint,
and keyring reference. Without a saved default, it detects a configured provider
from the environment. Explicit `--provider`, `--model`, and `--base-url` flags
override saved fields; explicitly choosing a different provider does not reuse
the saved model, endpoint, or keyring reference. A nonblank environment key for
the selected provider takes precedence over the profile's keyring credential.
`planmo generate` remains model-free and never calls a provider.

`planmo model [<model-id>]` directly saves a supplied id without network access.
With no id, it requires a terminal and requests models only when the default
profile's provider declares a list endpoint and a credential resolves from the
environment or saved keyring; otherwise it falls back to manual entry.
Provider-reported ids are not guaranteed to be PlanMo-compatible. The command
changes only the default profile's model id; use `planmo setup` when no default
profile is configured.

## Codebase suggestions

`planmo suggest` is advisory and read-only. It scans the current repository with
the safe scanner, reads no excluded secret-bearing path (`.env` and its variants,
`.npmrc`, credential directories, private keys and certificates), redacts detected
secret patterns from the content it keeps, and bounds context to an estimated
32,000 input tokens per run and 8,000 per request. It never edits an application
file, never creates or rewrites `.planmo/`, never touches `.planmo/plan.yml`, and
never applies a suggestion.

An interactive run prints the upload size and asks for consent before the first
provider request; a non-TTY run requires `--allow-upload`. `--dry-run` scans
locally and prints the coverage and cost preview without resolving a provider, so
it makes zero provider calls. The validated report goes to stdout by default,
`--json` emits it as JSON, and `--output <path>` writes it through the managed
writer, which refuses to overwrite an existing file. Model output is validated
against the strict report schema and every evidence path and line range is
checked against the real scan; a run that fails writes nothing and exits 1.
Outside a workspace the command exits 3, like `plan`. Coverage may be partial —
scanner caps, binary or oversize files, and the token budget can omit content —
and truncation is reported rather than hidden. Results are suggestions, not
verified defects.

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

`init`, `adopt`, `task` (with no id), `agent init` (with no `--agent`), and
`setup` prompt when required values are missing. `model` with no id requires a
terminal; `auth remove` asks for confirmation unless `--yes` is supplied, and
`suggest` asks for upload consent unless `--allow-upload` is supplied. On a
pipe, CI runner, or redirected stdin, commands that need a prompt fail with exit
1 and explain why instead of waiting forever. Supply required values and use
`--yes` where supported to run non-interactively.
