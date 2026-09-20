import { z } from 'zod';
import { NonEmptyString, versionedObject } from './common.js';

/**
 * Change Engine schemas (P08-11, CHG-001 REQ-CHG-001..004).
 * Mirrors docs/15-change-governance/change-engine.md: `planmo change
 * new/apply/archive` with explicit ADDED/MODIFIED/REMOVED deltas so planning
 * evolution stays reviewable and reversible.
 */

export const CHANGE_DELTA_KINDS = ['ADDED', 'MODIFIED', 'REMOVED'] as const;
export type ChangeDeltaKind = (typeof CHANGE_DELTA_KINDS)[number];

/** One requirement delta: a requirement id + what changed + optional impact note. */
export const RequirementDelta = z.strictObject({
  kind: z.enum(CHANGE_DELTA_KINDS),
  requirementId: NonEmptyString,
  /** What changed, e.g. "REQ-DESIGN-004 added — token budgets per pack". */
  detail: NonEmptyString,
  /** Optional impact note (affected artifacts/packages). */
  impact: NonEmptyString.optional(),
});
export type RequirementDelta = z.infer<typeof RequirementDelta>;

export const CHANGE_STATUSES = ['proposed', 'accepted', 'applied', 'archived'] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

/**
 * A change package. `planmo change new` produces a proposed package; `apply`
 * moves it to applied (after acceptance) and records provenance; `archive`
 * preserves it. ADDED/MODIFIED/REMOVED deltas are required — no silent edits.
 */
export const ChangePackageSchema = versionedObject({
  /** Change id, e.g. "CHG-001". */
  id: NonEmptyString,
  /** Status lifecycle. */
  status: z.enum(CHANGE_STATUSES),
  /** Short slug, e.g. "quality-context-governance". */
  slug: NonEmptyString,
  /** Human proposal/rationale. */
  proposal: NonEmptyString,
  /** Requirement deltas (ADDED/MODIFIED/REMOVED). At least one required. */
  requirementDeltas: z.array(RequirementDelta).min(1),
  /** Optional risk delta notes. */
  riskDelta: z.array(NonEmptyString).default([]),
  /** Optional task delta notes. */
  taskDelta: z.array(NonEmptyString).default([]),
  /** Optional test delta notes. */
  testDelta: z.array(NonEmptyString).default([]),
  /** Decision record when accepted/applied (provenance). */
  decision: NonEmptyString.optional(),
  /** Where the change package lives on disk. */
  path: NonEmptyString.optional(),
});
export type ChangePackage = z.infer<typeof ChangePackageSchema>;

/** Minimal shape for transition validations in tests. */
export const ChangeSnapshot = z.strictObject({
  current: ChangePackageSchema,
  /** Prior deltas, for archive/reversibility checks. */
  history: z.array(ChangePackageSchema).default([]),
});
export type ChangeSnapshot = z.infer<typeof ChangeSnapshot>;