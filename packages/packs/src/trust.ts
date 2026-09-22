import type { TrustClassification, TrustInput } from './phase11-contracts.js';

/**
 * Deterministic pack trust classification (P11-01, REQ-TRUST-001/002).
 *
 * Every input maps to exactly one classification; identical inputs always
 * produce byte-identical output (reasons sorted, stable). The classifier is
 * the ONLY gate that validates declared trust levels: the schema alone
 * accepts any TrustLevel, so `verified-source` on a remote source is
 * downgraded here to `third-party` until a signing/curation design exists.
 *
 * Rules:
 * - builtin  => builtin, no review.
 * - local    => local, no review.
 * - remote (git/registry) => third-party, `requiresReview: true` ALWAYS
 *   (ADR-0021 community spirit: the review burden for remote packs cannot be
 *   disabled). Any declared `verified-source` (or other non-third-party
 *   level) on a remote is treated as a downgrade with an explicit reason, and
 *   a missing integrity checksum is always surfaced as a reason.
 */

const REASON_BUILTIN = 'builtin packs ship with PlanMo and require no review';
const REASON_LOCAL = 'local packs are authored on this machine and require no review';
const REASON_VERIFIED_SOURCE_DOWNGRADE =
  "declared 'verified-source' is reserved for a future signing design and is not assignable to remote packs; classified as third-party";
const REASON_NO_INTEGRITY =
  'remote pack has no integrity checksum; integrity is required for remote packs';
const REASON_INTEGRITY_PRESENT = 'remote pack integrity checksum is present';
const REASON_REVIEW_MANDATORY =
  'third-party packs always require review and this cannot be disabled';

function unassignableReason(level: string): string {
  return `declared trust level '${level}' is not assignable to remote packs; classified as third-party`;
}

/**
 * Classify a pack's trust level + review burden (REQ-TRUST-001/002).
 * Deterministic: same input => same TrustClassification, reasons sorted.
 */
export function classifyTrust(input: TrustInput): TrustClassification {
  if (input.source === 'builtin') {
    return { trustLevel: 'builtin', requiresReview: false, reasons: [REASON_BUILTIN] };
  }
  if (input.source === 'local') {
    return { trustLevel: 'local', requiresReview: false, reasons: [REASON_LOCAL] };
  }

  // Remote (git/registry): always third-party + mandatory review.
  const reasons: string[] = [];
  const declared = input.declaredTrust ?? input.provenance?.trustLevel;
  if (declared === 'verified-source') {
    reasons.push(REASON_VERIFIED_SOURCE_DOWNGRADE);
  } else if (declared !== undefined && declared !== 'third-party') {
    reasons.push(unassignableReason(declared));
  }
  if (input.provenance?.integrity === undefined) {
    reasons.push(REASON_NO_INTEGRITY);
  } else {
    reasons.push(REASON_INTEGRITY_PRESENT);
  }
  reasons.push(REASON_REVIEW_MANDATORY);
  reasons.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return { trustLevel: 'third-party', requiresReview: true, reasons };
}

/**
 * Deterministic one-line trust summary for reports/CLI, e.g.
 * `third-party (review required): <reason>; <reason>`.
 */
export function formatTrust(classification: TrustClassification): string {
  const burden = classification.requiresReview ? 'review required' : 'no review';
  return `${classification.trustLevel} (${burden}): ${classification.reasons.join('; ')}`;
}
