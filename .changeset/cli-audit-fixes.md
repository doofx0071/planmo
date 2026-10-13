---
'planmo': patch
---

Close the gaps found by running the published CLI against a real repository.

- `--help` works per command. It was ignored below the top level, so `init --help`
  ran the init wizard and `adopt --help` scanned the whole repository before
  prompting. It now prints that command's options and never runs the command.
- An option a command does not accept is a usage error (exit `1`) instead of being
  silently dropped. A typo (`task P00-02 --stauts DONE`) used to discard the flag,
  fall through to the interactive prompt, and never apply the change.
- An interactive command with no terminal fails with exit `1` and a reason.
  `init`, `adopt`, and `task` with no id used to leave the prompt pending, so Node
  exited `13` with an internal "unsettled top-level await" warning that named
  neither the missing terminal nor the way out.
- `init --dry-run` reports the whole write set, including the planning tree it
  compiles in the same run. It listed the three `.planmo/` files and omitted the
  roughly thirty documents the real run writes.
- `status` reports a `planning/tasks.csv` that fails to parse, instead of calling
  the workspace HEALTHY while `validate` called the same workspace FAILED.
- `init` no longer prints "workspace initialized" when every write collided; it
  says the workspace already exists and returns `2`.
- `validate` verifies the sha256 the manifest records for each generated document
  (`VLD-007`), which nothing read back before, and warns when one was edited after
  generation. A warning, not an error: `generate` owns those files.
