/**
 * @planmo/packs — PlanMo declarative pack system.
 *
 * Phase 04: declarative pack loader (ADR-0004: no executable packs),
 * deterministic resolution with surfaced conflicts, lockfile generation,
 * planning-depth profiles, and the CHG-001 standards/policy selection engine
 * (deterministic precedence, conflicts surfaced never silently resolved).
 */
export * from './loader.js';
export * from './resolve.js';
export * from './lock.js';
export * from './profiles.js';
export * from './standards.js';
