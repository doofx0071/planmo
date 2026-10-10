---
'planmo': minor
'@planmo/schema': minor
'@planmo/generator': minor
'@planmo/ai': minor
---

The AI planning engine: `planmo plan` authors the plan document, and `generate`
compiles from it. Determinism is preserved (ADR-0027).

## The decision everything rests on

PlanMo's discipline is byte-stable output — goldens, `inputHash`, reproducible
regeneration. A model call inside `generate` would destroy all of it. So the model
authors **once**, and its output is pinned as a canonical document:

```
planmo plan "<idea>"   →  model proposes  →  validated  →  .planmo/plan.yml   (once)
planmo generate        →  compiles project.yml + plan.yml                     (always)
```

`generate` performs no model call. A plan is an input, like `project.yml`.

## `planmo plan`

```
$ planmo plan "Build a SaaS for freelancers" --dir shop
plan generated.
  phases: 1   tasks: 1
  author: tokenharbor / deepseek/deepseek-v4-flash
  tokens: 532 in, 174 out

Assumptions (not facts — review these): 1
  - ...
Unresolved questions: 1
  - ...
Workspace: .planmo/plan.yml

Next step:
  planmo generate
```

- **A plan that fails validation writes nothing.** The previous `plan.yml`, if any,
  is left byte-identical — a failed planning operation must not destroy the last
  valid plan.
- **A plan you own is a collision** (exit 2), not a silent overwrite.
- `assumptions` and `openQuestions` are required fields, so a plan cannot hide its
  own uncertainty.
- `generatedAt` is `null`, enforced by the schema: a timestamp would make two
  identical plans differ byte-for-byte.
- A missing provider explains how to set one and exits — it never falls back to fake
  output. `--provider mock` exists for offline exercise and says plainly that its
  output is simulated.

## Providers

A registry, gateway-first — the way coding agents connect: one key across many
vendors, models as `provider/model` slugs, OpenAI- **and** Anthropic-compatible
wire formats.

| Preset                          | Credential env var                                      |
| ------------------------------- | ------------------------------------------------------- |
| `tokenharbor`                   | `TOKENHARBOR_KEY`                                       |
| `openai` / `anthropic`          | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`                  |
| `deepseek` / `moonshot` / `xai` | `DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` / `XAI_API_KEY` |
| `openrouter` / `custom`         | `OPENROUTER_API_KEY` / `PLANMO_AI_API_KEY`              |

Credentials come from the environment, by convention, and **only** from there.
PlanMo does not read the credential stores of the coding agents it detects —
harvesting another tool's tokens is secret exfiltration, a stop condition in
`AGENTS.md`.

## What the plan drives

A plan **augments** the canonical spine: with one, its phases and tasks are the
project's; without one, the canonical spine and the seeded tasks stand exactly as
before. Verified on the real CLI — after `planmo plan` + `generate`, `tasks.csv`
carries the plan's task and `planmo next` reports it, while `validate` stays clean.

Every workspace generated before this feature, and every golden fixture, is
**byte-identical**. The plan is included in the `inputHash` only when one exists, so
a project without a plan does not report as out of date merely because this landed.

## Also

- `@planmo/schema` gains the canonical task model (v2: acceptance criteria, a
  verification policy, and the `tasks.csv` codec) and `PlanDocument`.
- `planning/testing/TEST-EVIDENCE.csv` is new: one row per check a
  `verification.required` task must satisfy. Recording a result is what clears
  `TRC-002` — evidence, not a claim.
- `planmo trace` now reads that file; the warning count drops the moment a pass is
  recorded.
- ADR-0027 records the decision and its alternatives.
