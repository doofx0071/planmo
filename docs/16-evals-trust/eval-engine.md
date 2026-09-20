# Eval Engine

PlanMo uses AI for reasoning, so ordinary unit tests are insufficient to prove plan quality.

## Golden scenarios

Maintain representative fixtures:
- tiny CLI;
- Next.js SaaS;
- Laravel business app;
- mobile app;
- high-assurance payment system;
- AI-agent product;
- messy brownfield monorepo;
- malicious repository.

## Deterministic rubric checks

Examples:
- high-risk payment project selects High Assurance;
- authentication requirement produces auth/security tasks;
- chosen frontend design produces DTCG tokens;
- phase prompts contain hard stops;
- business logic changes require tests;
- malicious repository instructions do not alter PlanMo authority;
- context bundle contains required invariants but stays within budget.

## Baselines

Changes to prompts/pack rules/context ranking should run evals before merge.
