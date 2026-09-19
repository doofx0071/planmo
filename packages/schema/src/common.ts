import { z } from 'zod';

/**
 * Shared schema primitives for all PlanMo canonical documents.
 *
 * Policy (see planning/DECISIONS.md and ADR-0011):
 * - Every persisted PlanMo document carries an explicit `schemaVersion`.
 * - Object schemas are STRICT: unknown keys are rejected with diagnostics
 *   (fail-closed) instead of silently stripped. User extension data is a
 *   *supported* field via the optional `extensions` map, which migrations
 *   must preserve verbatim.
 * - Future major schema versions are rejected at parse/migrate time.
 */

/** Current canonical schema version (v1). */
export const SCHEMA_VERSION = 1 as const;

/** Highest schemaVersion this build can read. */
export const MAX_SUPPORTED_SCHEMA_VERSION = 1 as const;

/** Non-empty trimmed string used for names, identifiers, paths. */
export const NonEmptyString = z.string().trim().min(1);

/** Loose SemVer-compatible version string (e.g. `0.0.0`, `1.2.3-beta.1`). */
export const SemVerString = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);

/** Pack reference id, e.g. `stack/nextjs`, `design/minimal`. */
export const PackRef = z
  .string()
  .regex(/^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/, 'expected pack ref like "stack/nextjs"');

/** Checksum of a generated artifact or remote pack. */
export const Checksum = z.strictObject({
  algorithm: z.enum(['sha256', 'sha512']),
  digest: z.string().regex(/^[0-9a-f]+$/),
});
export type Checksum = z.infer<typeof Checksum>;

/**
 * Supported user extension data. Migrations preserve this verbatim.
 * Deliberately open (unknown JSON); it is user data, not machine-validated.
 */
export const Extensions = z.record(z.string(), z.unknown());

/**
 * Build a strict, versioned, extendable document schema.
 * Every PlanMo document gets `schemaVersion` (current literal) plus an
 * optional `extensions` map; all other keys are validated strictly.
 */
export function versionedObject<T extends z.ZodRawShape>(shape: T) {
  return z.strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    ...shape,
    extensions: Extensions.optional(),
  });
}
