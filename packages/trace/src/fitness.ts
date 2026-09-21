import type { Diagnostic, FitnessEngine, FitnessRule, FitnessViolation } from './contracts.js';
import { countsOf, sortDiagnostics } from './contracts.js';

/**
 * Architecture fitness engine (P09-07, CHG-001 REQ-ARCH-001..002).
 *
 * Evaluates machine-readable rules over declared dependency edges and emits
 * violations carrying rule ID, dependency path, affected requirement/ADR and
 * a remediation hint (docs/13-standards-quality/architecture-fitness.md).
 *
 * Rules checked (deterministic, in this order):
 * - FIT-001 undeclared dependency: observed edge not in allowedEdges;
 * - FIT-002 cycle: registered cycle edges (caller detected via graph walk);
 * - FIT-003 generated import: importing from a dist/ build output.
 *
 * PURE: the caller supplies observed edges/cycles; no filesystem access.
 * Diagnostics sorted severity > code; violations carry remediation always.
 */

function violation(
  ruleId: number,
  rule: string,
  path: string,
  reference: string | undefined,
  remediation: string,
): FitnessViolation {
  const code = `FIT-${String(ruleId).padStart(3, '0')}` as const;
  return {
    rule,
    code,
    severity: 'error',
    target: path,
    path,
    message: `${rule}: dependency path violates architecture fitness rules`,
    ...(reference !== undefined ? { reference } : {}),
    remediation,
  };
}

function edgeKey(from: string, to: string): string {
  return `${from} -> ${to}`;
}

export function fitnessEngine(): FitnessEngine {
  return {
    evaluate(rules: FitnessRule): {
      diagnostics: readonly Diagnostic[];
      counts: Record<'error' | 'warning' | 'info', number>;
    } {
      const out: FitnessViolation[] = [];
      const seen = new Set<string>();

      const allowed = rules.allowedEdges ?? {};
      const observed = rules.observedEdges ?? {};

      // FIT-001: every observed edge must be declared allowed.
      for (const from of Object.keys(observed).sort()) {
        for (const to of [...(observed[from] ?? [])].sort()) {
          const key = edgeKey(from, to);
          if (seen.has(key)) continue;
          seen.add(key);
          const allowedTargets = allowed[from] ?? [];
          if (!allowedTargets.includes(to)) {
            out.push(
              violation(
                1,
                'FIT-001',
                key,
                undefined,
                `add "${to}" to the allowed edges of "${from}" in the boundary graph, or remove the import`,
              ),
            );
          }
        }
      }

      // FIT-002: cycles.
      for (const cycle of [...(rules.cycles ?? [])].sort()) {
        const key = `cycle:${cycle}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(
          violation(
            2,
            'FIT-002',
            cycle,
            undefined,
            `break the cycle with a shared low-level package or invert the dependency`,
          ),
        );
      }

      // FIT-003: generated imports (dist/).
      for (const imp of [...(rules.generatedImports ?? [])].sort()) {
        const key = `generated:${imp}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(
          violation(
            3,
            'FIT-003',
            imp,
            undefined,
            `import the source entry point instead of the generated dist output`,
          ),
        );
      }

      const diagnostics = sortDiagnostics(out);
      return { diagnostics, counts: countsOf(diagnostics) };
    },
  };
}
