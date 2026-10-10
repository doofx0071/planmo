# ADR-0027 — AI authors the plan once; the compiler stays deterministic

Status: Accepted
Date: 2026-10-10

## Context

PlanMo's entire engineering discipline rests on deterministic, byte-stable output:
golden fixtures that pin every generated document, an `inputHash` over canonical
inputs, and a `generate` command that must produce identical bytes for identical
inputs. That is what makes a generated workspace reviewable, diffable and safe to
regenerate.

The product also needs a model in the loop: turning an idea into a project-specific
phase spine and task criteria is exactly the work a deterministic template cannot
do, and the seeded four-workstreams-per-phase tasks are an honest floor rather than
a plan.

Those two requirements are in direct tension. A model call inside `generate` would
make output nondeterministic, break every golden, make `inputHash` meaningless, and
make regeneration unsafe.

## Decision

**The model authors the plan once, and its output is pinned as a canonical
document. The compiler never calls a model.**

```
planmo plan "<idea>"   →  model proposes  →  validated  →  .planmo/plan.yml   (once)
planmo generate        →  compiles project.yml + plan.yml                     (always)
```

Concretely:

1. `planmo plan` calls a provider exactly once, validates the result against
   `PlanDocument` (shape) and `validatePlanDocument` (cross-field rules), and writes
   `.planmo/plan.yml` through `writeManaged`.
2. `plan.yml` is a canonical, versioned, strict document — the same class of
   artifact as `project.yml` and `state.yml`.
3. `generate` reads `plan.yml` when it exists and compiles from it. It performs no
   network access and no model call.
4. A plan **augments** the canonical spine rather than replacing it: with a plan,
   its phases and tasks are the project's; without one, the canonical spine and the
   seeded tasks stand exactly as before.

## Consequences

**Good.**

- The determinism discipline survives intact: goldens, `inputHash` and reproducible
  regeneration all still hold, because a plan is an *input*, not a side effect.
- Every workspace generated before this feature, and every golden fixture, is
  byte-identical. Adoption is opt-in and non-breaking.
- The plan is a reviewable artifact. A person can read, diff and reject it — which
  is impossible when a model's reasoning is buried in a command's execution.
- A failed generation cannot destroy the last valid plan: validation happens before
  any write, and a refused overwrite is a collision rather than a silent overwrite.
- A broken or hand-mangled `plan.yml` degrades to the canonical spine instead of
  producing a broken workspace.

**Costs and constraints.**

- The plan is a snapshot. Changing requirements means re-running `planmo plan`
  (incremental refinement is a later, separate step).
- `PlanTask.requirements` is not copied into `tasks.csv`; the plan document remains
  the single home for requirement references, so they cannot drift between two
  files.
- `generatedAt` is `null` in the document, enforced by the schema. A timestamp would
  make two identical plans differ byte-for-byte. Provenance about *when* belongs in
  the manifest.
- The plan is included in the `inputHash` **only when one exists**, so a project
  without a plan does not report as out of date merely because this feature landed.

## Alternatives considered

- **Call the model from `generate`.** Rejected: destroys determinism, breaks every
  golden, makes regeneration unsafe, and puts a nondeterministic step in the path
  that CI gates on.
- **Pass a JSON Schema to the provider and trust it.** Rejected: a wire-level schema
  is a second copy of the plan's shape, living in a prompt and drifting from
  `PlanDocument`. A drifted schema the model is *given* is worse than none, because
  it teaches the model the wrong shape. The zod schema is the single source of truth
  and the fail-closed gate.
- **Store the plan in the workspace tree (`planning/`) rather than `.planmo/`.**
  Rejected: `.planmo/` holds canonical machine state (`project.yml`, `state.yml`,
  `manifest.json`); `planning/` holds the human-facing documents derived from it. A
  plan is an input, so it belongs with the inputs.

## Related

- ADR-0019 — deterministic planning compiler and generation manifest
- ADR-0026 — agent proposals are validated and recorded, never auto-applied
- ADR-0011 — strict, versioned schemas
- `docs/03-cli/command-surface.md`
