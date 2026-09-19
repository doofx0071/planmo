import { z } from 'zod';
import { NonEmptyString, PackRef, SemVerString, versionedObject } from './common.js';
import {
  ACCESSIBILITY_LEVELS,
  DESIGN_DENSITIES,
  DESIGN_STYLES,
  type AccessibilityLevel,
  type DesignDensity,
  type DesignStyle,
} from './project.js';

/**
 * Declarative pack and design-profile schemas (P02-03).
 * Packs are declarative in v1: metadata + structured content, no executable
 * code (ADR-0004, MASTER-GUARDRAILS).
 */

export const PACK_CATEGORIES = ['stack', 'domain', 'risk', 'design', 'agent', 'workflow'] as const;
export type PackCategory = (typeof PACK_CATEGORIES)[number];

/** A capability a pack provides or requires, e.g. "stack.nextjs", "design.minimal". */
export const CapabilityRef = NonEmptyString;

/**
 * Declarative pack manifest — `pack.yml` inside a pack directory.
 * Content is structured data; arbitrary code/lifecycle scripts are rejected
 * by the pack loader (Phase 04) per ADR-0004.
 */
export const PackSchema = versionedObject({
  /** Canonical pack ref, e.g. "stack/nextjs". */
  ref: PackRef,
  name: NonEmptyString,
  version: SemVerString,
  category: z.enum(PACK_CATEGORIES),
  description: NonEmptyString,
  /** Capabilities this pack provides. */
  provides: z.array(CapabilityRef).default([]),
  /** Pack refs this pack depends on. */
  requires: z.array(PackRef).default([]),
  /** Declarative pack content as structured data (shape validated by the loader). */
  content: z.record(z.string(), z.unknown()).default({}),
});
export type PackDocument = z.infer<typeof PackSchema>;

/**
 * Design profile — the structured frontend-design choices PlanMo commits to.
 * Profile/token form, never vague prose (product invariant).
 */
export const DesignProfileSchema = versionedObject({
  style: z.enum(DESIGN_STYLES),
  density: z.enum(DESIGN_DENSITIES),
  accessibility: z.enum(ACCESSIBILITY_LEVELS),
  /** Optional component source, e.g. "shadcn" (a source, not a style). */
  componentSystem: NonEmptyString.optional(),
  /** Explicit design tokens (DTCG-compatible when present). */
  tokens: z.record(z.string(), z.unknown()).optional(),
});
export type DesignProfile = z.infer<typeof DesignProfileSchema>;

/** Design tokens emitted for DTCG consumers (Phase 07 owns full DTCG output). */
export const DesignTokensSchema = z.strictObject({
  $schema: z.literal('https://design-tokens.github.io/community-group/format/'),
  color: z.record(z.string(), z.unknown()).default({}),
  typography: z.record(z.string(), z.unknown()).default({}),
  spacing: z.record(z.string(), z.unknown()).default({}),
  radius: z.record(z.string(), z.unknown()).default({}),
  motion: z.record(z.string(), z.unknown()).default({}),
});
export type DesignTokens = z.infer<typeof DesignTokensSchema>;

export type { AccessibilityLevel, DesignDensity, DesignStyle };
