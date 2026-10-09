---
'planmo': patch
---

Clarify the `policies/` line in the README's workspace tree.

`planning/policies/` exists only when a pack supplies standards rules, so the
tree now says so rather than implying the folder is always generated. Follows the
generator fix that stopped the generated `planning/README.md` advertising the
folder unconditionally.
