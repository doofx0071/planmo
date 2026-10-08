---
'@planmo/agent-bridge': minor
'planmo': minor
---

`planmo agent apply` — the other half of the agent loop, so `planmo-propose` is no
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
