import { z } from 'zod';
import { NonEmptyString } from './common.js';

/**
 * Pack content schemas for CHG-001 policy categories (P04-06..09).
 *
 * Pack `content` is structured data validated per category by the loader
 * (`@planmo/packs`). These schemas give the standards / policy / context
 * categories a strict, deterministic shape (REQ-STD-001/002/004,
 * REQ-CTX-003/005, REQ-MEM-002/003/005/008).
 */

/** Standard classes per docs/13-standards-quality/standards-engine.md. */
export const STANDARD_CLASSES = [
  'global-engineering',
  'language',
  'framework',
  'domain',
  'security',
  'accessibility',
  'testing',
  'organization',
  'package-local',
  'design',
] as const;
export type StandardClass = (typeof STANDARD_CLASSES)[number];

/**
 * Deterministic precedence tiers (most specific / highest authority first).
 * Mirror of docs/13-standards-quality/standards-engine.md ordering.
 */
export const STANDARD_PRECEDENCE = [
  'explicit-project-policy',
  'package-local',
  'project',
  'security',
  'stack-framework',
  'language',
  'global-default',
] as const;
export type StandardPrecedence = (typeof STANDARD_PRECEDENCE)[number];

/** One structured standard/rule, applicable to a stack/domain/test context. */
export const StandardRuleSchema = z.strictObject({
  /** Stable rule id, e.g. "react.hooks-order". */
  id: NonEmptyString,
  class: z.enum(STANDARD_CLASSES),
  precedence: z.enum(STANDARD_PRECEDENCE),
  /** Rule statement — directive, actionable, never vague prose. */
  rule: NonEmptyString,
  /** Context(s) this rule applies to; empty = universal. */
  appliesTo: z
    .strictObject({
      stack: z.array(NonEmptyString).optional(),
      domain: z.array(NonEmptyString).optional(),
      risk: z.array(z.enum(['low', 'medium', 'high'])).optional(),
      testTypes: z.array(NonEmptyString).optional(),
    })
    .optional(),
  /** Optional rationale for the rule. */
  rationale: NonEmptyString.optional(),
  /** Optional destination reference (docs, ADR, issue). */
  references: z.array(NonEmptyString).optional(),
});
export type StandardRule = z.infer<typeof StandardRuleSchema>;

/** Content of a `category: standards` pack. */
export const StandardsPackContentSchema = z.strictObject({
  standards: z.array(StandardRuleSchema).default([]),
});
export type StandardsPackContent = z.infer<typeof StandardsPackContentSchema>;

/** Engineering policy entry (REQ-STD-004 precedence, REQ-QLT-002 refactoring policy). */
export const EngineeringPolicyEntrySchema = z.strictObject({
  id: NonEmptyString,
  /** Policy scope → default precedence tier when `precedence` is omitted. */
  scope: z.enum(['project', 'package', 'stack', 'global']),
  rule: NonEmptyString,
  rationale: NonEmptyString.optional(),
  precedence: z.enum(STANDARD_PRECEDENCE).optional(),
  references: z.array(NonEmptyString).optional(),
});
export type EngineeringPolicyEntry = z.infer<typeof EngineeringPolicyEntrySchema>;

/** Content of a `category: policy` pack. */
export const EngineeringPolicyContentSchema = z.strictObject({
  policies: z.array(EngineeringPolicyEntrySchema).default([]),
});
export type EngineeringPolicyContent = z.infer<typeof EngineeringPolicyContentSchema>;

/** Token/size budget for context compilation (REQ-CTX-003). */
export const TokenBudgetSchema = z.strictObject({
  /** Budget in tokens. */
  tokens: z.number().int().positive(),
});
export type TokenBudget = z.infer<typeof TokenBudgetSchema>;

/** Scope filter for memory persistence (REQ-MEM-005). */
export const MEMORY_SCOPES = ['project', 'package', 'phase', 'task', 'user'] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

/** Context/memory policy declarations (P04-09). Declarations ONLY — no storage engine in v1. */
export const ContextMemoryPolicySchema = z.strictObject({
  /** Context compilation policy (REQ-CTX-003, REQ-CTX-004). */
  context: z
    .strictObject({
      /** Token budget cap for a compiled context bundle. */
      tokenBudget: TokenBudgetSchema.optional(),
      /** Summaries/references first, full source only when needed (REQ-CTX-004). */
      progressiveDisclosure: z.boolean().default(true),
      /** Deterministic default budget for a work packet. */
      defaultPacketBudget: TokenBudgetSchema.optional(),
    })
    .default(() => ({ progressiveDisclosure: true })),
  /** Memory persistence declarations (REQ-MEM-002/003/005/008). */
  memory: z
    .strictObject({
      /** Allowed memory scopes (REQ-MEM-005). */
      allowedScopes: z.array(z.enum(MEMORY_SCOPES)).default(['project']),
      /** Provenance is required for every durable memory (REQ-MEM-003). */
      requireProvenance: z.boolean().default(true),
      /** Secret/privacy redaction policy (REQ-MEM-008). */
      redactSecrets: z.boolean().default(true),
    })
    .default(
      () =>
        ({
          allowedScopes: ['project'] as MemoryScope[],
          requireProvenance: true,
          redactSecrets: true,
        }) satisfies {
          allowedScopes: MemoryScope[];
          requireProvenance: boolean;
          redactSecrets: boolean;
        },
    ),
});
export type ContextMemoryPolicy = z.infer<typeof ContextMemoryPolicySchema>;

/** Discriminator: validates which content schema a pack category must satisfy. */
export const PackContentShapeSchema = z.discriminatedUnion('category', [
  z.strictObject({ category: z.literal('standards'), content: StandardsPackContentSchema }),
  z.strictObject({ category: z.literal('policy'), content: EngineeringPolicyContentSchema }),
  z.strictObject({ category: z.literal('context'), content: ContextMemoryPolicySchema }),
]);
export type PackContentShape = z.infer<typeof PackContentShapeSchema>;
