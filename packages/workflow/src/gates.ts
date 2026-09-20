import type { GateDefinition, GateEvaluator, GateVerdict } from './contracts.js';

/**
 * Human/blocking gates (P08-05).
 *
 * Gates that require human approval or artifacts stay RED until explicitly
 * satisfied. The evaluator is PURE: it cannot stat the filesystem, so
 * artifact presence is ATTESTED by the caller through the approvals map —
 * a gate passes only when `approvals[gate.id] === true` (and then only if
 * the gate declares a blocking constraint; unconstrained gates are
 * documentation-only and pass trivially). Deterministic: verdicts are
 * scoped to `opts.phase` and sorted by gate id.
 */

/** Compare gate ids byte-wise (deterministic, locale-independent). */
function byId(a: GateDefinition, b: GateDefinition): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function blockedVerdict(gate: GateDefinition): GateVerdict {
  const hasHuman = gate.humanApproval === true;
  const paths = gate.requires ? [...gate.requires].sort() : [];
  const hasArtifacts = paths.length > 0;

  const reasons: string[] = [];
  if (hasHuman) reasons.push('requires human approval');
  if (hasArtifacts) reasons.push(`requires artifacts: ${paths.join(', ')}`);

  const steps: string[] = [];
  if (hasHuman && hasArtifacts) {
    steps.push(
      `Set approvals["${gate.id}"] = true once the requirement is met and the required paths exist and are clean (${paths.join(', ')}).`,
    );
  } else if (hasHuman) {
    steps.push(`Set approvals["${gate.id}"] = true once the requirement is met.`);
  } else {
    steps.push(
      `Confirm the required paths exist and are clean, then set approvals["${gate.id}"] = true (${paths.join(', ')}).`,
    );
  }

  return {
    gate: gate.id,
    phase: gate.phase,
    passed: false,
    reason: `gate "${gate.id}" (phase "${gate.phase}") blocked: ${reasons.join('; ')}`,
    unblock: steps,
  };
}

export function gateEvaluator(): GateEvaluator {
  function evaluate(
    gates: readonly GateDefinition[],
    opts: { phase: string; approvals: Record<string, boolean> },
  ): readonly GateVerdict[] {
    const inScope = gates
      .filter((g) => g.phase === opts.phase)
      .slice()
      .sort(byId);

    const verdicts: GateVerdict[] = [];
    for (const gate of inScope) {
      const hasConstraint =
        gate.humanApproval === true || (gate.requires !== undefined && gate.requires.length > 0);
      if (!hasConstraint || opts.approvals[gate.id] === true) {
        verdicts.push({ gate: gate.id, phase: gate.phase, passed: true });
      } else {
        verdicts.push(blockedVerdict(gate));
      }
    }
    return verdicts;
  }

  return { evaluate };
}
