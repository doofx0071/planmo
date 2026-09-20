import { compileContextBundle } from '@planmo/agent-bridge';
import type { NextComposeInput, NextComposer, NextSession } from './contracts.js';
import { PROMPT_BY_PHASE, STANDARD_EXIT_GATES } from './transition.js';

/**
 * `planmo next` composer (P08-03 + P08-10, CHG-001).
 *
 * Produces the deterministic next-session context: the directive, ordered
 * steps from canonical inputs (state + handoff + next prompt text), and a
 * token-budgeted agent-neutral context bundle compiled with the agent-bridge
 * compiler (progressive disclosure L0/L1/L2, ADR-0013/0014). PURE: no I/O,
 * no memory consultation — canonical state only.
 */

const DEFAULT_BUDGET = 8000;

export function nextComposer(): NextComposer {
  function compose(input: NextComposeInput): NextSession {
    const { state } = input;
    const phase = state.currentPhase;
    const budgetTokens = input.budgetTokens ?? DEFAULT_BUDGET;
    const nextPrompt = PROMPT_BY_PHASE[phase] ?? input.state.nextPrompt ?? '';

    // Blockers: canonical signals that work cannot proceed safely.
    const blockers: string[] = [];
    if (input.handoff && input.handoff.blocked.length > 0) {
      blockers.push(
        ...input.handoff.blocked.map((b) => `BLOCKED ${b.task}: ${b.reason}`),
      );
    }
    for (const task of state.blockedTasks) {
      blockers.push(`BLOCKED ${task} (state.blockedTasks)`);
    }

    // Ordered steps: gates for the phase, then the handoff instruction if any.
    const steps: string[] = [];
    for (const gate of STANDARD_EXIT_GATES) {
      steps.push(`Meet exit gate "${gate}" for phase "${phase}".`);
    }
    if (input.handoff) {
      steps.push(`Follow the previous handoff's instructions (phase ${input.handoff.phase}).`);
      for (const debt of input.handoff.knownDebt) {
        steps.push(`Address known debt: ${debt}`);
      }
    }
    if (input.nextPromptText && input.nextPromptText.length > 0) {
      const lines = input.nextPromptText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length > 0) {
        steps.push(`Phase prompt: ${nextPrompt}`);
        steps.push(`Read prompt instructions at "${nextPrompt}".`);
      }
    }

    const directive = blockers.length > 0
      ? `Phase ${phase}: clear ${blockers.length} blocker(s) before progressing.`
      : `Work phase ${phase}; meet all exit gates and record the handoff.`;

    // Token-budgeted context bundle (progressive disclosure; L2 capped by budget).
    const indexEntries = [
      `phase: ${phase}`,
      ...steps,
      ...(input.handoff
        ? input.handoff.materialChanges.map((c) => `changed: ${c}`)
        : []),
    ];
    const evidenceEntries = input.handoff ? [input.handoff.completedTasks.join(', ')] : [];
    const bundle = compileContextBundle(
      {
        project: 'planmo',
        contextId: `phase-${phase}`,
        capsule: `${directive}\n${nextPrompt}`,
        indexEntries,
        evidenceEntries,
        retrievalHandles: [nextPrompt].filter(Boolean),
        ...(input.handoff ? { sourcePaths: [`planning/handoffs/phase-${phase}-handoff.md`] } : {}),
      },
      { budgetTokens, indexMax: 30, evidenceMax: 5 },
    );

    return {
      directive,
      phase,
      steps,
      bundle,
      budgetTokens,
      blockers,
    };
  }

  return { compose };
}