import type {
  DebtEngine,
  DebtInput,
  DebtRecord,
  Diagnostic,
  DiagnosticReport,
} from './contracts.js';
import { countsOf, sortDiagnostics } from './contracts.js';

/**
 * Technical debt engine (P09-09, CHG-001 REQ-DEBT).
 *
 * Findings over committed debt records
 * (docs/13-standards-quality/refactoring-technical-debt.md):
 *
 * - DEBT-001 warning  an 'open' record is past its target phase;
 * - DEBT-002 info     a record is scheduled for a target phase
 *                     ("scheduled for <target>");
 * - DEBT-003 warning  a record has no affected paths (poor traceability);
 * - DEBT-004 error    a record has an unknown status (not open/scheduled/closed).
 *
 * The CLI resolves the current phase; the frozen DebtInput shape has no
 * currentPhase field, so the engine reads an optional `currentPhase` (e.g.
 * "10" or "P10") when the caller supplies it. Phase ids compare numerically
 * by their leading integer ("09" < "10"); unparsable ids never fire DEBT-001.
 * The result extends DiagnosticReport with countsByStatus.
 *
 * PURE + deterministic: records visited in id order, keys sorted, no time/IO.
 */

/** Known debt statuses (refactoring-technical-debt.md). */
export const DEBT_STATUSES = ['open', 'scheduled', 'closed'] as const;

export interface DebtReport extends DiagnosticReport {
  /** Record counts per status value; keys sorted. */
  countsByStatus: Readonly<Record<string, number>>;
}

/** Debt engine as built here: frozen DebtEngine plus the extended report. */
export interface DebtEngineWithReport extends DebtEngine {
  analyze(input: DebtInput): DebtReport;
}

/** Callers may pass the resolved current phase on top of the frozen input. */
export type DebtInputWithPhase = DebtInput & { readonly currentPhase?: string };

/** Leading integer of a phase id, e.g. "10" -> 10; "P09" -> 9. */
function phaseNumber(phase: string): number | undefined {
  const match = /^\s*(\d+)/.exec(phase);
  return match === null ? undefined : Number(match[1]);
}

function diag(
  severity: Diagnostic['severity'],
  code: string,
  target: string,
  message: string,
  remediation: string,
): Diagnostic {
  return { severity, code, target, message, remediation };
}

export function debtEngine(): DebtEngineWithReport {
  return {
    analyze(input: DebtInput): DebtReport {
      const out: Diagnostic[] = [];
      const records: readonly DebtRecord[] = [...input.records].sort((a, b) =>
        a.id.localeCompare(b.id),
      );
      const known = new Set<string>(DEBT_STATUSES);
      const currentPhase = (input as DebtInputWithPhase).currentPhase;
      const current = currentPhase === undefined ? undefined : phaseNumber(currentPhase);

      for (const record of records) {
        // DEBT-001 — open past its target phase.
        if (record.status === 'open' && record.targetPhase !== undefined && current !== undefined) {
          const target = phaseNumber(record.targetPhase);
          if (target !== undefined && current > target) {
            out.push(
              diag(
                'warning',
                'DEBT-001',
                record.id,
                `debt ${record.id} is open past its target phase ${record.targetPhase}`,
                `resolve or re-scope ${record.id}: it was due by phase ${record.targetPhase} but the project is now at ${currentPhase}`,
              ),
            );
          }
        }

        // DEBT-002 — scheduled for a target phase.
        if (record.targetPhase !== undefined) {
          out.push(
            diag(
              'info',
              'DEBT-002',
              record.id,
              `debt ${record.id} is scheduled for ${record.targetPhase}`,
              `keep ${record.id} on the plan; revisit it when phase ${record.targetPhase} opens`,
            ),
          );
        }

        // DEBT-003 — missing affected paths.
        if (record.affectedPaths === undefined) {
          out.push(
            diag(
              'warning',
              'DEBT-003',
              record.id,
              `debt ${record.id} has no affected paths (poor traceability)`,
              `record affected_paths on ${record.id} so the debt stays traceable to the code it touches`,
            ),
          );
        }

        // DEBT-004 — unknown status.
        if (!known.has(record.status)) {
          out.push(
            diag(
              'error',
              'DEBT-004',
              record.id,
              `debt ${record.id} has unknown status "${record.status}"`,
              `use one of: ${DEBT_STATUSES.join(', ')}`,
            ),
          );
        }
      }

      // countsByStatus: every status value seen, keys sorted.
      const byStatus = new Map<string, number>();
      for (const record of records) {
        byStatus.set(record.status, (byStatus.get(record.status) ?? 0) + 1);
      }
      const countsByStatus: Record<string, number> = {};
      for (const status of [...byStatus.keys()].sort()) {
        const n = byStatus.get(status);
        if (n !== undefined) countsByStatus[status] = n;
      }

      const diagnostics = sortDiagnostics(out);
      return { diagnostics, counts: countsOf(diagnostics), countsByStatus };
    },
  };
}
