# @planmo/ai

## 1.2.0

### Minor Changes

- abb60d6: `@planmo/ai` joins the published set: a vendor-neutral model-provider abstraction
  with a deterministic offline mock provider and an OpenAI-compatible HTTP provider.
  
  Nothing consumes it yet — `planmo plan` lands on it next — so this is a groundwork
  release. It is published now so the package exists on npm, which is a prerequisite
  for configuring its trusted publisher; until that exists, tokenless OIDC cannot
  publish it, and adding it to a release aborts the whole run with `ENEEDAUTH`.
  
  No vendor SDK and no runtime dependency: the HTTP provider uses global `fetch`, and
  the JSON Schema check is a documented subset implemented in-repo. That subset is
  deliberately fail-open for keywords it does not implement, so it is a pre-check and
  the JSON Schema sent on the wire — never the authoritative gate. AI output is
  validated against the zod schemas in `@planmo/schema`, the same fail-closed path
  agent proposals already take (ADR-0026).

## 1.1.0

### Minor Changes

- da9ad6a: Add `@planmo/ai`, the model-provider abstraction: one `ModelProvider` interface
  with a deterministic, offline mock provider (used by the default test suite and
  goldens) and an OpenAI-compatible HTTP provider built on the platform `fetch`.
  No PlanMo package depends on a vendor SDK, and structured output is
  schema-validated before it can drive artifact generation.
