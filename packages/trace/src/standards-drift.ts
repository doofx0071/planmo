import type { StandardRule } from '@planmo/schema';
import type {
  Diagnostic,
  StandardsDriftEngine,
  StandardsDriftInput,
} from './contracts.js';
import { countsOf, sortDiagnostics } from './contracts.js';

/**
 * Standards drift engine (P09-08, CHG-001 REQ-STD-001..004).
 *
 * Detects where the standards a project DECLARES and the standards actually
 * SELECTED for the current context have drifted:
 *
 * - DRF-001 declared-missing: a declared standard id is not selected;
 * - DRF-002 selected-undeclared: a selected standard id is not declared;
 * - DRF-003 unknown-class: a rule references a class not in known classes.
 *
 * PURE + deterministic: no filesystem; identical input → identical result.
 */

function diag(
  severity: Diagnostic['severity'],
  code: string,
  target: string,
  message: string,
  remediation: string,
): Diagnostic {
  return { severity, code, target, message, remediation };
}

export function standardsDriftEngine(): StandardsDriftEngine {
  return {
    analyze(input: StandardsDriftInput) {
      const out: Diagnostic[] = [];

      const declaredIds = new Set(input.declared.map((r) => r.id));
      const selectedById = new Map(input.selected.map((r) => [r.id, r]));

      // DRF-001: declared but not selected.
      for (const id of [...declaredIds].sort()) {
        if (!selectedById.has(id)) {
          out.push(
            diag(
              'warning',
              'DRF-001',
              id,
              `declared standard ${id} is not in the selected set`,
              `declare ${id} as selected via a standards pack, or remove the declaration`,
            ),
          );
        }
      }

      // DRF-002: selected but never declared.
      for (const id of [...selectedById.keys()].sort()) {
        if (!declaredIds.has(id)) {
          out.push(
            diag(
              'warning',
              'DRF-002',
              id,
              `selected standard ${id} is not declared`,
              `add ${id} to the declared standards, or confirm it is injected by a stack pack`,
            ),
          );
        }
      }

      // DRF-003: unknown class in either set.
      const known = new Set(input.knownClasses);
      for (const rule of [...input.declared, ...input.selected]) {
        if (rule.class !== undefined && !known.has(rule.class)) {
          out.push(
            diag(
              'error',
              'DRF-003',
              rule.id,
              `standard ${rule.id} references unknown class "${rule.class}"`,
              `retire the class or extend STANDARD_CLASSES with "${rule.class}"`,
            ),
          );
        }
      }

      return { diagnostics: sortDiagnostics(out), counts: countsOf(out) };
    },
  };
}

/** Convenience: breadth of drift as a single boolean (warnings+errors only). */
export function hasStandardsDrift(input: StandardsDriftInput): boolean {
  const { diagnostics } = standardsDriftEngine().analyze(input);
  return diagnostics.some((d) => d.severity === 'error' || d.severity === 'warning');
}

/** Unused-symbol guard (kept for lint symmetry). */
export type { StandardRule };