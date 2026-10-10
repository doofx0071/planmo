# @planmo/agent-bridge

## 1.3.2

### Patch Changes

- Updated dependencies [da9ad6a]
  - @planmo/schema@1.1.0
  - @planmo/core@1.0.4

## 1.3.1

### Patch Changes

- 9fede71: `planmo trace`, `planmo handoff` and `planmo pack` — and the Hermes target fix
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

## 1.3.0

### Minor Changes

- 5666d75: `planmo agent apply` — the other half of the agent loop, so `planmo-propose` is no
  longer a promise the CLI cannot keep.
  
  Since `agent init` shipped, every agent has received a `planmo-propose` command
  ending with _"tell the user to run `npx planmo agent apply proposal.json`, which
  validates it before anything changes."_ That command did not exist.
  
  ```console
  $ planmo agent apply proposal.json
  ✓ wrote .planmo/proposals/add-planmo-next-to-the-command-surface.json
  Recorded proposal "Add planmo next to the command surface" from cursor
  
  2 item(s):
    cli-next  proposed  Wire the next command.
        ref: REQ-001
    docs  proposed  Document it in the README.
        why: Users cannot find it.
  
  Plan documents were NOT rewritten. An item states what should change, not a
  mechanical edit, so changing the plan stays a human decision — that is the
  invariant that keeps agent output out of canonical state.
  ```
  
  **`apply` validates and records; it never rewrites the plan.** `AiProposalSchema`
  is deliberately loose — an item is `{ id, status, summary, rationale?, references? }`
  — and its own documentation says items are deltas the workflow engine interprets
  and the agent bridge never applies directly. Rewriting the plan from a free-text
  summary would mean PlanMo inventing an edit the agent never specified, and would
  put agent output straight into canonical state. ADR-0026 records the decision and
  the alternatives that were rejected.
  
  What it does do, and does strictly:
  
  - **Validates at the bridge boundary** with the existing strict schema. An unknown
    key is rejected naming the field, and **nothing partial is written** — not even
    the proposals directory.
  - **Records the normalised proposal** at `.planmo/proposals/<slug>.json` through
    the safe writer. No timestamp, so the record is deterministic, safe to diff and
    commit, and re-applying an unchanged proposal is a no-op.
  - **Slugs the free-text `requestId`** to `[a-z0-9-]`, capped at 64 characters.
    `requestId` is written by an agent and becomes a filename, so this is a
    path-traversal sink; slugging makes traversal impossible _by construction_
    rather than by a check a later edit could drop. The writer's containment check
    is the second guard, not the first.
  - **Refuses a collision** rather than replacing an existing record (`--force` to
    replace), and returns `2`, keeping the documented exit contract.
  
  The record lives in `.planmo/proposals/` rather than the planning tree, which is
  generated, manifest-tracked and validated against a fixed document set. It is
  deliberately not `.planmo/adopt/`, which ADR-0024 reserves for the adoption
  scanner.
  
  `@planmo/agent-bridge` gains `proposalSlug`, `proposalRecordPath`,
  `renderProposalRecord` and `PROPOSALS_DIR` — all pure, so the naming rules are
  testable without a filesystem.

## 1.2.0

### Minor Changes

- 2356d99: Support 31 coding agents, up from 6 — and support the two formats and two layouts
  they actually use.
  
  `planmo agent list` now covers Amazon Q Developer, Amp, Augment, Claude Code,
  Cline, CodeBuddy, Codex, Command Code, Continue, Copilot, Crush, Cursor, Factory
  Droid, Gemini CLI, Goose, Grok CLI, iFlow, Junie, Kilo Code, Kimi Code CLI, Kiro,
  opencode, OpenHands, Qwen Code, Roo Code, Tabnine, Trae, Windsurf, Zed, Hermes and
  a `generic` fallback.
  
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

## 1.1.0

### Minor Changes

- 47fc9e8: Add `planmo agent init` — install PlanMo command files into your own coding agent.
  
  PlanMo never holds an LLM key. The agent you already run does the AI; PlanMo
  installs the commands that tell it what to do, exactly as GitHub's spec-kit does.
  
  ```
  $ planmo agent init --agent opencode
  ✓ wrote .opencode/commands/planmo-next.md
  ✓ wrote .opencode/commands/planmo-status.md
  ✓ wrote .opencode/commands/planmo-propose.md
  Installed for opencode. Invoke in your agent with:
    /planmo-next
    /planmo-status
    /planmo-propose
  ```
  
  Supported targets, each with its own documented layout: `opencode`
  (`.opencode/commands/<name>.md`), `claude-code` (`.claude/skills/<name>/SKILL.md`),
  `codex` (`.agents/skills/<name>/SKILL.md`, invoked `$planmo-next`), `copilot`
  (`.github/skills/<name>/SKILL.md`), `generic` (`.planmo/agents/commands/`), and
  `hermes` (`~/.hermes/skills/`, global — refused unless `--global` is passed,
  because generation never writes outside the project root without consent).
  
  The templates tell the agent to **run the CLI** — `npx planmo next --print`,
  `npx planmo validate` — rather than write plan documents itself, so PlanMo still
  owns every generated byte and the output stays deterministic.
  
  Refresh safety works like spec-kit's upgrade: a file PlanMo wrote and you have not
  touched is simply current, so re-running is a clean no-op; a file whose bytes
  differ is yours and is reported as a collision unless `--force` is passed.
  
  `@planmo/agent-bridge` gains the target table, the templates and the renderer
  (`agent-targets.ts`, `agent-templates.ts`, `agent-files.ts`) as data, so adding an
  agent is one row rather than an architecture change. The CLI gains a runtime
  dependency on `@planmo/agent-bridge`, `@planmo/adapters` and `@planmo/workflow`,
  and the package boundary graph is extended to allow them.

## 1.0.1

### Patch Changes

- Updated dependencies [47d5859]
  - @planmo/shared@1.1.0
  - @planmo/adapters@1.0.1
  - @planmo/core@1.0.3
  - @planmo/schema@1.0.3

## 0.0.3

### Patch Changes

- Updated dependencies [5473462]
  - @planmo/shared@1.0.2
  - @planmo/schema@1.0.2
  - @planmo/core@1.0.2
  - @planmo/adapters@0.0.2

## 0.0.2

### Patch Changes

- Updated dependencies [15dcca6]
  - @planmo/shared@1.0.1
  - @planmo/schema@1.0.1
  - @planmo/core@1.0.1
  - @planmo/adapters@0.0.1

## 0.0.1

### Patch Changes

- Updated dependencies [5ac4068]
  - @planmo/schema@1.0.0
  - @planmo/core@1.0.0
