import { AiProposalSchema, type AiProposal } from '@planmo/schema';
import type { ProposalValidation, ProposalValidator } from './providers.js';

/**
 * Strict AI proposal validation (P06-06, critical).
 *
 * AI output NEVER affects canonical project state directly: any raw agent
 * output must pass AiProposalSchema at the bridge boundary. Strict objects
 * reject unknown keys, so a proposal cannot smuggle commands/fields past
 * validation. Diagnostics are exact and actionable; nothing partial.
 */
export const proposalValidator: ProposalValidator = {
  validate(raw: unknown): ProposalValidation {
    const result = AiProposalSchema.safeParse(raw);
    if (result.success) {
      return { ok: true, proposal: result.data };
    }
    const errors = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    return { ok: false, errors };
  },
};

/** Convenience alias: validate raw agent output against AiProposalSchema. */
export function validateProposal(raw: unknown): ProposalValidation {
  return proposalValidator.validate(raw);
}

/**
 * Where an accepted proposal is recorded.
 *
 * A proposal is durable input to the plan, so it is kept in PlanMo's own state
 * directory rather than in the generated planning tree (which the manifest owns
 * and the validator checks against a fixed document set).
 */
export const PROPOSALS_DIR = '.planmo/proposals';

/**
 * A filesystem-safe name for a proposal, derived from its `requestId`.
 *
 * `requestId` is free text from an agent ("<what you were asked>"), so it can
 * contain `/`, `..`, NUL, or nothing usable at all. Slugging it here means a
 * proposal can never name a path outside `.planmo/proposals/` — path traversal
 * is prevented by construction, not by a check that could be forgotten. The safe
 * writer's containment check is the second guard.
 *
 * Deterministic and stable: the same request always names the same file, so
 * re-applying an unchanged proposal is a no-op rather than a second copy.
 */
export function proposalSlug(requestId: string): string {
  const slug = requestId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return slug === '' ? 'proposal' : slug;
}

/** The workspace-relative path a proposal is recorded at. */
export function proposalRecordPath(requestId: string): string {
  return `${PROPOSALS_DIR}/${proposalSlug(requestId)}.json`;
}

/**
 * The exact bytes recorded for an accepted proposal.
 *
 * No timestamp: the record must be deterministic so re-applying an unchanged
 * proposal produces identical bytes and is a no-op, and so the file is safe to
 * diff and commit.
 */
export function renderProposalRecord(proposal: AiProposal): string {
  return `${JSON.stringify(proposal, null, 2)}\n`;
}
