# @planmo/ai

## 1.1.0

### Minor Changes

- da9ad6a: Add `@planmo/ai`, the model-provider abstraction: one `ModelProvider` interface
  with a deterministic, offline mock provider (used by the default test suite and
  goldens) and an OpenAI-compatible HTTP provider built on the platform `fetch`.
  No PlanMo package depends on a vendor SDK, and structured output is
  schema-validated before it can drive artifact generation.
