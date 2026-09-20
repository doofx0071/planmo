import type { HandoffDocument } from '@planmo/schema';
import type { MemorySource, SessionMemory, SessionMemoryRow } from './contracts.js';

/**
 * Session memory lifecycle (P08-08, CHG-001 REQ-MEM-001..010).
 *
 * Capture during a session is COLLECTION ONLY: recorded candidates never
 * become authoritative until consolidation (P08-09, consolidate.ts).
 * Canonical project state outranks memory (ADR-0013), so a memory row is
 * derived context — provenance + a compact declarative statement — never a
 * transcript. Raw chat/session text is NOT durable (REQ-MEM-005,
 * docs/14-context-memory/lifecycle.md: raw session transcripts are not
 * durable memory by default).
 *
 * PURE + deterministic: rows are carried in/out; v1 has no storage engine.
 * All emitted arrays are sorted by (source, id).
 */

/** Canonical provenance for task-completion evidence (lifecycle.md capture source). */
const TASKS_PROVENANCE = 'planning/tasks.csv';
/** Canonical provenance for accepted decisions (lifecycle.md capture source). */
const DECISIONS_PROVENANCE = 'planning/DECISIONS.md';
/** Handoff documents live under planning/handoffs/phase-<phase>-handoff.md. */
const PHASE_HANDOFF_TEMPLATE = 'planning/handoffs/phase-<phase>-handoff.md';

/** Deterministic ordering contract: every emitted row set is sorted (source, id). */
function bySourceThenId(a: SessionMemoryRow, b: SessionMemoryRow): number {
  return a.source.localeCompare(b.source) || a.id.localeCompare(b.id);
}

/**
 * Deterministic candidate id: cand-<source>-<NN>, zero-padded per source.
 * Candidates are NOT authoritative until consolidation re-ids them
 * (mem-<source>-<NN>, consolidate.ts).
 */
function candidateId(source: MemorySource, index: number): string {
  return `cand-${source}-${String(index).padStart(2, '0')}`;
}

/** Canonical provenance of the handoff document itself (phase from the doc). */
function handoffProvenance(doc: HandoffDocument): string {
  return PHASE_HANDOFF_TEMPLATE.replace('<phase>', doc.phase);
}

export function sessionMemory(): SessionMemory {
  return {
    /**
     * Open a session: deterministic start row set.
     *
     * v1 returns [] — the honest empty set. A fresh session has produced NO
     * durable evidence: raw chat and transcripts are not durable memory
     * (REQ-MEM-005), so nothing is captured here. This follows the Phase 06
     * precedent (memory-provider.ts): an explicit empty/no-op result rather
     * than fabricated memory. Rows, when the set is ever materialized, use
     * ids 'row-<sessionId>-<n>' zero-padded (deterministic per session).
     */
    beginSession(opts: { sessionId: string; startedAt: number }): SessionMemoryRow[] {
      void opts;
      return [];
    },

    /** Record a candidate: append + sort by (source, id). Pure. */
    record(
      rows: readonly SessionMemoryRow[],
      candidate: SessionMemoryRow,
    ): readonly SessionMemoryRow[] {
      return [...rows, candidate].sort(bySourceThenId);
    },

    /**
     * Candidates from the SIX allowed capture sources only (lifecycle.md:
     * task evidence, resolved blockers, decisions, material change
     * evidence, security findings, known debt — all carried by the
     * handoff). testsRun, git, status and instructions are process
     * metadata, not durable facts, and are NOT mapped.
     *
     * Every row carries provenance (canonical path or doc id) and
     * capturedAt: 0 — timestamps are injected/stamped at consolidation
     * (the frozen signature takes only the doc; time is always injected).
     */
    candidatesFromHandoff(doc: HandoffDocument): readonly SessionMemoryRow[] {
      const rows: SessionMemoryRow[] = [];
      const index = new Map<MemorySource, number>();
      const next = (source: MemorySource): number => {
        const n = index.get(source) ?? 0;
        index.set(source, n + 1);
        return n;
      };

      // completedTasks -> task-evidence, provenance planning/tasks.csv
      for (const task of doc.completedTasks) {
        rows.push({
          id: candidateId('task-evidence', next('task-evidence')),
          source: 'task-evidence',
          provenance: TASKS_PROVENANCE,
          capturedAt: 0,
          sensitivity: 'public',
          statement: `completed ${task}`,
        });
      }
      // blocked -> blocker-resolution, provenance = the phase handoff doc.
      // Blockers are internal resolution knowledge: sensitivity 'internal'.
      for (const blocker of doc.blocked) {
        rows.push({
          id: candidateId('blocker-resolution', next('blocker-resolution')),
          source: 'blocker-resolution',
          provenance: handoffProvenance(doc),
          capturedAt: 0,
          sensitivity: 'internal',
          statement: `blocked ${blocker.task}: ${blocker.reason}`,
        });
      }
      // decisions -> decision, provenance planning/DECISIONS.md
      for (const decision of doc.decisions) {
        rows.push({
          id: candidateId('decision', next('decision')),
          source: 'decision',
          provenance: DECISIONS_PROVENANCE,
          capturedAt: 0,
          sensitivity: 'public',
          statement: `decided ${decision}`,
        });
      }
      // materialChanges -> task-evidence; the changed path IS the provenance
      // (the file itself is the canonical source of the change).
      for (const path of doc.materialChanges) {
        rows.push({
          id: candidateId('task-evidence', next('task-evidence')),
          source: 'task-evidence',
          provenance: path,
          capturedAt: 0,
          sensitivity: 'public',
          statement: `changed ${path}`,
        });
      }
      // securityFindings -> task-evidence, provenance = the handoff doc.
      for (const finding of doc.securityFindings) {
        rows.push({
          id: candidateId('task-evidence', next('task-evidence')),
          source: 'task-evidence',
          provenance: handoffProvenance(doc),
          capturedAt: 0,
          sensitivity: 'public',
          statement: `finding ${finding}`,
        });
      }
      // knownDebt -> task-evidence, provenance = the handoff doc.
      for (const debt of doc.knownDebt) {
        rows.push({
          id: candidateId('task-evidence', next('task-evidence')),
          source: 'task-evidence',
          provenance: handoffProvenance(doc),
          capturedAt: 0,
          sensitivity: 'public',
          statement: `debt ${debt}`,
        });
      }

      return rows.sort(bySourceThenId);
    },

    /**
     * Mark stale any row whose source hash no longer matches the current
     * index (lifecycle.md freshness: stale derived context is invalidated).
     * Only rows WITH a sourceHash are prunable; rows without one are kept.
     * A provenance key absent from `current` cannot match its row's hash,
     * so the row is pruned (the source is no longer tracked). Pure.
     */
    pruneStale(
      rows: readonly SessionMemoryRow[],
      current: Record<string, string>,
    ): readonly SessionMemoryRow[] {
      return rows
        .filter((row) => row.sourceHash === undefined || current[row.provenance] === row.sourceHash)
        .sort(bySourceThenId);
    },
  };
}
