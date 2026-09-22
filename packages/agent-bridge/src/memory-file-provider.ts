/**
 * File-backed MemoryProvider adapter (P11-06, CHG-001).
 *
 * Reads durable memory rows from a portable text file (JSON / JSONL /
 * Markdown, see docs/14-context-memory/storage-portability.md) and serves
 * them through the standard MemoryProvider interface.
 *
 * The adapter never fabricates rows (REQ-MEM-001): empty or unparseable
 * source text yields the standard explicit no-op rows, exactly like the
 * in-memory provider. A read failure is treated the same way — a missing
 * portable file is an ordinary, expected state, not an error worth crashing
 * context compilation over.
 */
import { importMemoryPortable, type PortableFormat } from './memory-portable.js';
import { noMemoryRows } from './memory-provider.js';
import type { MemoryProvider, MemoryRowView } from './providers.js';

export type { PortableFormat, PortableMemoryDocument } from './memory-portable.js';

export interface FileMemoryProviderOptions {
  /** Read the raw portable text for `contextId` (may be empty). */
  readText: (contextId: string) => Promise<string>;
  format: PortableFormat;
  limit?: number;
}

/**
 * Create a MemoryProvider over a portable rows source.
 *
 * `relevant(contextId, limit)` reads the raw text, imports and validates
 * it, filters rows with a nonempty id, sorts by id, and slices to
 * `min(limit, configured limit)`. Empty/unparseable/absent sources return
 * the standard no-op row — never fabricated memory.
 */
export function createFileMemoryProvider(options: FileMemoryProviderOptions): MemoryProvider {
  return {
    async relevant(contextId: string, limit: number): Promise<readonly MemoryRowView[]> {
      let text: string;
      try {
        text = await options.readText(contextId);
      } catch {
        return noMemoryRows(contextId);
      }

      if (text.trim().length === 0) {
        return noMemoryRows(contextId);
      }

      let rows: readonly MemoryRowView[];
      try {
        rows = importMemoryPortable(text, options.format).rows;
      } catch {
        // Unparseable source: honest no-op (REQ-MEM-001), never fabricated.
        return noMemoryRows(contextId);
      }

      const configured = options.limit ?? Number.POSITIVE_INFINITY;
      const take = Math.max(0, Math.min(limit, configured));
      const relevant: MemoryRowView[] = [...rows]
        .filter((row) => row.id.length > 0)
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, take);

      if (relevant.length === 0) {
        return noMemoryRows(contextId);
      }
      return relevant;
    },
  };
}

export type { ContextView } from '@planmo/adapters';
