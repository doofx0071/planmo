import type { HandoffDocument } from '@planmo/schema';
import type { MemoryConsolidator, SessionMemoryRow } from './contracts.js';
import { sessionMemory } from './session-memory.js';

/**
 * Handoff-to-memory consolidation (P08-09, CHG-001 REQ-MEM-001..010).
 *
 * Turns a schema-valid HandoffDocument into durable memory rows following
 * lifecycle.md session-close steps: identify durable deltas -> deduplicate
 * -> attach provenance + classify sensitivity (handled by
 * candidatesFromHandoff) -> write accepted memories -> supersede outdated
 * memories. NEVER durably persists raw chat.
 *
 * Layout: one row per (source, provenance). Identical duplicate statements
 * collapse to the first (the sorted candidate input makes the first
 * deterministic); a CHANGED statement for the same provenance SUPERSEDES
 * the earlier one — later sort position wins. Consolidation ORDER is the
 * supersession signal: the newest statement about a canonical provenance is
 * authoritative in v1 (the frozen row shape carries no superseded_by field;
 * history lives in the canonical docs, ADR-0013). The full record of every
 * handoff field remains in the canonical artifacts; memory holds the newest
 * statement per source/provenance plus the provenance pointer.
 *
 * PURE + deterministic: identical doc + opts produce byte-identical rows,
 * sorted by (source, id).
 */
export function memoryConsolidator(): MemoryConsolidator {
  function consolidate(
    doc: HandoffDocument,
    opts?: { sessionId?: string; now?: number },
  ): readonly SessionMemoryRow[] {
    const candidates = sessionMemory().candidatesFromHandoff(doc);

    // Dedupe + supersede in one pass over the sorted candidate order:
    // - identical (source, provenance, statement): duplicate — first wins;
    // - same provenance, different statement: supersession — the later
    //   sort position replaces the earlier statement (see header).
    const kept = new Map<string, SessionMemoryRow>();
    for (const row of candidates) {
      const key = `${row.source}\u0000${row.provenance}`;
      const prev = kept.get(key);
      if (prev === undefined || prev.statement !== row.statement) {
        kept.set(key, row);
      }
    }

    const now = opts?.now ?? 0; // time always injected; 0 = un-stamped
    const perSource = new Map<SessionMemoryRow['source'], number>();
    const rows: SessionMemoryRow[] = [];
    for (const row of kept.values()) {
      const n = perSource.get(row.source) ?? 0;
      perSource.set(row.source, n + 1);
      rows.push({
        ...row,
        // Durable id: mem-<source>-<n>, zero-padded per source. `sessionId`
        // (if ever provided) is reserved for future scoping; v1 ids are
        // provenance-bound, not session-bound.
        id: `mem-${row.source}-${String(n).padStart(2, '0')}`,
        capturedAt: now,
        sensitivity: row.source === 'blocker-resolution' ? 'internal' : 'public',
      });
    }
    return rows.sort((a, b) => a.source.localeCompare(b.source) || a.id.localeCompare(b.id));
  }

  return { consolidate };
}
