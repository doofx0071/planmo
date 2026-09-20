import { AiProposalSchema } from '@planmo/schema';
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
