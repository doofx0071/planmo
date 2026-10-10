/**
 * @planmo/schema — canonical project model and artifact schemas.
 *
 * Versioned, strict Zod schemas for every persisted PlanMo document:
 * project config, state, lockfile, manifest, packs, design profiles,
 * trace graph, handoffs, and work packets. All documents carry an explicit
 * schemaVersion and reject unsupported future versions (see schema-versioning).
 */

// Shared primitives
export {
  SCHEMA_VERSION,
  MAX_SUPPORTED_SCHEMA_VERSION,
  NonEmptyString,
  SemVerString,
  PackRef,
  Checksum,
  Extensions,
  versionedObject,
} from './common.js';
export type { Checksum as ChecksumType } from './common.js';

// Canonical task model (schema v2) + the tasks.csv codec
export {
  TASK_PRIORITIES,
  TaskPriority,
  TaskVerification,
  TaskRecord,
  TASKS_CSV_COLUMNS,
  TASKS_CSV_HEADER,
  joinList,
  splitList,
  serializeTaskRow,
  serializeTasksCsv,
  parseTasksCsv,
} from './task.js';

// Versioning + migrations
export {
  UnsupportedSchemaVersionError,
  MissingSchemaVersionError,
  readSchemaVersion,
  assertSupportedVersion,
  SchemaMigrations,
} from './schema-versioning.js';
export type { MigrationStep } from './schema-versioning.js';
export { PROJECT_MIGRATIONS, STATE_MIGRATIONS, HANDOFF_MIGRATIONS } from './migrations.js';

// Project config
export {
  PROJECT_TYPES,
  PROJECT_LIFECYCLES,
  PROJECT_RISKS,
  DESIGN_STYLES,
  DESIGN_DENSITIES,
  ACCESSIBILITY_LEVELS,
  PLANNING_DEPTHS,
  PHASE_MODES,
  AGENT_IDS,
  ProjectConfigSchema,
} from './project.js';
export type {
  ProjectType,
  ProjectLifecycle,
  ProjectRisk,
  DesignStyle,
  DesignDensity,
  AccessibilityLevel,
  PlanningDepth,
  PhaseMode,
  AgentId,
  ProjectConfig,
  ProjectInfo,
  StackBlock,
  DesignBlock,
  PlanningBlock,
  AgentsBlock,
} from './project.js';

// State, lockfile, manifest
export {
  STATE_STATUSES,
  TASK_STATUSES,
  StateSchema,
  LOCK_SOURCES,
  PackLockEntry,
  AdapterLockEntry,
  LockfileSchema,
  ARTIFACT_KINDS,
  OWNERSHIP_MODES,
  ManifestEntry,
  ManifestSchema,
} from './state-lock-manifest.js';
export type {
  StateStatus,
  TaskStatus,
  StateDocument,
  LockSource,
  PackLockEntry as PackLockEntryType,
  AdapterLockEntry as AdapterLockEntryType,
  LockfileDocument,
  ArtifactKind,
  OwnershipMode,
  ManifestEntry as ManifestEntryType,
  ManifestDocument,
} from './state-lock-manifest.js';

// Packs + design profiles
export {
  PACK_CATEGORIES,
  TRUST_LEVELS,
  CapabilityRef,
  PackProvenanceSchema,
  PackSchema,
  DesignProfileSchema,
  DesignTokensSchema,
} from './pack-design.js';
export type {
  PackCategory,
  TrustLevel,
  PackProvenance,
  PackDocument,
  DesignProfile,
  DesignTokens,
} from './pack-design.js';

// Rich design profile model (Phase 07)
export {
  MOTION_PROFILES,
  GEOMETRY_RADII,
  GEOMETRY_BORDER_STRENGTHS,
  SHADOW_USAGES,
  TYPOGRAPHY_STRATEGIES,
  ICON_STRATEGIES,
  REGISTRY_TRUST_LEVELS,
  RegistryItemSchema,
  DesignGeometrySchema,
  DesignTypographySchema,
  DesignMotionSchema,
  DesignIconsSchema,
  DesignComponentsSchema,
  DesignResponsiveSchema,
  RichDesignProfileSchema,
} from './design-profile.js';
export type {
  MotionProfile,
  GeometryRadius,
  GeometryBorderStrength,
  ShadowUsage,
  TypographyStrategy,
  IconStrategy,
  RegistryTrustLevel,
  RegistryItem,
  DesignGeometry,
  DesignTypography,
  DesignMotion,
  DesignIcons,
  DesignComponents,
  DesignResponsive,
  RichDesignProfile,
} from './design-profile.js';

// Pack content (CHG-001: standards, policy, context/memory declarations)
export {
  STANDARD_CLASSES,
  STANDARD_PRECEDENCE,
  StandardRuleSchema,
  StandardsPackContentSchema,
  EngineeringPolicyEntrySchema,
  EngineeringPolicyContentSchema,
  TokenBudgetSchema,
  MEMORY_SCOPES,
  ContextMemoryPolicySchema,
  PackContentShapeSchema,
} from './pack-content.js';
export type {
  StandardClass,
  StandardPrecedence,
  StandardRule,
  StandardsPackContent,
  EngineeringPolicyEntry,
  EngineeringPolicyContent,
  TokenBudget,
  MemoryScope,
  ContextMemoryPolicy,
  PackContentShape,
} from './pack-content.js';

// Trace graph, handoffs, work packets
export {
  TRACE_LINK_KINDS,
  TraceLink,
  TraceGraphSchema,
  HANDOFF_STATUSES,
  HandoffBlocker,
  HandoffTestRow,
  HandoffSchema,
  WORK_PACKET_STATUSES,
  WorkPacketSchema,
} from './trace-handoff-workpacket.js';
export type {
  TraceLinkKind,
  TraceLink as TraceLinkType,
  TraceGraph,
  HandoffStatus,
  HandoffBlocker as HandoffBlockerType,
  HandoffTestRow as HandoffTestRowType,
  HandoffDocument,
  WorkPacketStatus,
  WorkPacket,
} from './trace-handoff-workpacket.js';

// Change Engine (Phase 08, CHG-001)
export {
  CHANGE_DELTA_KINDS,
  RequirementDelta,
  CHANGE_STATUSES,
  ChangePackageSchema,
  ChangeSnapshot,
} from './change-engine.js';
export type {
  ChangeDeltaKind,
  RequirementDelta as RequirementDeltaType,
  ChangeStatus,
  ChangePackage,
  ChangeSnapshot as ChangeSnapshotType,
} from './change-engine.js';

// Agent bridge (Phase 06)
export {
  PROPOSAL_ITEM_STATUSES,
  AiProposalSchema,
  CONTEXT_LEVELS,
  ContextBundleSchema,
} from './agent-bridge.js';
export type {
  ProposalItemStatus,
  AiProposal,
  ContextLevel,
  ContextBundle,
} from './agent-bridge.js';
