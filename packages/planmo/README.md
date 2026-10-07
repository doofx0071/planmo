# planmo

**PlanMo** — CLI-first, agent-native project planning and execution workspace
generator. Turns an idea or an existing repository into a structured, agent-ready
project workspace: a canonical project model, generated planning docs, and an
ownership manifest — deterministically, with no LLM API key required.

## Install

```bash
npx planmo --version
# or, as a project dependency
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

| Command               | Description                                               |
| --------------------- | --------------------------------------------------------- |
| `planmo init [dir]`   | Create a workspace (interactive wizard, or flags + `--yes`) |
| `planmo status`       | Validate and summarize the workspace                      |
| `planmo adopt [dir]`  | Analyze an existing repo (dry-run report; writes nothing) |
| `planmo --version`    | Print the version                                         |
| `planmo --help`       | Show help                                                 |

### init options

| Option                | Values                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `--name <name>`       | Project display name (default: directory name)                                                      |
| `--type <type>`       | `web-application` · `cli` · `library` · `service` · `mobile-application` · `desktop-application` · `other` |
| `--lifecycle <v>`     | `greenfield` · `brownfield`                                                                         |
| `--risk <v>`          | `low` · `medium` · `high`                                                                           |
| `--agent <v>`         | `opencode` · `claude-code` · `generic`                                                              |
| `--style <v>`         | `minimal` · `editorial` · `neobrutalism` · `soft-product` · `dense-dashboard` · `developer-tool` · `luxury` · `playful` |
| `--depth <v>`         | `lean` · `standard` · `production` · `high-assurance` · `custom`                                    |
| `--phase-mode <v>`    | `gated` · `continuous`                                                                              |
| `--yes`               | Accept defaults for anything not provided                                                           |
| `--dry-run`           | Print the plan and write nothing                                                                    |
| `--force`             | Overwrite existing unmanaged files                                                                  |

`status` and `adopt` take `--dir <path>` (default: walk up from cwd).

## Exit codes

| Code | Meaning                                                    |
| ---- | ---------------------------------------------------------- |
| 0    | ok                                                         |
| 1    | error                                                      |
| 2    | collision refused — existing files kept; use `--force`     |
| 3    | no project found                                           |

## Safety

- User-owned files are never silently overwritten: a collision exits `2` unless
  you pass `--force`.
- `--dry-run` prints the plan and writes nothing.
- Every generated file is tracked in `.planmo/manifest.json`.
- Scanning an existing repository does not execute its scripts.

## Deterministic by design

The same PlanMo version, normalized model, locked packs and options produce
equivalent output. The core needs no API key and no network access.

## Status (v1)

The v1 CLI surface is `init`, `status` and `adopt`. The planning-compiler,
generator and workflow engines ship inside the published packages but are not yet
exposed as CLI commands; they arrive in a later release.

## Links

- Repository: https://github.com/doofx0071/planmo
- Issues: https://github.com/doofx0071/planmo/issues
- License: MIT
