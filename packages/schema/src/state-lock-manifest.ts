import { z } from 'zod';
import { NonEmptyString, SemVerString, versionedObject } from './common.js';

/**
 * Operational workflow state — `.planmo/state.yml`.
 * Mirrors docs/02-architecture/state-and-manifest.md and the repo's own
 * `.planmo/state.yml`.
 */

export const STATE_STATUSES = ['planned', 'active', 'blocked', 'complete'] as const;
export type StateStatus = (typeof STATE_STATUSES)[number];

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const StateSchema = versionedObject({
  /** Current phase id, e.g. "02". */
  currentPhase: NonEmptyString,
  status: z.enum(STATE_STATUSES),
  /** Zero-padded phase ids, e.g. ["00", "01"]. */
  completedPhases: z.array(NonEmptyString).default([]),
  /** Task ids currently blocked, e.g. ["P02-05"]. */
  blockedTasks: z.array(NonEmptyString).default([]),
  /** Path of the prompt file for the next phase. */
  nextPrompt: NonEmptyString.optional(),
  /** Path of the most recent phase handoff. */
  lastHandoff: NonEmptyString.optional(),
  /** Snapshot of per-task statuses (owned by the workflow engine, Phase 08). */
  tasks: z.record(NonEmptyString, z.enum(TASK_STATUSES)).optional(),
});
export type StateDocument = z.infer<typeof StateSchema>;

/**
 * Resolved lock state — `.planmo/lock.yml`.
 * Pinned PlanMo/pack/adapter versions and remote source integrity.
 */
export const LOCK_SOURCES = ['registry', 'git', 'local'] as const;
export type LockSource = (typeof LOCK_SOURCES)[number];

// Re-declared locally to keep lock self-contained while sharing the digest shape.
const Integrity = z.strictObject({
  algorithm: z.enum(['sha256', 'sha512']),
  digest: z.string().regex(/^[0-9a-f]+$/),
});

export const PackLockEntry = z.strictObject({
  ref: NonEmptyString,
  name: NonEmptyString,
  version: SemVerString,
  source: z.enum(LOCK_SOURCES),
  /** Integrity of the resolved remote content; absent for local packs. */
  integrity: Integrity.optional(),
});
export type PackLockEntry = z.infer<typeof PackLockEntry>;

export const AdapterLockEntry = z.strictObject({
  id: NonEmptyString,
  version: SemVerString,
  source: z.enum(LOCK_SOURCES).optional(),
  integrity: Integrity.optional(),
});
export type AdapterLockEntry = z.infer<typeof AdapterLockEntry>;

export const LockfileSchema = versionedObject({
  /** PlanMo core version that produced this lock. */
  planmoVersion: SemVerString,
  packs: z.array(PackLockEntry).default([]),
  adapters: z.array(AdapterLockEntry).default([]),
});
export type LockfileDocument = z.infer<typeof LockfileSchema>;

/**
 * Generated-artifact manifest — `.planmo/manifest.json`.
 * Provenance for every file PlanMo generated or owns.
 */
export const ARTIFACT_KINDS = [
  'config',
  'planning-doc',
  'prompt',
  'design-tokens',
  'workflow',
  'other',
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/**
 * Ownership modes. Canonical CHG-001 classes (ADR-0016): `generated` (PlanMo
 * owns the whole file), `merged` (PlanMo owns structured sections), `seeded`
 * (PlanMo created it once, then the user owns it), `user` (PlanMo never
 * overwrites). Legacy values `managed`/`merge` remain accepted aliases so
 * v1 manifests written before CHG-001 keep parsing.
 */
export const OWNERSHIP_MODES = [
  'managed',
  'merge',
  'user',
  'generated',
  'merged',
  'seeded',
] as const;
export type OwnershipMode = (typeof OWNERSHIP_MODES)[number];

export const ManifestEntry = z.strictObject({
  /** Path relative to the repository root. */
  path: NonEmptyString,
  kind: z.enum(ARTIFACT_KINDS),
  /** Generator or agent that produced the artifact. */
  generator: NonEmptyString,
  /** Pack refs that contributed content, e.g. ["design/minimal"]. */
  sources: z.array(NonEmptyString).default([]),
  checksum: Integrity,
  ownershipMode: z.enum(OWNERSHIP_MODES),
  /** PlanMo version that generated this artifact. */
  generationVersion: SemVerString,
});
export type ManifestEntry = z.infer<typeof ManifestEntry>;

export const ManifestSchema = versionedObject({
  revision: z.number().int().nonnegative(),
  entries: z.array(ManifestEntry).default([]),
});
export type ManifestDocument = z.infer<typeof ManifestSchema>;
