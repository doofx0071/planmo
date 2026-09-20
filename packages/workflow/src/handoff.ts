import { HandoffSchema } from '@planmo/schema';
import type { HandoffDocument } from '@planmo/schema';
import type { HandoffBuildInput, HandoffBuilder } from './contracts.js';

/**
 * Handoff builder (P08-02).
 *
 * Produces a schema-valid HandoffDocument deterministically and checks
 * resume-sufficiency: a handoff is sufficient when a fresh session can pick
 * up from repository state alone (phase, status, completed tasks, next phase,
 * instructions — plus git/decisions/tests when provided).
 */

/** Fields whose ABSENCE blocks a clean resume (beyond schema defaults). */
const RESUME_REQUIRED: ReadonlyArray<keyof HandoffDocument> = [
  'phase',
  'status',
  'completedTasks',
  'nextPhase',
];

export function handoffBuilder(): HandoffBuilder {
  function build(input: HandoffBuildInput): HandoffDocument {
    const doc = HandoffSchema.parse({
      schemaVersion: 1,
      phase: input.phase,
      status: input.status,
      completedTasks: [...input.completedTasks].sort(),
      blocked: input.blocked ? [...input.blocked] : [],
      materialChanges: input.materialChanges ? [...input.materialChanges].sort() : [],
      testsRun: input.testsRun ? [...input.testsRun] : [],
      securityFindings: input.securityFindings ? [...input.securityFindings].sort() : [],
      decisions: input.decisions ? [...input.decisions].sort() : [],
      git: input.git,
      knownDebt: input.knownDebt ? [...input.knownDebt].sort() : [],
      nextPhase: input.nextPhase,
      instructions: input.instructions ? [...input.instructions] : [],
    });
    return doc;
  }

  function missingForResume(doc: HandoffDocument): readonly string[] {
    const missing: string[] = [];
    for (const field of RESUME_REQUIRED) {
      const value = doc[field];
      if (value === undefined || (Array.isArray(value) && value.length === 0)) {
        missing.push(String(field));
      }
    }
    return missing;
  }

  return { build, missingForResume };
}
