import { ChangePackageSchema } from '@planmo/schema';
import type { ChangePackage } from '@planmo/schema';
import type { ChangeEngine, ChangeEngineResult } from './contracts.js';

/**
 * Change Engine workflow (P08-11, CHG-001 REQ-CHG-001..004).
 *
 * Mirrors docs/15-change-governance/change-engine.md:
 *   planmo change new <slug>      -> proposed package (>=1 ADDED/MODIFIED/REMOVED delta)
 *   planmo change apply CHG-...   -> accepted+applied, decision stamped (provenance)
 *   planmo change archive CHG-... -> archived (preserved)
 *
 * Every transition re-validates against ChangePackageSchema; no silent
 * rewrites — status moves are explicit and carry provenance. PURE + deterministic.
 */
export function changeEngine(): ChangeEngine {
  function newChange(input: {
    id: string;
    slug: string;
    proposal: string;
    requirementDeltas: ChangePackage['requirementDeltas'];
  }): ChangeEngineResult {
    const change = ChangePackageSchema.safeParse({
      schemaVersion: 1,
      id: input.id,
      status: 'proposed',
      slug: input.slug,
      proposal: input.proposal,
      requirementDeltas: input.requirementDeltas,
    });
    if (!change.success) {
      return {
        ok: false,
        reason: `invalid change package: ${change.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      };
    }
    return { ok: true, change: change.data };
  }

  function apply(change: ChangePackage, decision: string): ChangeEngineResult {
    if (change.status !== 'proposed' && change.status !== 'accepted') {
      return {
        ok: false,
        reason: `cannot apply ${change.id}: status is "${change.status}" (expected proposed/accepted)`,
      };
    }
    const next = ChangePackageSchema.safeParse({
      ...change,
      status: 'applied',
      decision,
    });
    if (!next.success) {
      return {
        ok: false,
        reason: `apply failed schema validation: ${next.error.issues.map((i) => i.message).join('; ')}`,
      };
    }
    return { ok: true, change: next.data };
  }

  function archive(change: ChangePackage): ChangeEngineResult {
    if (change.status !== 'applied') {
      return {
        ok: false,
        reason: `cannot archive ${change.id}: status is "${change.status}" (expected applied)`,
      };
    }
    const next = ChangePackageSchema.safeParse({ ...change, status: 'archived' });
    if (!next.success) {
      return {
        ok: false,
        reason: `archive failed schema validation: ${next.error.issues.map((i) => i.message).join('; ')}`,
      };
    }
    return { ok: true, change: next.data };
  }

  return { newChange, apply, archive };
}
