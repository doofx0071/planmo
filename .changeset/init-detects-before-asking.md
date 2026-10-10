---
'planmo': patch
---

`planmo init` now detects the project instead of guessing.

The wizard asked a Next.js repository with 158 files whether it was `greenfield`,
and offered `opencode` as the primary agent on a repo carrying `AGENTS.md` and
`CLAUDE.md`. Both answers were knowable — `adopt` already detects stacks, and agent
detection already reads filesystem markers — so the wizard was asking the user to
supply what PlanMo could work out.

`init` now detects first and prints what it found:

```
init: detecting /path/to/project …
Detected: next, node, react · tests: vitest · agents: claude-code · 158 file(s)
Press Enter to accept the recommended value. Use arrow keys to choose.
```

- **Lifecycle** — `brownfield` when the directory already holds files outside the
  scan excludes, `greenfield` when it is empty.
- **Type** — from the detected stacks. Only unambiguous cases map (`next`/`react`/
  `vue`/`vite` → `web-application`, `express` → `service`); a bare language stack
  could be a CLI, a library or a service, and guessing between them is worse than
  leaving it to the user, who can see the detected stacks in the line above.
- **Primary agent** — from detection, preferring a real agent marker over a bare
  `AGENTS.md`, which is the cross-client convention several agents read rather than
  evidence that one is installed here.

Each menu shows _why_ in its hint (`recommended · detected next, node, react`), and
every value stays overridable. Detection proposes; the user decides.

`planning/` is excluded from the detection scan along with the usual ignores,
because it is PlanMo's own output: without it, running `init` twice in one directory
would see the first run's documents, decide the project had become brownfield, and
write different answers than the first run. Caught by the pilot that asserts `init`
is byte-deterministic.
