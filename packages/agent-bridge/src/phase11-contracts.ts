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
// Implementation: ./memory-portable.ts

export type { MemoryRowView, MemoryProvider, ContextView };
