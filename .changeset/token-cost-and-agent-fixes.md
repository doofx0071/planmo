---
'planmo': patch
'@planmo/agent-bridge': patch
---

Cut the token cost of an agent run, and fix two bugs the last one exposed.

A real `/planmo-next` run on AdiV cost **1.65M tokens across 28 calls** for a task
whose output was four short decisions. Almost none of it was the task: the agent
read the whole planning tree, then PlanMo's own installed source under
`node_modules`, to work out a rule the brief should have stated.

**The brief now states it.** `planmo next` names the documents you own — read from
the manifest's `seeded` entries — and says plainly that every other file under
`planning/` is generated and overwritten on regeneration:

```
Record decisions and durable notes in the documents you own — regeneration
never touches these:
  planning/DECISIONS.md
  planning/OPEN-QUESTIONS.md
  planning/RISKS.md
  ...

Every other file under planning/ is GENERATED: regeneration overwrites it, so
anything written there is lost.
```

The ownership boundary was the one thing an agent could not infer: generated and
user-owned files look identical. Discovering it empirically cost the most.

**Installed commands now say `npx -y planmo`.** Without `-y`, npx asks "Ok to
proceed? (y)" on a machine that has not cached the package and does nothing if that
prompt is dismissed — an agent following the instruction stalls silently. A test
asserts no template ever invokes npx without it.

**Installed commands now say not to explore**: no reading PlanMo's own source, no
scanning the rest of the planning tree.

## Two bugs found while doing it

`planmo init` **refused to write the workspace** on any repository whose only agent
signal was `AGENTS.md`. Detection saw `codex`, ADR-0008's v1 matrix is
`opencode | claude-code | generic`, and `project.yml` rejected its own value. The
Primary agent menu offered all 31 installable agents for the same reason. Detection
and the menu now use the matrix; a detected agent outside it falls back to the
documented default.

The agent E2E **did not isolate the home**, so it passed only on machines without
Hermes. `hermes` is the one global target, and the moment a real `~/.hermes/skills`
appeared the check flipped. It now pins `PLANMO_HOME` to a temp directory.
