/**
 * @planmo/packs — PlanMo declarative pack system.
 *
 * Phase 04: declarative pack loader (ADR-0004: no executable packs),
 * deterministic resolution with surfaced conflicts, lockfile generation,
 * planning-depth profiles, and the CHG-001 standards/policy selection engine
 * (deterministic precedence, conflicts surfaced never silently resolved).
 *
 * Phase 11: remote-pack trust classification (P11-01), declarative catalog/
 * source abstraction (P11-02), checksum/pinning/reversibility install plans
 * (P11-03), and the additive GitHub export prototype (P11-05).
 */
export * from './loader.js';
export * from './resolve.js';
export * from './lock.js';
export * from './profiles.js';
export * from './standards.js';
export * from './trust.js';
export * from './catalog.js';
export * from './install.js';
export * from './github-export.js';
export type * from './phase11-contracts.js';
