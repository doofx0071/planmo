---
'planmo': minor
'@planmo/schema': minor
'@planmo/generator': minor
'@planmo/trace': minor
---

Task schema v2 — acceptance criteria, a verification policy, and the evidence
scaffold that makes "verified" mean something.

**The gap this closes.** There was no canonical Task type at all: `@planmo/trace`
had `TraceTask`, `@planmo/workflow` had its own view, and `tasks.csv` was the only
artifact they shared — each parsing it independently. Nothing could carry
acceptance criteria, so three things were dead ends:

- `planmo trace` could never clear its warnings. Nothing in a workspace could
  record test evidence, so every task reported `TRC-002 no test evidence` forever.
- `planmo handoff` could not report verification — no field for it.
- Evidence-based completion was structurally impossible, which is the product's
  central promise: a task is not verified because an agent says it is.

**`@planmo/schema` now owns the model.** `TaskRecord` with `acceptance: string[]`
and `verification: { required, checks }`, plus the `tasks.csv` codec
(`serializeTasksCsv` / `parseTasksCsv`) so the writer and every reader share one
implementation instead of each splitting on a bare comma. The task states stay
where they already were — `state-lock-manifest.ts` — so there is still one
definition of the lifecycle.

**`planning/tasks.csv` gains three columns:**

```
id,phase,title,status,priority,acceptance,verification,checks
```

`acceptance` and `checks` are `;`-separated lists inside one RFC 4180 quoted cell.
The parser accepts the five-column v1 width too, so a workspace generated before
this change keeps working — the validator accepts both, and the validators report
missing criteria rather than the schema refusing to load the file.

**`planning/testing/TEST-EVIDENCE.csv` is new** — one row per check a
`verification.required` task must satisfy:

```
task_id,check,command,result
P00-01,unit tests,,
```

`command` and `result` are blank until the check is actually run. `command` is
blank because the generator cannot know a project's commands; a pre-filled result
would be a fabricated one. This is the file `planmo trace` reads, so recording a
result is what clears `TRC-002` for that task. Verified on the real CLI: the
warning count drops 28 → 27 the moment a pass is recorded for `P00-01`.

Optional tasks get no evidence rows — nothing gates on them, so demanding
evidence would be noise.

**What the seed criteria are, honestly.** The generator cannot know a project's
acceptance criteria, so it derives them from what it does know: the phase
objective, the phase document, and the profile's exit gates. Every task gets at
least one checkable criterion. This is a deterministic **floor, not task
decomposition** — raising it to project-specific criteria is the AI planner's job.
Stated plainly so nobody mistakes the seed for the finished feature.

The seeded workstreams are unchanged: implement, tests & evidence,
docs/traceability, handoff — still derived from the one `phaseTasks()` function,
so `tasks.csv`, the phase documents, the tracker, the traceability matrix and the
evidence file cannot disagree.

**Also:** the phase document now lists each task's acceptance criteria and whether
its verification is required, so the criteria are visible where a human reads them.
