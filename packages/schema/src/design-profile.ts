import { z } from 'zod';
import { NonEmptyString, versionedObject } from './common.js';
import { ACCESSIBILITY_LEVELS, DESIGN_DENSITIES, DESIGN_STYLES } from './project.js';
import { PackRef } from './common.js';

/**
 * Rich design profile model (P07-01) + trustworthy registry items (P07-04).
 *
 * Extends the Phase 02 minimal DesignProfileSchema additively (all new
 * fields optional) so existing v1 profiles keep parsing. Shape mirrors
 * docs/05-design-engine/design-profile.md: style variant, geometry,
 * typography, icons, motion, accessibility target, component sources with
 * TRUST metadata, and responsive rules. Backend-only/no-frontend is a valid
 * profile state (no components, no tokens).
 */

// ------------------------------------------------------------ enums (additive)

export const MOTION_PROFILES = ['none', 'restrained', 'expressive', 'cinematic'] as const;
export type MotionProfile = (typeof MOTION_PROFILES)[number];

export const GEOMETRY_RADII = ['none', 'subtle', 'rounded', 'pill'] as const;
export type GeometryRadius = (typeof GEOMETRY_RADII)[number];

export const GEOMETRY_BORDER_STRENGTHS = ['none', 'subtle', 'strong'] as const;
export type GeometryBorderStrength = (typeof GEOMETRY_BORDER_STRENGTHS)[number];

export const SHADOW_USAGES = ['none', 'restrained', 'expressive'] as const;
export type ShadowUsage = (typeof SHADOW_USAGES)[number];

export const TYPOGRAPHY_STRATEGIES = ['serif', 'sans', 'mono', 'system', 'mixed'] as const;
export type TypographyStrategy = (typeof TYPOGRAPHY_STRATEGIES)[number];

export const ICON_STRATEGIES = ['outline', 'filled', 'duotone'] as const;
export type IconStrategy = (typeof ICON_STRATEGIES)[number];

export const REGISTRY_TRUST_LEVELS = ['official', 'verified', 'community', 'untrusted'] as const;
export type RegistryTrustLevel = (typeof REGISTRY_TRUST_LEVELS)[number];

// -------------------------------------------------- component registry items

/**
 * A third-party component/registry suggestion (shadcn-style registries).
 * TRUST METADATA IS REQUIRED (exit gate): community registries remain
 * third-party/untrusted; high-assurance profiles require explicit review of
 * third-party code before use. Registry content never bypasses PlanMo
 * path/ownership safety.
 */
export const RegistryItemSchema = z
  .strictObject({
    /** Registry id, e.g. "shadcn/ui". */
    id: NonEmptyString,
    /** HTTP(S) source URL — file:// and other schemes are rejected. */
    url: z.string().refine((u) => u.startsWith('https://') || u.startsWith('http://'), {
      message: 'registry source must be an http(s) URL',
    }),
    /** Trust classification — REQUIRED, never defaulted to official. */
    trust: z.enum(REGISTRY_TRUST_LEVELS),
    /** Resolved item name. */
    name: NonEmptyString,
    /** Version/ref when available. */
    version: NonEmptyString.optional(),
    /** Content integrity hash when available (e.g. sha256:…). */
    integrity: z
      .string()
      .regex(/^[a-z0-9]+:[A-Fa-f0-9]+$/)
      .optional(),
    /**
     * Whether explicit human review is required before use. FORCED true for
     * community/untrusted sources (cannot be disabled); official/verified may
     * declare false explicitly. Default true (conservative).
     */
    requiresReview: z.boolean().default(true),
    /** Source record for provenance (url + acquired version/integrity). */
    sourceRecord: NonEmptyString.optional(),
  })
  .superRefine((item, ctx) => {
    if (
      (item.trust === 'community' || item.trust === 'untrusted') &&
      item.requiresReview !== true
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requiresReview'],
        message: `trust "${item.trust}" forces requiresReview=true`,
      });
    }
  });
export type RegistryItem = z.infer<typeof RegistryItemSchema>;

// ---------------------------------------------------------------- rich profile

export const DesignGeometrySchema = z.strictObject({
  radius: z.enum(GEOMETRY_RADII).optional(),
  borderStrength: z.enum(GEOMETRY_BORDER_STRENGTHS).optional(),
  shadowUsage: z.enum(SHADOW_USAGES).optional(),
});
export type DesignGeometry = z.infer<typeof DesignGeometrySchema>;

export const DesignTypographySchema = z.strictObject({
  strategy: z.enum(TYPOGRAPHY_STRATEGIES),
  maxFamilies: z.number().int().min(1).max(4).optional(),
});
export type DesignTypography = z.infer<typeof DesignTypographySchema>;

export const DesignMotionSchema = z.strictObject({
  /** Motion profile per docs/05-design-engine/accessibility-and-motion.md. */
  profile: z.enum(MOTION_PROFILES),
  /** WCAG 2.3.3 / prefers-reduced-motion: always true for product UI. */
  reducedMotionRequired: z.boolean().default(true),
});
export type DesignMotion = z.infer<typeof DesignMotionSchema>;

export const DesignIconsSchema = z.strictObject({
  strategy: z.enum(ICON_STRATEGIES),
});
export type DesignIcons = z.infer<typeof DesignIconsSchema>;

export const DesignComponentsSchema = z.strictObject({
  /** Component/source ecosystem, e.g. "shadcn" (a source, NOT a style). */
  system: NonEmptyString.optional(),
  /** Foundation recommendation, e.g. "radix". */
  foundation: NonEmptyString.optional(),
  /** Third-party registries with TRUST metadata (untrusted by default). */
  registries: z.array(RegistryItemSchema).default([]),
});
export type DesignComponents = z.infer<typeof DesignComponentsSchema>;

export const DesignResponsiveSchema = z.strictObject({
  mobileFirst: z.boolean().default(true),
  /** e.g. 640, 768, 1024 — explicit breakpoints when known. */
  breakpoints: z.array(z.number().int().positive()).default([]),
});
export type DesignResponsive = z.infer<typeof DesignResponsiveSchema>;

/**
 * Full structured design profile. Additive superset of the Phase 02 minimal
 * profile; all blocks optional — a backend-only/no-frontend profile is valid.
 */
export const RichDesignProfileSchema = versionedObject({
  style: z.enum(DESIGN_STYLES),
  /** Optional style variant, e.g. "balanced" for minimal. */
  styleVariant: NonEmptyString.optional(),
  density: z.enum(DESIGN_DENSITIES),
  geometry: DesignGeometrySchema.optional(),
  typography: DesignTypographySchema.optional(),
  icons: DesignIconsSchema.optional(),
  motion: DesignMotionSchema.optional(),
  accessibility: z.enum(ACCESSIBILITY_LEVELS).default('WCAG-2.2-AA'),
  components: DesignComponentsSchema.optional(),
  responsive: DesignResponsiveSchema.optional(),
  /** Explicit DTCG-compatible tokens (Phase 07 canonical form). */
  tokens: z.record(z.string(), z.unknown()).optional(),
  /** Backend-only/no-frontend marker (valid profile state). */
  backendOnly: z.boolean().default(false),
});

export type RichDesignProfile = z.infer<typeof RichDesignProfileSchema>;

export { PackRef };
