# AI Boundary

## Default: agent-native
PlanMo installs commands/skills/prompts into the user's existing coding agent.

Benefits:
- no extra PlanMo AI key;
- uses user's provider/subscription;
- agent already sees repo context.

## Optional later: direct-provider mode
CLI may call an LLM directly, but must:
1. request structured output;
2. schema-validate it;
3. surface validation errors;
4. use deterministic generator for filesystem artifacts.

Freeform model text is never executable configuration.
