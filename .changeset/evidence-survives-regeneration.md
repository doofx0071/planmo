---
'planmo': patch
'@planmo/generator': patch
---

Stop regeneration from discarding recorded evidence.

`planning/testing/TEST-EVIDENCE.csv` was a **generated** document. It is also the
file the trace engine reads to decide whether a task has evidence — so recording a
result and then running `planmo generate` wiped the result and made `TRC-002` fire
again for every task that had been evidenced.

Observed on a real workspace, not inferred: record six results, regenerate, get zero
rows back. The agent doing the work noticed, worked around it by copying the results
into `DECISIONS.md`, and reported the file as "a lossy projection".

It is now `seeded` — PlanMo writes the scaffold once and the user owns it afterwards,
the same family as `DECISIONS.md` and `RISKS.md`. If the task list later grows, new
tasks simply have no rows, which the trace reports as missing evidence: true, rather
than evidence that was thrown away.

The `next` brief also now states two things an agent was otherwise discovering by
reading PlanMo's source:

- **The evidence contract.** `task_id,check,command,result`, and a result counts as
  passing only for `pass | passed | ok | green`. `FAIL` and `NOT RUN` count as no
  evidence, which is honest and was not written down anywhere.
- **How to close the task.** `npx -y planmo task <id> --status DONE`. Two agent runs
  reported that no CLI could transition a task's status, because the command did not
  exist when their instructions were installed. The brief is generated per run, so it
  cannot go stale the same way.
