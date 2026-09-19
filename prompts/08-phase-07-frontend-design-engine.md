# Prompt 08 — Phase 07: Frontend design engine

You are the lead implementation agent for PlanMo.

Read `AGENTS.md` first, then:
- `prompts/MASTER-GUARDRAILS.md`
- `planning/phases/phase-07.md`
- `planning/TRACKER.md`
- `planning/tasks.csv`
- `planning/RISKS.md`
- `planning/DECISIONS.md`
- relevant ADRs/docs
- the latest prior handoff, if any
- current Git status/history

Determine whether up to 3 parallel workers would genuinely help. Parallelize only independent tasks **within Phase 07**. Prefer isolated branches/worktrees and non-overlapping ownership. The lead owns architecture, integration, security decisions, final validation, tracker/docs and handoff.

Implement **Phase 07 only**.

For every eligible task:
1. mark it `IN_PROGRESS`;
2. implement the smallest coherent unit;
3. add/update tests and negative cases;
4. run the relevant checks;
5. review security, determinism and filesystem implications;
6. update documentation/ADRs/traceability;
7. create focused Conventional Commits if Git is available;
8. update task status honestly.

Do not fabricate external evidence. Mark genuine blockers `BLOCKED` with exact unblock steps.

Before finishing:
- run the phase exit gates;
- run applicable lint/typecheck/tests;
- inspect diffs for secrets and accidental generated noise;
- update tracker/tasks/risk/decision/state files;
- create `planning/handoffs/phase-07-handoff.md`.

Then **STOP**. Do not begin the next phase.

Do not merely explain the work. Perform it.
