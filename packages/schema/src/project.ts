import { z } from 'zod';
import { NonEmptyString, PackRef, versionedObject } from './common.js';

/**
 * Canonical project configuration — `.planmo/project.yml`.
 * Mirrors docs/02-architecture/canonical-project-model.md.
 */

export const PROJECT_TYPES = [
  'web-application',
  'cli',
  'library',
  'service',
  'mobile-application',
  'desktop-application',
  'other',
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_LIFECYCLES = ['greenfield', 'brownfield'] as const;
export type ProjectLifecycle = (typeof PROJECT_LIFECYCLES)[number];

export const PROJECT_RISKS = ['low', 'medium', 'high'] as const;
export type ProjectRisk = (typeof PROJECT_RISKS)[number];

/** Eight initial design styles (ADR-0008 / DECISIONS.md). */
export const DESIGN_STYLES = [
  'minimal',
  'editorial',
  'neobrutalism',
  'soft-product',
  'dense-dashboard',
  'developer-tool',
  'luxury',
  'playful',
] as const;
export type DesignStyle = (typeof DESIGN_STYLES)[number];

export const DESIGN_DENSITIES = ['compact', 'balanced', 'spacious'] as const;
export type DesignDensity = (typeof DESIGN_DENSITIES)[number];

export const ACCESSIBILITY_LEVELS = ['WCAG-2.2-A', 'WCAG-2.2-AA', 'WCAG-2.2-AAA'] as const;
export type AccessibilityLevel = (typeof ACCESSIBILITY_LEVELS)[number];

/** Planning-depth profiles (MASTER-PLAN). */
export const PLANNING_DEPTHS = [
  'lean',
  'standard',
  'production',
  'high-assurance',
  'custom',
] as const;
export type PlanningDepth = (typeof PLANNING_DEPTHS)[number];

export const PHASE_MODES = ['gated', 'continuous'] as const;
export type PhaseMode = (typeof PHASE_MODES)[number];

/** v1 primary agent support matrix (ADR-0008). */
export const AGENT_IDS = ['opencode', 'claude-code', 'generic'] as const;
export type AgentId = (typeof AGENT_IDS)[number];

const ProjectInfo = z.strictObject({
  name: NonEmptyString,
  lifecycle: z.enum(PROJECT_LIFECYCLES),
  type: z.enum(PROJECT_TYPES),
  risk: z.enum(PROJECT_RISKS),
});

const StackBlock = z.strictObject({
  frontend: NonEmptyString.optional(),
  backend: NonEmptyString.optional(),
  database: NonEmptyString.optional(),
  language: NonEmptyString.optional(),
  runtime: NonEmptyString.optional(),
  test: NonEmptyString.optional(),
  ci: NonEmptyString.optional(),
});

const DesignBlock = z.strictObject({
  style: z.enum(DESIGN_STYLES),
  density: z.enum(DESIGN_DENSITIES),
  accessibility: z.enum(ACCESSIBILITY_LEVELS),
  componentSystem: NonEmptyString.optional(),
});

const PlanningBlock = z.strictObject({
  depth: z.enum(PLANNING_DEPTHS),
  phaseMode: z.enum(PHASE_MODES),
  freshSessionPerPhase: z.boolean(),
});

const AgentsBlock = z.strictObject({
  primary: z.enum(AGENT_IDS),
});

export const ProjectConfigSchema = versionedObject({
  project: ProjectInfo,
  stack: StackBlock.optional(),
  design: DesignBlock.optional(),
  planning: PlanningBlock.optional(),
  agents: AgentsBlock.optional(),
  /** Resolved pack refs applied to this project, e.g. `stack/nextjs`. */
  packs: z.array(PackRef).default([]),
});
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export type ProjectInfo = z.infer<typeof ProjectInfo>;
export type StackBlock = z.infer<typeof StackBlock>;
export type DesignBlock = z.infer<typeof DesignBlock>;
export type PlanningBlock = z.infer<typeof PlanningBlock>;
export type AgentsBlock = z.infer<typeof AgentsBlock>;
