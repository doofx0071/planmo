/**
 * Phase 11 FROZEN contracts for @planmo/agent-bridge (P11-06).
 *
 * Portable context/memory export-import + file-backed MemoryProvider
 * adapter. Do NOT edit during implementation; the lead deletes `declare`
 * stubs at integration (TS2308 guard).
 */
import type { ContextView } from '@planmo/adapters';
import type { MemoryRowView, MemoryProvider } from './providers.js';

/** Portable formats mandated by docs/14-context-memory/storage-portability.md. */
export type PortableFormat = 'json' | 'jsonl' | 'markdown';

/** Versioned portable container (single JSON document or JSONL row). */
export interface PortableMemoryDocument {
  format: 'planmo-memory';
  schemaVersion: 1;
  context?: Pick<ContextView, 'project' | 'contextId' | 'estimatedTokens'>;
  rows: readonly MemoryRowView[];
}

/** Deterministic export of a context + memory view into a portable format. */
export declare function exportMemoryPortable(
  view: Pick<ContextView, 'project' | 'contextId' | 'estimatedTokens'> | null,
  rows: readonly MemoryRowView[],
  format: PortableFormat,
): string;

/** Round-trip import; throws a descriptive error on malformed/stale input. */
export declare function importMemoryPortable(
  text: string,
  format: PortableFormat,
): PortableMemoryDocument;

/** File-backed MemoryProvider adapter over a portable rows source. */
export declare function createFileMemoryProvider(options: {
  /** Read the raw portable text for `contextId` (may be empty). */
  readText: (contextId: string) => Promise<string>;
  format: PortableFormat;
  limit?: number;
}): MemoryProvider;

export type { MemoryRowView, MemoryProvider, ContextView };