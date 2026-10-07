# PlanMo

**PlanMo** is a CLI-first, agent-native planning system that turns a software idea
or an existing codebase into an execution-ready workspace for AI coding agents and
human engineers.

It is inspired by spec-driven tools such as GitHub Spec Kit, but its scope is
broader: project planning, design-system planning, risk and security planning,
agent-session orchestration, traceability and validation across the project
lifecycle.

- **CLI-first** — the deterministic core runs with no LLM API key and no network.
- **Agent-native** — the repository carries durable project memory; agent
  integrations are adapters over agent-neutral canonical state.
- **Safe by default** — existing repositories are untrusted input, and user-owned
  files are never silently overwritten.

## Install

```bash
npx planmo --version
# or as a project dependency
npm install -D planmo
```

Requires Node.js **>= 24**.

## Quick start

```bash
npx planmo init my-project --yes
npx planmo status --dir my-project
```

`init` writes a canonical workspace:

```text
my-project/.planmo/
├── project.yml     # canonical project model
├── state.yml       # phase/status state
└── manifest.json   # ownership + lineage for every generated file
```

`status` validates that model and summarizes it:

```text
PlanMo workspace: /path/to/my-project
project: my-project (web-application, greenfield, risk=medium)
state: phase=00 status=planned completed=[]
status: HEALTHY
```

## Adopting an existing repository

```bash
npx planmo adopt --dir ./existing-repo
```

`adopt` scans a repository read-only and prints a report. It writes nothing and
never executes project scripts.

## Commands

| Command              | Description                                                 |
| -------------------- | ----------------------------------------------------------- |
| `planmo init [dir]`  | Create a workspace (interactive wizard, or flags + `--yes`) |
| `planmo status`      | Validate and summarize the workspace                        |
| `planmo adopt [dir]` | Analyze an existing repo (dry-run report; writes nothing)   |
| `planmo --version`   | Print the version                                           |
| `planmo --help`      | Show help                                                   |

### `init` options

| Option            | Values                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `--name <name>`   | Project display name (default: directory name)                                                            |
| `--type <type>`   | `web-application` · `cli` · `library` · `service` · `mobile-application` · `desktop-application` · `other` |
| `--lifecycle <v>` | `greenfield` · `brownfield`                                                                               |
| `--risk <v>`      | `low` · `medium` · `high`                                                                                 |
| `--agent <v>`     | `opencode` · `claude-code` · `generic`                                                                    |
| `--style <v>`     | `minimal` · `editorial` · `neobrutalism` · `soft-product` · `dense-dashboard` · `developer-tool` · `luxury` · `playful` |
| `--depth <v>`     | `lean` · `standard` · `production` · `high-assurance` · `custom`                                          |
| `--phase-mode <v>`| `gated` · `continuous`                                                                                    |
| `--yes`           | Accept defaults for anything not provided                                                                 |
| `--dry-run`       | Print the plan and write nothing                                                                          |
| `--force`         | Overwrite existing unmanaged files                                                                        |

`status` and `adopt` take `--dir <path>` (default: walk up from cwd).

### Exit codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| 0    | ok                                                     |
| 1    | error                                                  |
| 2    | collision refused — existing files kept; use `--force` |
| 3    | no project found                                       |

## What v1 ships

The v1 CLI surface is `init`, `status` and `adopt` (plus `--version` / `--help`).
The planning-compiler, generator, workflow, trace, design-engine and agent-bridge
engines are implemented and tested inside the published packages but are **not yet
exposed as CLI commands**. See [ROADMAP.md](ROADMAP.md).

## Packages

| Package                                  | Published | Role                                                             |
| ---------------------------------------- | --------- | ---------------------------------------------------------------- |
| [`planmo`](https://npmjs.com/package/planmo) | ✅        | the CLI                                                          |
| `@planmo/shared`                         | ✅        | shared utilities (CLI runtime closure)                           |
| `@planmo/schema`                         | ✅        | versioned, Zod-validated canonical project model                 |
| `@planmo/core`                           | ✅        | deterministic core: safe writer, planning compiler               |
| `@planmo/scanner`                        | ✅        | repository adoption: safe scanning, prompt-injection isolation   |
| `@planmo/packs`                          | —         | declarative pack loading and deterministic resolution            |
| `@planmo/generator`                      | —         | artifact generation with an ownership manifest                   |
| `@planmo/design-engine`                  | —         | DTCG design tokens, styles, accessibility rules                  |
| `@planmo/agent-bridge`                   | —         | agent adapters and token-budgeted context bundles                |
| `@planmo/adapters`                       | —         | generic / OpenCode / Codex / Claude Code adapters                |
| `@planmo/workflow`                       | —         | phases, task DAG, work packets, leases, gates, handoffs          |
| `@planmo/trace`                          | —         | requirement trace graph, validate, doctor, drift                 |

The CLI runtime closure is published because the build is plain `tsc` with no
bundler — `npm install planmo` must be able to resolve its dependencies.

## Design principles

- AI proposes structured model changes; schema validation gates artifact
  generation. AI never gets unrestricted ownership of the filesystem.
- Generated artifacts are traceable through `.planmo/manifest.json`, with
  ownership classes and lineage.
- Generation supports dry-run and diff before any destructive change.
- Frontend design choices are structured profiles and DTCG tokens, not prose;
  accessibility outranks visual style.
- Canonical project state is agent-neutral; agent integrations are adapters.
- Context and memory are local-first, provenance-bearing and token-budgeted.

## Security

PlanMo reads developer repositories and writes files that influence AI coding
agents, so repository content, AI output, remote packs, paths and Git text are all
treated as untrusted. See [SECURITY.md](SECURITY.md) and
[docs/08-security/](docs/08-security/).

## Repository layout

```text
packages/     12 workspace packages (see the table above)
docs/         product documentation (architecture, CLI, packs, security, ADRs, …)
specs/        example spec files
scripts/      build, boundary and end-to-end verification scripts
.changeset/   release metadata (Changesets)
.github/      CI and release workflows
```

## Documentation

- [`docs/`](docs/) — architecture, CLI, packs, design engine, agent engine,
  workflows, security, testing, engineering, research, ADRs.
- [`docs/12-adrs/`](docs/12-adrs/) — the decision record (ADR-0001 … ADR-0025).
- [`ROADMAP.md`](ROADMAP.md) — what comes after v1.
- [`AGENTS.md`](AGENTS.md) — the contract for contributors and coding agents.
- [`CHANGELOG.md`](CHANGELOG.md) — release history.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). GitHub Flow, Conventional Commits, squash
merge, Changesets for releases.

## License

MIT — see [LICENSE](LICENSE). "PlanMo" is a trademark of the PlanMo maintainers;
the MIT license grants copyright permission only, not trademark rights.
