---
'planmo': minor
---

Add `planmo validate`, and fix `tasks.csv` so a generated workspace passes it.

`validate` checks a workspace's canonical documents and their cross-document
invariants and exits `1` when the report contains an error, so it can gate CI. It
is a thin adapter over `@planmo/trace`'s validator — no validation logic in the
CLI. Diagnostics carry stable codes (`VLD-001` phase gap, `VLD-002` blocked task
with no row, `VLD-003` handoff next-phase, `VLD-004` document fails schema parse)
and an actionable remediation line.

Fixed: the generated `planning/tasks.csv` had six columns
(`id,phase,title,status,depends_on,acceptance`) while the validator requires
exactly five (`id,phase,title,status,priority`), so a freshly generated workspace
failed its own validator with `VLD-004`. Dependencies and acceptance criteria now
live in `REQUIREMENTS-TRACEABILITY.md` and the phase documents, where they are not
constrained to a fixed column count.

Publishing is now tokenless: all twelve packages exist on the registry and carry a
trusted publisher, so the `NPM_TOKEN` fallback is gone from the release workflow.
Adding a brand-new package will need a bootstrap token again.
