import { z } from 'zod';
import { NonEmptyString, versionedObject } from './common.js';

/**
 * AI proposal + context bundle schemas (Phase 06).
 *
 * AI output NEVER directly affects canonical state: proposals are
 * schema-validated at the agent-bridge boundary BEFORE any write (exit gate
 * "AI proposals are schema-validated before affecting project state").
 * Anything that fails AiProposalSchema is rejected with diagnostics; nothing
 * is partially applied.
 */

// ------------------------------------------------------- AI proposal (P06-06)

export const PROPOSAL_ITEM_STATUSES = ['proposed', 'accepted', 'rejected'] as const;
export type ProposalItemStatus = (typeof PROPOSAL_ITEM_STATUSES)[number];

const ProposalItem = z.strictObject({
  id: NonEmptyString,
  status: z.enum(PROPOSAL_ITEM_STATUSES).default('proposed'),
  summary: NonEmptyString,
  /** Optional rationale / evidence from the proposing agent. */
  rationale: NonEmptyString.optional(),
  /** Pack refs or requirement ids the item relates to. */
  references: z.array(NonEmptyString).default([]),
});

/**
 * A bounded, schema-validated proposal produced by an agent adapter through
 * `@planmo/agent-bridge`. Strict: unknown keys fail. Only `summary`, `id`,
 * and `status` are structural; the rest is optional metadata.
 */
export const AiProposalSchema = versionedObject({
  /** Agent id that produced the proposal, e.g. "opencode". */
  agent: NonEmptyString,
  /** The task / request this proposal answers. */
  requestId: NonEmptyString,
  /**
   * Proposed changes are DELTAS, not commands: each item states what should
   * change and why. The workflow engine (Phase 08) interprets/approves them;
   * the agent bridge never applies them directly.
   */
  items: z.array(ProposalItem).default([]),
});

export type AiProposal = z.infer<typeof AiProposalSchema>;

// -------------------------------------------------- context bundle (P06-07)

export const CONTEXT_LEVELS = ['capsule', 'index', 'evidence'] as const;
export type ContextLevel = (typeof CONTEXT_LEVELS)[number];

/**
 * A token-budgeted, agent-neutral context bundle (CHG-001 REQ-CTX-001..005,
 * ADR-0013/0014, docs/14-context-memory/retrieval-token-budget.md).
 *
 * Progressive disclosure:
 * - capsule — very small: project, phase/task, branch, blockers, invariants;
 * - index   — relevant decisions/standards/memory titles/repo-map fragments;
 * - evidence— selected full records (loaded on demand when budget allows).
 *
 * Portable: plain strings + numbers, no agent-specific structure — every
 * adapter and the generic prompt receive the same bytes.
 */
export const ContextBundleSchema = versionedObject({
  /** Project root identifier this bundle was compiled for. */
  project: NonEmptyString,
  /** The task/phase context the bundle was compiled for. */
  contextId: NonEmptyString,
  l0Capsule: NonEmptyString,
  l1Index: NonEmptyString,
  /** Evidence layer — may be empty when the budget forbids loading it. */
  l2Evidence: z.string().default(''),
  /** Approximate token count (used for budget accounting, never exact). */
  estimatedTokens: z.number().int().nonnegative(),
  /** Budget the bundle was compiled under (CHG-001 token budget). */
  budgetTokens: z.number().int().nonnegative().default(8000),
  /**
   * Layer-A file references the receiving agent may load on demand (retrieval
   * handles). Paths relative to the project root, forward slashes.
   */
  retrievalHandles: z.array(NonEmptyString).default([]),
});

export type ContextBundle = z.infer<typeof ContextBundleSchema>;
