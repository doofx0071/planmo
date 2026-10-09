---
'@planmo/generator': patch
---

Stop the generated `planning/README.md` advertising a `policies/` folder that was
never written.

Every generated workspace ships a `planning/README.md` whose folder table listed:

```
| `policies/` | one document per standard class in use |
```

That row was hardcoded. The folder itself is conditional — a policy document is
emitted only for a standard class that actually has rules, which needs a pack
selected. A default project selects none (`packs: []`), so **no project ever got a
`policies/` directory**, and the generated README pointed at a folder that was not
there. The table now reads "Only the folders that were actually generated are
listed."

The fix is one predicate, `policyClassesInUse(ir)`, used by both the policy
renderer and the README. Deriving the row from the same condition that decides
whether the folder exists is what stops the two drifting again; the test asserts
the general invariant — every folder the README advertises must contain a document
some renderer actually emits — rather than just this one row.

That invariant is worth having: writing it immediately caught that the README
describes the output of **three** renderers (the phase spine, the planning
workspace, and the standards/policy set), which is exactly the kind of thing a
hand-maintained table gets wrong.

Goldens regenerated: `planning/README.md` only, for the three fixture levels. The
`policies/` row is retained in the goldens because the fixture projects do select
packs, so the folder is genuinely generated for them.
