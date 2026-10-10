import type { PlanDocument, PlanningDepth } from '@planmo/schema';
import { planIdProblems } from '@planmo/schema';
import { phasesForDepth } from './ir.js';

/**
 * Validation for an AI-authored plan.
 *
 * Scope note, because it is the difference between this and `PlanDocument`: the
 * zod schema already guarantees the SHAPE (a phase has a title, a task has at
 * least one acceptance criterion, no unknown keys). This validator covers only the
 * rules a single field cannot see — the ones that need the rest of the plan, or
 * the project, to judge:
 *
 *   - phase ids are two-digit and contiguous from "00"
 *   - task ids are canonical `P<NN>-<NN>`, unique, and match their phase
 *   - the phase count respects the project's declared depth
 *   - a task that requires verification names the checks it needs
 *   - a requirement reference points at a requirement that exists
 *
 * That split matters for step 4: a model can produce a document that is
 * structurally valid and still plan nonsense, so the gate has to be these
 * cross-field rules and not just "it parsed".
 *
 * PURE: no filesystem access, no clock, no randomness. Diagnostics are sorted by
 * code so the output is stable and safe to diff.
 */

export type PlanSeverity = 'error' | 'warning';

export interface PlanDiagnostic {
  code: string;
  severity: PlanSeverity;
  /** What the diagnostic is about — a phase id, a task id, or the document. */
  target: string;
  message: string;
  remediation?: string;
}

export interface PlanValidationInput {
  plan: PlanDocument;
  /** The project's declared planning depth — caps how many phases are acceptable. */
  depth: PlanningDepth;
  /**
   * Requirement ids the workspace declares. When omitted, requirement references
   * are not checked at all, so a plan can be validated before the requirements
   * document exists.
   */
  requirementIds?: readonly string[];
}

export interface PlanValidationResult {
  ok: boolean;
  diagnostics: PlanDiagnostic[];
}

/** Two-digit zero-padded phase number, e.g. `00`, `12`. */
const PHASE_ID = /^\d{2}$/;

/**
 * Validate a plan against its project context.
 *
 * Rejection is the contract: a plan that fails here must not be written, and the
 * caller reports the diagnostics rather than repairing anything silently. Nothing
 * in this function mutates the plan.
 */
export function validatePlanDocument(input: PlanValidationInput): PlanValidationResult {
  const { plan, depth } = input;
  const diagnostics: PlanDiagnostic[] = [];

  // ---- phases: ids well-formed, unique, contiguous from 00
  const seenPhases = new Set<string>();
  for (const phase of plan.phases) {
    if (!PHASE_ID.test(phase.id)) {
      diagnostics.push({
        code: 'PLN-002',
        severity: 'error',
        target: phase.id,
        message: `phase id '${phase.id}' is not a two-digit zero-padded number`,
        remediation: 'Use ids "00", "01", … in order, matching the canonical spine.',
      });
    }
    if (seenPhases.has(phase.id)) {
      diagnostics.push({
        code: 'PLN-001',
        severity: 'error',
        target: phase.id,
        message: `duplicate phase id '${phase.id}'`,
        remediation: 'Give each phase a distinct id.',
      });
    }
    seenPhases.add(phase.id);

    if (phase.exitCriteria.length === 0) {
      diagnostics.push({
        code: 'PLN-008',
        severity: 'warning',
        target: phase.id,
        message: `phase ${phase.id} declares no exit criteria`,
        remediation: 'Name what must hold for the phase to be complete.',
      });
    }
  }

  // Contiguity is checked on the sorted numeric ids, so a plan that lists phases
  // out of order is still judged on its set rather than its ordering.
  const numeric = plan.phases
    .map((phase) => phase.id)
    .filter((id) => PHASE_ID.test(id))
    .map((id) => Number(id))
    .sort((a, b) => a - b);
  for (const [index, value] of numeric.entries()) {
    if (value !== index) {
      diagnostics.push({
        code: 'PLN-003',
        severity: 'error',
        target: 'phases',
        message: `phase ids are not contiguous from 00 (found ${numeric.join(', ')})`,
        remediation: 'Renumber the phases from "00" with no gaps.',
      });
      break;
    }
  }

  // ---- the depth cap (agreed decision: depth wins over the model's decomposition)
  const cap = phasesForDepth(depth).length;
  if (plan.phases.length > cap) {
    diagnostics.push({
      code: 'PLN-005',
      severity: 'error',
      target: 'phases',
      message: `plan has ${plan.phases.length} phases but depth '${depth}' allows ${cap}`,
      remediation: `Merge or drop phases to ${cap} or fewer, or raise the project's planning depth.`,
    });
  }

  // ---- tasks: canonical ids, unique, matching their phase
  for (const problem of planIdProblems(plan)) {
    diagnostics.push({
      code: 'PLN-004',
      severity: 'error',
      target: 'tasks',
      message: problem,
      remediation: 'Use canonical `P<NN>-<NN>` ids and keep each task under its own phase.',
    });
  }

  // ---- a task that requires verification must name its checks
  for (const phase of plan.phases) {
    for (const task of phase.tasks) {
      if (task.verification.required && task.verification.checks.length === 0) {
        diagnostics.push({
          code: 'PLN-006',
          severity: 'error',
          target: task.id,
          message: `task ${task.id} requires verification but names no checks`,
          remediation: 'List the checks that must pass, or set verification.required to false.',
        });
      }

      // ---- requirement references must exist
      if (input.requirementIds !== undefined) {
        const known = new Set(input.requirementIds);
        for (const ref of task.requirements) {
          if (!known.has(ref)) {
            diagnostics.push({
              code: 'PLN-007',
              severity: 'error',
              target: task.id,
              message: `task ${task.id} references unknown requirement '${ref}'`,
              remediation:
                'Point the task at a requirement the workspace declares, or drop the reference.',
            });
          }
        }
      }
    }
  }

  diagnostics.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return { ok: !diagnostics.some((d) => d.severity === 'error'), diagnostics };
}
