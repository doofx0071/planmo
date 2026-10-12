# Wizard and agent-experience roadmap (post-v1)

Stage 7 of the reliability pass. These are **specified, not implemented**: the
prompt is explicit that they must not expand the bug-fix scope. Each item is sized
to land as its own well-scoped change with its own tests. Priority is P2 (should
have) or P3 (nice to have); none blocks reliability.

Status values: `PROPOSED` · `IN PROGRESS` · `DONE` · `DROPPED`.

| ID | Item | Priority | Status |
| -- | ---- | -------- | ------ |
| W-01 | Guided project-purpose selection | P2 | PROPOSED |
| W-02 | Existing-repository selection in `init` | P2 | PROPOSED |
| W-03 | Compatible stack matrix | P2 | PROPOSED |
| W-04 | Version-aware prerequisite validation | P2 | PROPOSED |
| W-05 | Planning-depth profiles and optional modules | P3 | PROPOSED |
| W-06 | Design direction and token presets in the wizard | P3 | PROPOSED |
| W-07 | Plan/file preview and diff before writing | P2 | PROPOSED |
| W-08 | Safe continuation and recovery after interruption | P2 | PROPOSED |
| W-09 | Context-efficient agent execution packets | P3 | PROPOSED |
| W-10 | Provider-independent agent adapter contract | P3 | PROPOSED |
| W-11 | Evidence that distinguishes proposed / executed / verified | P2 | PROPOSED |
| W-12 | Stronger handoff and resume validation | P2 | PROPOSED |
| W-13 | Plugin/package compatibility reporting | P3 | PROPOSED |

## W-01 — Guided project-purpose selection (P2)

The wizard currently asks for name/type/lifecycle/risk/agent. Add an optional
first step that asks what the project is *for* and derives a suggested type,
lifecycle and depth.

**Acceptance:** `init --yes` is unchanged; the guided flow asks one purpose
question and shows the derived answers as defaults; a non-interactive run never
prompts.

## W-02 — Existing-repository selection (P2)

Let `init` detect that the target is an existing repository and offer `adopt`
semantics (brownfield lifecycle) instead of scaffolding over it.

**Acceptance:** pointing `init` at a non-empty repo with `--yes` never overwrites
tracked files; the flow records `lifecycle: brownfield` and a detection summary.

## W-03 — Compatible stack matrix (P2)

A declarative matrix of frontend/backend/database/auth/storage/deployment/tooling
choices, each with a compatibility rule, feeding `stack` in `project.yml`.

**Acceptance:** an incompatible combination is rejected with a named reason;
`stack` round-trips through the schema; no stack choice implies executing project
code.

## W-04 — Version-aware prerequisite validation (P2)

Validate the toolchain the chosen stack needs (Node major, package manager,
optional services) before writing, reusing `planmo doctor`'s version band.

**Acceptance:** a missing prerequisite is reported before any file is written, and
`doctor` agrees with the wizard's verdict.

## W-05 — Planning-depth profiles and optional modules (P3)

Expose `--depth` presets as explainable bundles and let optional phases be
included/excluded without editing `tasks.csv` by hand.

**Acceptance:** the generated spine matches the declared depth; excluding a phase
is recorded as a decision, not a silent omission.

## W-06 — Design direction and token presets (P3)

Wire the existing design-engine styles/densities into the wizard as presets.

**Acceptance:** the chosen preset appears in `project.yml` `design` and in the
generated design docs; accessibility level is always explicit.

## W-07 — Plan/file preview and diff before writing (P2)

Show the full file list and a diff before `init`/`generate` write, reusing the
existing dry-run/diff engine.

**Acceptance:** the preview is byte-accurate against what a real run writes;
cancelling writes nothing.

## W-08 — Safe continuation and recovery after interruption (P2)

Detect a partially written workspace and offer to resume or repair rather than
re-running from scratch.

**Acceptance:** an interrupted write leaves a recoverable, correctly reported
state (the managed writer's atomic temp+rename already guarantees no torn file);
the resume path is covered by a test that kills the run mid-write.

## W-09 — Context-efficient agent execution packets (P3)

Surface the agent-bridge's token-budgeted context bundle through a CLI command so
an agent can load exactly what a task needs.

**Acceptance:** the packet is deterministic for identical inputs and its size is
reported; no repository text is treated as instruction.

## W-10 — Provider-independent agent adapter contract (P3)

Formalize the adapter interface (target detection, install layout, command-file
format) so new agents are data, not code.

**Acceptance:** adding an agent requires no change to the router; the generic
adapter still works with no agent present.

## W-11 — Evidence that distinguishes proposed / executed / verified (P2)

The evidence CSV records a result per task; add a status vocabulary that separates
what an agent *proposed* from what was *executed* and what was *verified*.

**Acceptance:** `validate`/`trace` treat only `verified` evidence as satisfying a
required task; a `proposed` row is visible but never counts as done.

## W-12 — Stronger handoff and resume validation (P2)

Validate that a handoff names the next phase, references existing files, and
carries the state the next session needs; refuse to overwrite one the user edited
(already the case) and warn when it is stale.

**Acceptance:** `validate` flags a handoff whose next-phase pointer disagrees with
`state.yml`.

## W-13 — Plugin/package compatibility reporting (P3)

Report the pack/plugin versions a workspace was generated with and warn when they
drift from the installed CLI.

**Acceptance:** the lockfile records versions; a drift produces an actionable
message, never a silent regeneration.
