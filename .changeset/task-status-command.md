---
'planmo': minor
'@planmo/generator': minor
---

Add `planmo task` — record a task's status, and make it survive regeneration.

The plan could not advance past its first task. `planning/tasks.csv` is a
**generated** document, so hand-editing the status column is silently undone by the
next `planmo generate` — verified, not assumed: append a status, regenerate, watch it
revert. Every agent run reported the same wall, and the only remedy on offer was an
edit that does not persist.

**The durable home already existed and was never wired up.** `.planmo/state.yml`
has carried a `tasks` map since the state document was defined:

```ts
tasks: z.record(NonEmptyString, z.enum(TASK_STATUSES)).optional(),
```

Nothing read it and nothing wrote it. So:

```
$ planmo task P00-01 --status DONE
P00-01: TODO → DONE
Recorded in .planmo/state.yml — regeneration preserves it.
```

- Status is recorded in state.yml and **survives regeneration** (tested).
- The generator merges it over the generated default in `tasksForPhase` — the single
  place task status is decided — so `tasks.csv`, `TRACKER.md` and the phase documents
  cannot disagree.
- `planmo task` with no arguments is interactive: pick a task, then a status, with
  DONE recommended and listed first.
- `--dry-run` reports the change and writes nothing; an unknown id or status is an
  error, never a guess.

Status is progress, not a planning input, so it is deliberately **not** part of
`inputHash`: marking a task done must not make the workspace report as out of date.

Two smaller fixes from the same run:

- **Global installs now print where they actually go.** `hermes` and
  `hermes-global` both printed `✓ wrote .hermes/skills/…` — identical lines for two
  destinations, one of which leaves the repository. The global one now shows `~/`.
- **The brief says what `validate` checks.** It ended with "run `planmo validate`",
  which reads as an acceptance gate. It is a structural check — state, tasks.csv,
  manifest, invariants — and an agent correctly pointed out that a green result is
  not proof a task is done.
