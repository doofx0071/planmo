---
'@planmo/generator': patch
---

Stop doubling the full stop after a phase objective.

Objectives are already full sentences ending in a period, and the phase document
and roadmap appended another one — `phase-03.md` read "Implement init, safe
filesystem writer, dry-run/diff, ownership rules, status..". Both now use a
`sentence()` helper that adds a full stop only when the text lacks one.
