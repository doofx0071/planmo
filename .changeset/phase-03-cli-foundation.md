---
'@planmo/core': patch
'@planmo/cli': patch
---

Phase 03 CLI foundation:

- `@planmo/core` gains the managed file writer (root containment, symlink
  safety, collision refusal, atomic temp+rename, sha256 checksums,
  dry-run/diff), safe path utilities, `init` workspace generation, and
  read-only `status` introspection.
- `@planmo/cli` wires real `planmo init` (wizard with `--yes`, `--dry-run`,
  `--force`) and `planmo status` commands over the core engine.
