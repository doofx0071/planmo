---
'planmo': minor
'@planmo/agent-bridge': patch
---

`planmo trace`, `planmo handoff` and `planmo pack` — and the Hermes target fix
that testing against a real agent found.

**`planmo trace [id]`** renders the requirements → tasks → tests trace graph:

```console
$ planmo trace
TRACE REPORT - trace graph
TRC-002 [warning] P00-01: task P00-01 has no test evidence
...
```

The engine builds and renders the **whole** graph and offers no subgraph
filtering, so an `id` never narrows the output. The command prints a note saying
so and naming the focused node, rather than implying it filtered. Adapting the
engine's real capability is the honest choice; inventing a filter would be worse
than the missing feature.

**`planmo handoff`** records the current phase's handoff from `.planmo/state.yml`
and `planning/tasks.csv` (RFC 4180 parsed; status is field 4, never the last
field) and writes `planning/handoffs/phase-<NN>-handoff.md` through
`writeManaged`, so a handoff **you** own is a collision rather than a silent
overwrite. `--dry-run` prints the document and writes nothing.

`missingForResume` — the engine's own answer to "is this enough to resume from?" —
is reported as a **warning**, not a failure. A phase with no completed tasks yet
genuinely cannot be resumed from, and that is the normal state early in a phase;
exiting non-zero for work that succeeded would be a false failure.

**`planmo pack`** is honest about a gap rather than papering over it. There is no
remote registry and no bundled catalog, so the only source is a local directory
of `pack.yml` files (`--source <dir>`); with none configured it says so:

```console
$ planmo pack
Pack catalog
  No pack catalog source is configured. `planmo pack` resolves packs only from a
  local directory of pack.yml files (--source <dir>); it never fetches from a
  remote registry.
```

Nothing is downloaded and no network call is made.

## Exit code 3 now means what it says

All three adapters threw a **plain** `Error` when `.planmo/` existed but
`project.yml` was unreadable, which lost the `ProjectNotFoundError` type the CLI's
exit-3 mapping depends on — and `pack` wrapped the original error, so it lost the
type on _every_ path. A missing workspace reported exit 1, the code for a generic
error, in a contract callers branch on.

They now share one `WorkspaceNotFoundError extends ProjectNotFoundError`. Caught
by the new E2E check `pack exits 3 without a workspace`, which is exactly the kind
of thing that only a real CLI run finds — the unit tests passed throughout.

## The Hermes fix

`planmo agent init --agent hermes` wrote to `~/.hermes/skills`, which is wrong
twice over: on Windows Hermes's home is `%LOCALAPPDATA%\hermes`, so the file
landed in a directory Hermes never scans, and it demanded `--global` to write
outside the project at all. Hermes reads repo-local skills from
`<project>/.hermes/skills/`, so that is now the target — project-scoped, no
consent needed. `hermes-global` keeps the user-level location for the
all-projects case.

Found by installing the generated skills and then loading one **through Hermes
itself**: `skills_list` discovered all three and `skill_view('planmo-next')`
reported `readiness_status: available`. That also verifies the thing that could
not be checked from inside this repository — that the skill files PlanMo writes
are consumable by a real agent runtime.
