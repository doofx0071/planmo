# ADR-0026 — Agent proposals are validated and recorded, never auto-applied

- **Status:** Accepted
- **Date:** 2026-10-08
- **Phase:** Post-v1 (CLI surface completion)
- **Owned tasks:** `planmo agent apply`
- **Extends:** ADR-0020 (agent bridge: capabilities, validation, context bundles), ADR-0022 (workflow/session engine), ADR-0024 (the safe-adoption writable surface)
- **Related:** AGENTS.md ("AI output must be schema-validated before artifact generation"), `docs/02-architecture/agent-command-files.md`

## Context

`planmo agent init` installs a `planmo-propose` command into each of the 31
supported coding agents. That command tells the agent to emit one JSON document
and then tells the user to run:

```
npx planmo agent apply proposal.json
```

Until now that command did not exist, so the instruction was a lie. The question
this ADR answers is what `apply` should actually *do*, because the answer is not
obvious from the word.

`AiProposalSchema` is deliberately loose. An item carries `id`, `status`,
`summary`, optional `rationale` and optional `references`. The schema's own
documentation says:

> Proposed changes are DELTAS, not commands: each item states what should change
> and why. The workflow engine (Phase 08) interprets/approves them; the agent
> bridge never applies them directly.

So an item is free-text intent. There is no machine-applicable field to write into
the plan.

## Decision

### 1. `apply` validates strictly at the bridge boundary, and writes nothing on failure

Validation is `validateProposal` from `@planmo/agent-bridge`, backed by
`AiProposalSchema` with strict objects. A proposal carrying an unknown key is
rejected with the offending field named. **Nothing is partially applied**: an
invalid proposal does not create `.planmo/proposals/`, let alone a file in it.

This is the existing v1 invariant ("AI output must be schema-validated before
artifact generation") applied to a new input path, not a new policy.

### 2. `apply` records the normalised proposal, deterministically

The validated proposal is written to `.planmo/proposals/<slug>.json` through the
safe writer (`writeManaged`), which applies containment, symlink-escape and
collision checks.

- **No timestamp.** Re-applying an unchanged proposal produces byte-identical
  content, so the record is safe to diff and commit, and a repeat is a no-op
  rather than a second copy.
- **The slug comes from the free-text `requestId`.** `requestId` is written by an
  agent and becomes a filename, which is a path-traversal sink. Slugging it to
  `[a-z0-9-]`, capped at 64 chars, makes traversal impossible *by construction*
  rather than by a check that a future edit could drop. The writer's containment
  check is the second guard, not the first.
- **A collision is refused** (`exit 2`) unless `--force`. An existing record is
  the user's or a previous decision; it is never silently replaced.

### 3. `apply` never rewrites the planning documents

This is the load-bearing half of the decision. `apply` does not touch
`planning/tasks.csv`, the phase documents, or any generated artifact.

Rewriting the plan from a free-text `summary` would mean PlanMo inventing an edit
the agent did not specify, and it would put agent output directly into canonical
state — the one thing the bridge exists to prevent. It would also make the plan
unreviewable: the human would see a changed plan with no record of why.

Instead the command prints exactly what it did and did not do:

```
Recorded proposal "Add planmo next to the command surface" from cursor
  .planmo/proposals/add-planmo-next-to-the-command-surface.json

2 item(s):
  cli-next  proposed  Wire the next command.
      ref: REQ-001

Plan documents were NOT rewritten. An item states what should change, not a
mechanical edit, so changing the plan stays a human decision — that is the
invariant that keeps agent output out of canonical state.
```

The loop is therefore closed *at the human boundary*: the agent proposes, PlanMo
validates and records, and a person decides what the plan becomes.

### 4. The record lives in `.planmo/proposals/`, not in the planning tree

The planning tree is generated, manifest-tracked, and validated against a fixed
document set, so an agent-authored file does not belong in it. `.planmo/` is
PlanMo's own state directory.

This is **not** `.planmo/adopt/`, which ADR-0024 reserves for the adoption
scanner's would-be artifacts. Proposals and adoption reports are different
concerns with different lifetimes and are kept apart.

## Consequences

- The `planmo-propose` command installed into every agent is now truthful.
- The propose → validate → record → decide loop is traceable: the record is a
  file, so it can be reviewed, diffed, committed and re-read by a later session.
- `apply` cannot become a remote code path. It reads JSON, validates it, and
  writes one file whose name it derives itself.
- Automatically changing the plan from a proposal remains possible later, but
  requires a schema change first: an item would need a machine-applicable field
  (a target task id and a new status, say). That is deliberately **not** in v1,
  and this ADR is the reason it needs its own decision rather than being added
  quietly to `apply`.

## Alternatives considered

- **Append the proposal to `planning/DECISIONS.md` or `OPEN-QUESTIONS.md`.**
  Rejected: those are accumulating documents the user owns. Appending PlanMo's
  output to them muddies ownership for no gain over a dedicated record.
- **Apply the `summary` text to the plan.** Rejected: free text cannot be applied
  mechanically, and any interpretation would be PlanMo inventing an edit.
- **Validate only, and write nothing.** Rejected: the validation result would be
  lost the moment the terminal scrolled, and the proposal would have to be
  re-supplied every session.
- **Write to `.planmo/adopt/`.** Rejected: ADR-0024 assigns that surface to the
  adoption scanner.
