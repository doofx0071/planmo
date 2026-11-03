# AI Boundary

## Default: agent-native
PlanMo installs commands/skills/prompts into the user's existing coding agent.

Benefits:
- no extra PlanMo AI key;
- uses user's provider/subscription;
- agent already sees repo context.

## Direct-provider mode
The CLI can call an LLM directly through a saved AI profile (`planmo setup`,
`planmo plan`, `planmo suggest`). A direct call must:
1. request structured output;
2. schema-validate it with the canonical schema before any artifact is written;
3. surface validation errors instead of accepting a partial result;
4. use deterministic generator for filesystem artifacts.

Freeform model text is never executable configuration. Provider credentials live
in the OS keyring or a provider-named environment variable, never in `.planmo/`,
a plan, a log, or a report; a nonblank environment key takes precedence over a
saved keyring item.

`planmo plan` is the one command that lets a model author a persisted artifact
(`.planmo/plan.yml`, ADR-0027). `planmo generate` stays model-free and never calls
a provider. `planmo suggest` is advisory and read-only: its output is validated
against the strict report schema and every evidence path and line is checked
against the safe scan, but a suggestion is never applied and is not a verified
defect. Uploading repository content is opt-in per run, and `--dry-run` makes no
provider call.
