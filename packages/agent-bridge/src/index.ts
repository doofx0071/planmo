/**
 * @planmo/agent-bridge — agent capability registry, providers, proposal
 * validation, context bundle compilation (Phase 06).
 *
 * Validates AI output before it can affect state; renders agent-neutral
 * invocations through @planmo/adapters; never executes a CLI itself.
 */
export * from './providers.js';
export * from './registry.js';
export * from './proposal.js';
