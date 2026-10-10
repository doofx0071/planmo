import { z } from 'zod';
import { isTaskId } from '@planmo/shared';
import { NonEmptyString, versionedObject } from './common.js';
import { TaskPriority, TaskVerification } from './task.js';

/**
 * The plan document (step 4): what an AI authors once, and what the compiler then
 * reads deterministically.
 *
 * The whole point of this file is to keep the model OUT of the reproducible path.
 * `planmo plan` calls a provider once, the result is validated against this schema
 * and pinned to `.planmo/plan.yml`; from then on `planmo generate` compiles from
 * `project.yml` + `plan.yml` with no model involved. That is what lets the
 * workspace stay byte-stable (goldens, `inputHash`, reproducible regeneration)
 * while the plan itself is model-authored.
 *
 * It AUGMENTS the canonical phase spine rather than replacing it: a workspace with
 * no `plan.yml` behaves exactly as it did before this existed, so every existing
 * workspace and golden stays valid and the AI is opt-in.
 */

/** A task in a plan. Carries real criteria — this is what raises the schema-v2 floor. */
export const PlanTask = z.strictObject({
  id: NonEmptyString,
  title: NonEmptyString,
  priority: TaskPriority,
  /** At least one checkable criterion. A task with none is rejected, not repaired. */
  acceptance: z.array(NonEmptyString).min(1),
  /**
   * Requirement ids this task delivers. Defaults to none so a plan may be written
   * before the requirements document exists; the validator checks the refs against
   * what the workspace actually declares, which is what makes traceability real
   * rather than aspirational.
   */
  requirements: z.array(NonEmptyString).default([]),
  verification: TaskVerification,
});
export type PlanTask = z.infer<typeof PlanTask>;

/** A phase in a plan. */
export const PlanPhase = z.strictObject({
  /** Zero-padded phase number, e.g. "00" — matches the canonical spine's shape. */
  id: NonEmptyString,
  title: NonEmptyString,
  objective: NonEmptyString,
  /** What must hold for the phase to be complete. */
  exitCriteria: z.array(NonEmptyString),
  tasks: z.array(PlanTask).min(1),
});
export type PlanPhase = z.infer<typeof PlanPhase>;

/**
 * The canonical plan document.
 *
 * Strict and versioned like every other persisted PlanMo document: unknown keys
 * are rejected rather than silently dropped, so a model that invents a field gets
 * a diagnostic instead of a plan that quietly means something other than it says.
 */
export const PlanDocument = versionedObject({
  /** The user's idea, verbatim. The plan must be traceable to it. */
  idea: NonEmptyString,
  /**
   * Which provider and model authored this plan. Provenance is required — a plan
   * with no recorded author is a plan nobody can re-evaluate.
   */
  provider: z.strictObject({
    id: NonEmptyString,
    model: NonEmptyString,
  }),
  /**
   * Deliberately `null`, and deliberately a literal.
   *
   * A timestamp here would make two identical plans differ byte-for-byte, which
   * breaks the golden fixtures and the IR's `inputHash`. Provenance about WHEN is
   * the manifest's job, not a canonical document's. The schema enforces it rather
   * than trusting the generator to remember.
   */
  generatedAt: z.null(),
  phases: z.array(PlanPhase).min(1),
  /**
   * Unresolved questions the plan is aware of. First-class rather than optional:
   * the spec requires the planning process to distinguish confirmed facts from
   * guesses, and a field is the only way to enforce that rather than hope for it.
   */
  openQuestions: z.array(NonEmptyString),
  /** Things the plan assumed rather than knew. Explicitly NOT facts. */
  assumptions: z.array(NonEmptyString),
});
export type PlanDocument = z.infer<typeof PlanDocument>;

/** Where the plan document lives, relative to the project root. */
export const PLAN_PATH = '.planmo/plan.yml';

/**
 * A task id in a plan must be the canonical `P<NN>-<NN>` form, and its embedded
 * phase must match the phase it sits under. Exported separately from the zod
 * schema because it needs the surrounding phase to check — a per-field refinement
 * cannot see it.
 */
export function planIdProblems(plan: PlanDocument): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const phase of plan.phases) {
    for (const task of phase.tasks) {
      if (!isTaskId(task.id)) {
        problems.push(`task id '${task.id}' is not the canonical P<NN>-<NN> form`);
        continue;
      }
      if (seen.has(task.id)) problems.push(`duplicate task id '${task.id}'`);
      seen.add(task.id);
      const embedded = task.id.slice(1, 3);
      if (embedded !== phase.id) {
        problems.push(`task '${task.id}' is listed under phase '${phase.id}'`);
      }
    }
  }
  return problems;
}
