import { PLANNING_DEPTHS, type PhaseMode, type PlanningDepth } from '@planmo/schema';

/**
 * Planning-depth profiles (P04-04).
 *
 * Each profile is a deterministic compile of a planning depth into the
 * documents, gates, and phase-mode rules a project of that depth must honor.
 * Profiles are pure data compiled by a pure function — “lean/standard/
 * production/high-assurance profiles compile predictably” (exit gate).
 */

export type ProfileId = Exclude<PlanningDepth, 'custom'>;

export interface PlanningProfile {
  id: ProfileId;
  /** Canonical documents REQUIRED at this depth. */
  requiredDocuments: readonly string[];
  /** Phase-mode default for fresh sessions at this depth. */
  phaseMode: PhaseMode;
  /** Review/test gates every phase must run (superset semantics). */
  gates: readonly string[];
  /** Whether the phase handoff must include traceability tables. */
  requireTraceability: boolean;
  /** Whether security review is mandatory per phase. */
  requireSecurityReview: boolean;
  /** Snapshot of optional docs at this depth (informational). */
  optionalDocuments: readonly string[];
}

const BASE_DOCUMENTS = [
  '.planmo/project.yml',
  '.planmo/state.yml',
  '.planmo/manifest.json',
  'planning/TRACKER.md',
  'planning/handoffs/phase-XX-handoff.md',
  'planning/ROADMAP.md',
] as const;

const BASE_GATES = ['unit tests', 'typecheck', 'lint', 'format:check', 'boundary-check'] as const;

/** Deterministic profile table — the single source of truth for depth → profile. */
const PROFILE_TABLE: Readonly<Record<ProfileId, PlanningProfile>> = {
  lean: {
    id: 'lean',
    requiredDocuments: [...BASE_DOCUMENTS, '.planmo/lock.yml'],
    phaseMode: 'continuous',
    gates: [...BASE_GATES],
    requireTraceability: false,
    requireSecurityReview: false,
    optionalDocuments: [
      'planning/phases/phase-NN.md',
      'planning/DECISIONS.md',
      'planning/RISKS.md',
    ],
  },
  standard: {
    id: 'standard',
    requiredDocuments: [
      ...BASE_DOCUMENTS,
      '.planmo/lock.yml',
      'planning/REQUIREMENTS-TRACEABILITY.md',
      'planning/DECISIONS.md',
      'planning/RISKS.md',
    ],
    phaseMode: 'gated',
    gates: [...BASE_GATES, 'negative/security tests'],
    requireTraceability: true,
    requireSecurityReview: false,
    optionalDocuments: ['planning/phases/phase-NN.md', 'planning/OPEN-QUESTIONS.md'],
  },
  production: {
    id: 'production',
    requiredDocuments: [
      ...BASE_DOCUMENTS,
      '.planmo/lock.yml',
      'planning/REQUIREMENTS-TRACEABILITY.md',
      'planning/DECISIONS.md',
      'planning/RISKS.md',
      'planning/phases/phase-NN.md',
      'planning/OPEN-QUESTIONS.md',
    ],
    phaseMode: 'gated',
    gates: [...BASE_GATES, 'negative/security tests', 'golden fixtures', 'determinism tests'],
    requireTraceability: true,
    requireSecurityReview: true,
    optionalDocuments: ['planning/ADOPTION.md'],
  },
  'high-assurance': {
    id: 'high-assurance',
    requiredDocuments: [
      ...BASE_DOCUMENTS,
      '.planmo/lock.yml',
      'planning/REQUIREMENTS-TRACEABILITY.md',
      'planning/DECISIONS.md',
      'planning/RISKS.md',
      'planning/phases/phase-NN.md',
      'planning/OPEN-QUESTIONS.md',
      'planning/ADOPTION.md',
    ],
    phaseMode: 'gated',
    gates: [
      ...BASE_GATES,
      'negative/security tests',
      'golden fixtures',
      'determinism tests',
      'cross-platform tests',
      'migration/upgrade tests',
      'security review sign-off',
    ],
    requireTraceability: true,
    requireSecurityReview: true,
    optionalDocuments: [],
  },
};

/** Depth → profile id mapping; `custom` has no predefined profile. */
export function compilePlanningProfile(depth: PlanningDepth): PlanningProfile | null {
  if (depth === 'custom') return null;
  return PROFILE_TABLE[depth];
}

/** All predefined profiles in deterministic order (lean → high-assurance). */
export function allPlanningProfiles(): PlanningProfile[] {
  return PLANNING_DEPTHS.filter((d): d is ProfileId => d !== 'custom').map((d) => PROFILE_TABLE[d]);
}

/** Compile all profiles and return them keyed by id (deterministic). */
export function compileAllProfiles(): Readonly<Record<ProfileId, PlanningProfile>> {
  return PROFILE_TABLE;
}
