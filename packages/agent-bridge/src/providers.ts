import type { ContextView, PacketView, StandardView } from '@planmo/adapters';
import type { AiProposal } from '@planmo/schema';

/**
 * Agent-bridge contracts (Phase 06, P06-01/06-09/06-10).
 *
 * The bridge compiles canonical, schema-validated state into agent-neutral
 * views, validates AI output BEFORE it can affect project state, and
 * selects adapters by capability. Nothing here executes an agent CLI: the
 * bridge renders invocations and validates proposals; execution/spawning is
 * a consuming phase (Phase 08 workflow engine).
 */

// ------------------------------------------------------ context providers

/** Reads the canonical context bundle for a task (CHG-001 REQ-CTX-001..005). */
export interface ContextProvider {
  /** Compile the token-budgeted bundle for `contextId`. PURE-safe: may read
   *  canonical state but never writes; deterministic for identical inputs. */
  compile(contextId: string): Promise<ContextView>;
  /** Resolve retrieval handles to absolute paths the agent may load. */
  resolveHandles(contextId: string): Promise<readonly string[]>;
}

/** Reads durable project memory/layers for a task (CHG-001 REQ-MEM-*). */
export interface MemoryProvider {
  /** Layer-B durable memory rows relevant to `contextId`, bounded. */
  relevant(contextId: string, limit: number): Promise<readonly MemoryRowView[]>;
}

/** Agent-neutral memory row (structural view, never raw chat). */
export interface MemoryRowView {
  id: string;
  kind: 'decision' | 'lesson' | 'fact' | 'warning';
  summary: string;
  /** Provenance: canonical doc/commit that produced this row. */
  source: string;
}

// --------------------------------------------------------- standards inject

/** Renders the selected standards into the adapter prompt (REQ-STD). */
export interface StandardsInjector {
  /** Deterministic readable rendering of the selected standards. */
  render(standards: readonly StandardView[]): string;
}

// -------------------------------------------------- execution packet view

/** Renders an execution packet for a worker (CHG-001 REQ-WRK-*). */
export interface PacketRenderer {
  /** Deterministic readable rendering of a work packet + context. */
  render(packet: PacketView, context: ContextView): string;
}

// ------------------------------------------------------------ proposals

/** Result of validating an AI proposal at the bridge boundary. */
export interface ProposalValidation {
  ok: boolean;
  /** Parsed proposal when `ok`; always present for rejected input too. */
  proposal?: AiProposal;
  /** Diagnostics for rejected proposals (never empty when !ok). */
  errors?: readonly string[];
}

/** Validates AI output strictly BEFORE it can affect project state (P06-06). */
export interface ProposalValidator {
  validate(raw: unknown): ProposalValidation;
}
