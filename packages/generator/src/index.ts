/**
 * @planmo/generator — planning compiler and artifact generator (Phase 05).
 *
 * Deterministic core generation: IR → renderers → generation manifest →
 * safe apply. AI output is never a direct input; it enters upstream as
 * validated project proposals only.
 */
export * from './ir.js';
export * from './contracts.js';
export * from './render.js';
export * from './standards-context.js';
export * from './manifest.js';
export * from './synth.js';
export * from './compile.js';
export * from './fixtures.js';
