/**
 * @planmo/schema — canonical project model and artifact schemas.
 *
 * Phase 02 owns the versioned schemas (project config, state, lockfile,
 * manifest, requirements, design profiles, trace graph, handoffs, work
 * packets). This package is scaffolded now to establish the workspace
 * dependency spine (schema -> shared); re-exporting a shared helper is a
 * placeholder until the real schema modules land.
 */
export { isNonEmptyString } from '@planmo/shared';
