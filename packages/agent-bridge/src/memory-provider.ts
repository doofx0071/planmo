import type { MemoryProvider, MemoryRowView } from './providers.js';

/**
 * MemoryProvider implementation (P06-10, CHG-001 REQ-MEM-001..010).
 *
 * v1 has NO memory storage engine (addendum: "A hosted/vector memory service
 * is not required"). The provider reads durable memory rows from a
 * deterministic in-memory source (typically seeded from canonical docs) and
 * returns EXPLICIT no-op rows when the source has nothing — never fabricates
 * memory, never falls back to raw chat (REQ-MEM-001 authority, REQ-MEM-002
 * types: canonical outranks memory).
 */

/** Deterministic copy (never mutates the caller's array). */
function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

/**
 * Create a MemoryProvider over a deterministic row source. `rows` may be a
 * static array or a function producing rows for a context id; both are pure.
 */
export function createMemoryProvider(
  rows: readonly MemoryRowView[] | ((contextId: string) => readonly MemoryRowView[]),
): MemoryProvider {
  return {
    async relevant(contextId: string, limit: number): Promise<readonly MemoryRowView[]> {
      const source = typeof rows === 'function' ? rows(contextId) : [...rows];
      const relevant = [...source]
        .filter((row) => row.id.length > 0)
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, limit);

      if (relevant.length === 0) {
        // Explicit no-op row (REQ-MEM-001: canonical state is the authority;
        // an empty memory is honest, never fabricated).
        return [
          {
            id: 'no-durable-memory',
            kind: 'fact',
            summary: 'No durable memory records are available for this context.',
            source: 'canonical-project-state',
          },
        ];
      }
      return relevant;
    },
  };
}

/** Standard no-op rows for an empty memory (all canonical-authority facts). */
export function noMemoryRows(contextId: string): readonly MemoryRowView[] {
  return [
    {
      id: 'no-durable-memory',
      kind: 'fact',
      summary: `No durable memory records are available for context "${contextId}".`,
      source: 'canonical-project-state',
    },
  ];
}

/** Deterministic empty row set used to seed a brand-new project. */
export const EMPTY_MEMORY_ROWS: readonly MemoryRowView[] = [];

void sorted;
