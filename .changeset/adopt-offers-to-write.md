---
'planmo': patch
'@planmo/scanner': patch
---

`planmo adopt` now offers to write what it found, and to create the workspace.

The report ended with a list of "would-be artifacts" and then the command simply
stopped. Nothing was written, and there was no way to write it — the engine planned
the artifact list and the CLI never asked. Running `adopt` and then wondering where
`.planmo/` was is a reasonable thing to do, and it was the command's fault.

`adopt` now ends with two prompts:

```
Write these 4 reports to .planmo/adopt/? [Y/n]
Create the PlanMo workspace here now? [y/N]
```

- The **reports** are the four artifacts the report promised, with real bodies:
  detection summary, injection summary, adoption record, and the plan report. The
  injection summary names the flagged files and their markers — the terminal report
  shows counts only, and "29 files are poisoned" is not actionable without knowing
  which files.
- The **workspace** prompt runs `init`, which is what the user was expecting in the
  first place.
- Writing goes through `writeManaged`, so a file you own is a collision, not a
  silent overwrite.
- `--yes` and `--dry-run` both mean report-only and skip both prompts, so scripts
  and CI keep exactly the behaviour they had before.

`adopt` and `init` also show a progress line while they work, animated on a TTY and
printed once when output is piped — a silent terminal during a long scan is
indistinguishable from a hang.
