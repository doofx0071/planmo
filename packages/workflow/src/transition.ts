import type { StateDocument } from '@planmo/schema';
import type {
  ExitGateResult,
  FreshSession,
  TransitionEngine,
  TransitionResult,
} from './contracts.js';

/**
 * Phase/state transition engine (P08-01, critical).
 *
 * Rules (from AGENTS.md + MASTER-GUARDRAILS + prompts/*):
 * 1. ONE phase per fresh session — a phase may COMPLETE only when its exit
 *    gates pass; the engine never auto-advances past a RED gate.
 * 2. Transitions are sequential (no skipping) unless `force` is explicit.
 * 3. Fresh-session state derives from CANONICAL state only — never from
 *    agent memory or chat (REQ-MEM authority, ADR-0013).
 * 4. Deterministic: identical state + gates → identical result.
 */

/** Canonical exit gates every phase must clear (from MASTER-GUARDRAILS). */
export const STANDARD_EXIT_GATES = ['tests', 'lint', 'traceability', 'handoff'] as const;

export const PROMPT_BY_PHASE: Readonly<Record<string, string>> = {
  '00': 'prompts/01-phase-00-product-and-research-foundation.md',
  '01': 'prompts/02-phase-01-repository-and-engineering-foundation.md',
  '02': 'prompts/03-phase-02-canonical-project-model-and-schemas.md',
  '03': 'prompts/04-phase-03-cli-foundation.md',
  '04': 'prompts/05-phase-04-pack-and-profile-system.md',
  '05': 'prompts/06-phase-05-planning-compiler-and-artifact-generator.md',
  '06': 'prompts/07-phase-06-agent-bridge.md',
  '07': 'prompts/08-phase-07-frontend-design-engine.md',
  '08': 'prompts/09-phase-08-workflow-session-engine.md',
  '09': 'prompts/10-phase-09-trace-validate-doctor-and-drift.md',
  '10': 'prompts/11-phase-10-existing-repository-adoption.md',
  '11': 'prompts/12-phase-11-ecosystem-and-integrations.md',
  '12': 'prompts/13-phase-12-hardening-pilot-and-v1.md',
};

export const ALL_PHASE_IDS = Object.keys(PROMPT_BY_PHASE).sort();

export function transitionEngine(): TransitionEngine {
  function advance(
    state: StateDocument,
    nextPhase: string,
    gates: readonly ExitGateResult[],
    opts?: { force?: boolean },
  ): TransitionResult {
    // 1. Dependency order: next must be the next phase after the latest completed.
    if (!isNextPhase(state, nextPhase)) {
      return {
        ok: false,
        reason: `cannot advance to phase "${nextPhase}": phase order requires "${String(
          Number(state.currentPhase) + 1,
        ).padStart(2, '0')}" (current "${state.currentPhase}")`,
      };
    }

    // 2. Exit gates: current phase must clear its gates before COMPLETE.
    const failed = gates
      .filter((g) => g.phase === state.currentPhase && !g.passed)
      .map((g) => `${g.name}${g.detail ? ` (${g.detail})` : ''}`);
    if (!opts?.force && failed.length > 0) {
      return {
        ok: false,
        reason: `phase "${state.currentPhase}" exit gates not clear: ${failed.join(', ')}`,
      };
    }

    // 3. Apply the transition (deterministic state copy).
    const completed = state.completedPhases.includes(state.currentPhase)
      ? [...state.completedPhases]
      : [...state.completedPhases, state.currentPhase];

    const next: StateDocument = {
      schemaVersion: state.schemaVersion,
      currentPhase: nextPhase,
      status: 'planned',
      completedPhases: completed.sort(),
      blockedTasks: state.blockedTasks,
      nextPrompt: PROMPT_BY_PHASE[nextPhase],
    };
    return { ok: true, next };
  }

  function isNextPhase(state: StateDocument, phaseId: string): boolean {
    const current = Number(state.currentPhase);
    const next = Number(phaseId);
    // Completed phases are zero-padded ids; the next must follow the current.
    return (
      next === current + 1 &&
      !state.completedPhases.includes(phaseId) &&
      ALL_PHASE_IDS.includes(phaseId)
    );
  }

  function freshSession(state: StateDocument): FreshSession {
    const gates = [...STANDARD_EXIT_GATES];
    const isFresh = !state.completedPhases.includes(state.currentPhase);
    const nextPrompt = PROMPT_BY_PHASE[state.currentPhase];
    const instructions: string[] = [];
    for (const gate of gates) {
      if (isFresh) {
        // Fresh phase: gates must be met by the END of the phase.
        instructions.push(`Meet exit gate "${gate}" for phase "${state.currentPhase}".`);
      }
    }
    const hasUnfinished = state.status === 'active' || state.blockedTasks.length > 0;
    if (hasUnfinished) {
      instructions.push(
        ...state.blockedTasks.map(
          (t) => `BLOCKED ${t}: resolve or record the blocker before progressing.`,
        ),
      );
    }
    if (!isFresh) {
      instructions.push(
        `Phase "${state.currentPhase}" COMPLETE; next is "${PROMPT_BY_PHASE[String(Number(state.currentPhase) + 1).padStart(2, '0')] ?? 'unknown'}".`,
      );
    }
    return {
      currentPhase: state.currentPhase,
      requiredGates: gates,
      nextPrompt,
      isFresh,
      instructions,
    };
  }

  function phaseOrder(state: StateDocument): readonly string[] {
    return [...state.completedPhases, state.currentPhase].sort();
  }

  return { advance, isNextPhase, freshSession, phaseOrder };
}
