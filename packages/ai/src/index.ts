/**
 * @planmo/ai — the model-provider abstraction (additive AI layer).
 *
 * One interface (`ModelProvider`) with a deterministic offline mock and an
 * OpenAI-compatible HTTP provider. No package depends on a vendor SDK: the HTTP
 * provider uses the platform `fetch`, and `validateAgainstSchema` is the
 * dependency-free check that structured output must pass before it can drive
 * artifact generation (docs/06-agent-engine/ai-boundary.md).
 */
export * from './contracts.js';
export * from './providers.js';
export * from './structured.js';
export * from './mock.js';
export * from './http.js';
