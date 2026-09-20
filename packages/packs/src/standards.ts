import {
  STANDARD_PRECEDENCE,
  type EngineeringPolicyEntry,
  type StandardPrecedence,
  type StandardRule,
} from '@planmo/schema';
import type { LoadedPack } from './loader.js';

/**
 * Standards & policy selection (CHG-001 P04-06/07).
 *
 * Implements the deterministic standards engine from
 * docs/13-standards-quality/standards-engine.md:
 * - structural standard classes;
 * - deterministic precedence tiers (explicit project policy > package-local >
 *   project > security > stack-framework > language > global-default);
 * - conflicts are SURFACED, never silently resolved by an LLM.
 */

export interface SelectionContext {
  stack?: readonly string[];
  domain?: readonly string[];
  risk?: 'low' | 'medium' | 'high';
  testTypes?: readonly string[];
}

export interface ConflictDiagnostic {
  code: 'duplicate-rule-id' | 'precedence-collision';
  ruleId: string;
  refs: string[];
  message: string;
}

export interface StandardsSelection {
  /** Rules applicable to the context, sorted by precedence tier then id. */
  rules: StandardRule[];
  /** Conflicts surfaced — caller decides policy, never silent resolution. */
  conflicts: ConflictDiagnostic[];
  /** Pack refs that contributed standards. */
  sources: string[];
}

const PRECEDENCE_RANK: Readonly<Record<StandardPrecedence, number>> = {
  'explicit-project-policy': 0,
  'package-local': 1,
  project: 2,
  security: 3,
  'stack-framework': 4,
  language: 5,
  'global-default': 6,
};

/** True if a rule's appliesTo matches the context (empty appliesTo = universal). */
function ruleApplies(rule: StandardRule, ctx: SelectionContext): boolean {
  const a = rule.appliesTo;
  if (!a) return true;
  if (a.stack && a.stack.length > 0 && !a.stack.some((s) => ctx.stack?.includes(s))) return false;
  if (a.domain && a.domain.length > 0 && !a.domain.some((d) => ctx.domain?.includes(d)))
    return false;
  if (a.risk && a.risk.length > 0 && !(ctx.risk && a.risk.includes(ctx.risk))) return false;
  if (
    a.testTypes &&
    a.testTypes.length > 0 &&
    !a.testTypes.some((t) => ctx.testTypes?.includes(t))
  ) {
    return false;
  }
  return true;
}

/** Deterministic precedence comparison for sorting. */
function compareRules(a: StandardRule, b: StandardRule): number {
  const rankDiff = PRECEDENCE_RANK[a.precedence] - PRECEDENCE_RANK[b.precedence];
  if (rankDiff !== 0) return rankDiff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function policyToPrecedence(scope: EngineeringPolicyEntry['scope']): StandardPrecedence {
  switch (scope) {
    case 'project':
      return 'project';
    case 'package':
      return 'package-local';
    case 'stack':
      return 'stack-framework';
    case 'global':
      return 'global-default';
  }
}

/**
 * Select standards + engineering policies applicable to `ctx` from a set of
 * loaded packs (standards/policy categories), applying deterministic
 * precedence. Duplicate rule ids with differing content produce a surfaced
 * conflict, never a silent winner.
 */
export function selectStandards(
  packs: readonly LoadedPack[],
  ctx: SelectionContext,
): StandardsSelection {
  const rules: StandardRule[] = [];
  const policies: EngineeringPolicyEntry[] = [];
  const sources = new Set<string>();

  for (const pack of packs) {
    const shape = pack.contentShape;
    if (!shape) continue;
    if (shape.category === 'standards') {
      sources.add(pack.document.ref);
      const standards = shape.content.standards;
      for (const rule of standards) {
        if (ruleApplies(rule, ctx)) rules.push(rule);
      }
    } else if (shape.category === 'policy') {
      sources.add(pack.document.ref);
      policies.push(...shape.content.policies);
    }
  }

  const conflicts: ConflictDiagnostic[] = [];

  // Engineering policies: render scope precedence and detect collisions.
  const policyById = new Map<string, EngineeringPolicyEntry>();
  for (const policy of policies) {
    const prec = policy.precedence ?? policyToPrecedence(policy.scope);
    const key = `${policy.id}:${prec}`;
    if (policyById.has(key)) {
      conflicts.push({
        code: 'duplicate-rule-id',
        ruleId: policy.id,
        refs: [...new Set([...sources])],
        message: `engineering policy "${policy.id}" declared more than once at precedence "${prec}"`,
      });
      continue;
    }
    policyById.set(key, policy);
    // Policies become rules at their (possibly scope-derived) precedence.
    rules.push({
      id: policy.id,
      class: 'organization',
      precedence: prec,
      rule: policy.rule,
      rationale: policy.rationale,
      references: policy.references,
    });
  }

  // Precedence resolution (REQ-STD-004): for each rule id, the definition at
  // the HIGHEST authority tier (lowest rank) wins deterministically. Two
  // definitions at the SAME tier with different content are a surfaced
  // conflict — never silently resolved.
  const byId = new Map<string, { rank: number; rule: StandardRule }>();
  for (const rule of rules) {
    const rank = PRECEDENCE_RANK[rule.precedence];
    const existing = byId.get(rule.id);
    if (!existing) {
      byId.set(rule.id, { rank, rule });
      continue;
    }
    if (existing.rank === rank) {
      if (existing.rule.rule !== rule.rule) {
        conflicts.push({
          code: 'duplicate-rule-id',
          ruleId: rule.id,
          refs: [...new Set([...sources])],
          message: `standard "${rule.id}" has conflicting definitions at precedence "${rule.precedence}"`,
        });
      }
      continue;
    }
    // Different tiers: higher authority (lower rank) shadows the weaker one.
    if (rank < existing.rank) {
      byId.set(rule.id, { rank, rule });
    }
  }

  const uniqueRules = [...byId.values()].map((e) => e.rule);
  uniqueRules.sort(compareRules);

  return {
    rules: uniqueRules,
    conflicts,
    sources: [...sources].sort(),
  };
}
