---
'@planmo/generator': patch
---

Use the phase objective verbatim as the first task title.

Phase objectives are already imperative sentences — "Implement init, safe
filesystem writer, dry-run/diff, ownership rules, status." — so prefixing them
with "Implement " produced titles like "Implement Implement init, safe filesystem
writer…" in `planning/tasks.csv` and in every phase document's task table.
