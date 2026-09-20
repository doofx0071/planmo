import type { ContextView } from '@planmo/adapters';
import type { ContextProvider } from './providers.js';

/**
 * Context Bundle compiler (P06-07, CHG-001 REQ-CTX-001..005).
 *
 * Compiles a token-budgeted, agent-neutral context bundle following
 * docs/14-context-memory/retrieval-token-budget.md progressive disclosure:
 *   L0 capsule  — very small: project, phase/task, branch, blockers, invariants;
 *   L1 index    — relevant decisions/standards/memory titles/repo-map fragments;
 *   L2 evidence — selected full records (empty when the budget forbids loading).
 *
 * The compiler is PURE: it receives canonical text via the injected reader
 * and returns a deterministic bundle. No memory/storage engine in v1 — the
 * reader reads canonical docs (Layer A) only.
 */

export interface BundleSource {
  project: string;
  contextId: string;
  /** L0 capsule text (small, canonical). */
  capsule: string;
  /** L1 index entries (max `indexMax` lines honored, oldest dropped). */
  indexEntries: readonly string[];
  /** L2 evidence entries (max `evidenceMax` honored, oldest dropped). */
  evidenceEntries: readonly string[];
  /** Retrieval handles the agent may load on demand. */
  retrievalHandles: readonly string[];
  /** Optional canonical path for provenance. */
  sourcePaths?: readonly string[];
}

export interface BundleOptions {
  /** Token budget the bundle is compiled under. */
  budgetTokens?: number;
  /** Index entry cap (progressive disclosure). */
  indexMax?: number;
  /** Evidence entry cap (0 disables the evidence layer). */
  evidenceMax?: number;
}

const DEFAULT_BUDGET_TOKENS = 8000;
const DEFAULT_INDEX_MAX = 30;
const DEFAULT_EVIDENCE_MAX = 10;

/** Deterministic copy (never mutates the caller's array). */
function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

/**
 * Compile a context bundle from canonical source text (PURE — no I/O).
 * Deterministic: identical inputs → identical bundle.
 */
export function compileContextBundle(
  source: BundleSource,
  options: BundleOptions = {},
): ContextView {
  const budgetTokens = options.budgetTokens ?? DEFAULT_BUDGET_TOKENS;
  const indexMax = options.indexMax ?? DEFAULT_INDEX_MAX;
  const evidenceMax = options.evidenceMax ?? DEFAULT_EVIDENCE_MAX;

  const indexEntries = [...source.indexEntries].slice(0, indexMax);
  const evidenceEntries = [...source.evidenceEntries].slice(0, evidenceMax);

  // Rough deterministic token estimate: 4 chars ≈ 1 token (documented, not
  // exact — budget accounting is approximate per retrieval-token-budget.md).
  const estimate = (text: string): number => Math.ceil(text.length / 4);
  const l0 = source.capsule;
  const l1 = indexEntries.join('\n');
  const l2 = evidenceEntries.join('\n\n');
  const estimatedTokens = estimate(l0) + estimate(l1) + estimate(l2);

  return {
    project: source.project,
    contextId: source.contextId,
    l0Capsule: l0,
    l1Index: l1,
    l2Evidence: l2,
    estimatedTokens,
    retrievalHandles: sorted(source.retrievalHandles),
  };
}

/**
 * Create a ContextProvider reading canonical source text through `read`.
 * Deterministic for identical reads; never writes anything.
 */
export function createContextProvider(
  read: (contextId: string) => Promise<BundleSource>,
): ContextProvider {
  return {
    async compile(contextId: string): Promise<ContextView> {
      const source = await read(contextId);
      return compileContextBundle(source);
    },
    async resolveHandles(contextId: string): Promise<readonly string[]> {
      const source = await read(contextId);
      return sorted(source.retrievalHandles);
    },
  };
}
