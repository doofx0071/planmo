import type { SessionMemoryRow } from '@planmo/workflow';
import type {
  Diagnostic,
  DiagnosticReport,
  MemoryHealthEngine,
  MemoryHealthInput,
} from './contracts.js';
import { countsOf, sortDiagnostics } from './contracts.js';

/**
 * Memory/context health engine (P09-10, CHG-001 REQ-MEM).
 *
 * Index health over consolidated memory rows:
 *
 * - MEM-001 warning  a row's sourceHash no longer matches currentHashes for
 *                    its provenance (source changed — row is stale);
 * - MEM-002 warning  a row's provenance is missing from currentHashes
 *                    entirely (dangling provenance);
 * - MEM-003 info     no memory rows have been consolidated yet;
 * - MEM-004 error    duplicate (source, provenance) pairs (index integrity —
 *                    dedupe needed);
 * - MEM-005 info     the index is rebuildable (rows carry source hashes).
 *
 * MEM-001 fires only when the provenance key EXISTS with a different hash;
 * a missing key is MEM-002's concern, so a row is never double-flagged as
 * both stale and dangling. The result extends DiagnosticReport with
 * rebuildRecommended (true iff at least one row carries a sourceHash).
 *
 * PURE + deterministic: rows visited in (source, provenance, id) order,
 * duplicate pairs detected order-independently, no time or IO.
 */

export interface MemoryHealthReport extends DiagnosticReport {
  /** True when at least one row carries a sourceHash (index rebuildable). */
  rebuildRecommended: boolean;
}

/** Memory health engine as built here: frozen interface plus the extended report. */
export interface MemoryHealthEngineWithReport extends MemoryHealthEngine {
  analyze(input: MemoryHealthInput): MemoryHealthReport;
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

export function memoryHealthEngine(): MemoryHealthEngineWithReport {
  return {
    analyze(input: MemoryHealthInput): MemoryHealthReport {
      const out: Diagnostic[] = [];
      const rows: readonly SessionMemoryRow[] = [...input.rows].sort(
        (a, b) =>
          a.source.localeCompare(b.source) ||
          a.provenance.localeCompare(b.provenance) ||
          a.id.localeCompare(b.id),
      );

      // MEM-003 — no memory yet.
      if (rows.length === 0) {
        out.push(
          diag(
            'info',
            'MEM-003',
            'memory',
            'no memory rows have been consolidated yet',
            'consolidate a handoff to create the first durable memory rows',
          ),
        );
      }

      // MEM-005 — rebuildable index (rows carry source hashes).
      const hashed = rows.filter((row) => row.sourceHash !== undefined);
      const rebuildRecommended = hashed.length > 0;
      if (rebuildRecommended) {
        out.push(
          diag(
            'info',
            'MEM-005',
            'memory',
            `memory index is rebuildable (${hashed.length} of ${rows.length} rows carry source hashes)`,
            'rebuild the index from the authoritative sources behind currentHashes',
          ),
        );
      }

      // MEM-001/MEM-002 — staleness + dangling provenance.
      for (const row of rows) {
        const current = input.currentHashes[row.provenance];
        if (current === undefined) {
          out.push(
            diag(
              'warning',
              'MEM-002',
              row.id,
              `memory ${row.id} references provenance ${row.provenance} which is missing from currentHashes`,
              `re-add ${row.provenance} to the hash index or remove rows derived from it`,
            ),
          );
        } else if (row.sourceHash !== undefined && row.sourceHash !== current) {
          out.push(
            diag(
              'warning',
              'MEM-001',
              row.id,
              `memory ${row.id} is stale: source ${row.provenance} changed (hash ${row.sourceHash} != ${current})`,
              `re-consolidate ${row.provenance} and refresh the row's sourceHash to ${current}`,
            ),
          );
        }
      }

      // MEM-004 — duplicate (source, provenance) pairs.
      const byPair = new Map<string, SessionMemoryRow[]>();
      for (const row of rows) {
        const key = `${row.source}\u0000${row.provenance}`;
        const group = byPair.get(key);
        if (group === undefined) {
          byPair.set(key, [row]);
        } else {
          group.push(row);
        }
      }
      for (const key of [...byPair.keys()].sort()) {
        const group = byPair.get(key);
        if (group === undefined || group.length < 2) continue;
        const source = key.split('\u0000')[0] ?? '';
        const provenance = key.split('\u0000')[1] ?? '';
        out.push(
          diag(
            'error',
            'MEM-004',
            `${source}/${provenance}`,
            `duplicate (source, provenance) pair ${source} / ${provenance} (${group.length} rows); dedupe needed`,
            `dedupe rows for (${source}, ${provenance}), keeping the newest statement per source`,
          ),
        );
      }

      const diagnostics = sortDiagnostics(out);
      return { diagnostics, counts: countsOf(diagnostics), rebuildRecommended };
    },
  };
}
