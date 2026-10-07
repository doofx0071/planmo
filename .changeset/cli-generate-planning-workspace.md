---
'planmo': minor
---

Add `planmo generate`, and make `planmo init` produce the planning workspace.

`init` previously wrote only the three `.planmo/` documents, leaving a workspace with
nothing for an agent to work from. It now also compiles the planning tree
(`planning/ROADMAP.md`, `TRACKER.md`, `STANDARDS.md`, `CONTEXT.md`, `handoffs/TEMPLATE.md`
and `phases/phase-NN.md`) through the same generator that powers regeneration, and records
every artifact in `.planmo/manifest.json` with ownership and lineage.

New command: `planmo generate [--dir <path>] [--dry-run] [--force]` recompiles the planning
documents from the canonical project model. Manifest-owned files are refreshed without
`--force`; unmanaged files are never overwritten.
