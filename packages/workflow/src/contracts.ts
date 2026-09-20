import type { ChangePackage, HandoffDocument, StateDocument, WorkPacket } from '@planmo/schema';

/**
 * FROZEN Phase 08 contracts (workflow/session engine).
 *
 * Workers implement against THESE interfaces ONLY. All functions are PURE +
 * deterministic: no timestamps (use the injected TimeProvider), no randomness,
 * no filesystem, no CLI execution. Sort every array before it appears in
 * output. exactOptionalPropertyTypes is ON: omit optional fields, never set
 * them to undefined. Time is ALWAYS injected — never `Date.now()`.
 */

/**
 * Structural view of the agent-neutral context bundle (P08-10). Deliberately
 * NOT imported from @planmo/adapters (workflow boundary is core/shared/schema/
 * agent-bridge): the shape is structural so the workflow engine stays
 * agent-neutral. Matches the adapter's ContextView exactly.
 */
export interface ContextBundleView {
  project: string;
  contextId: string;
  l0Capsule: string;
  l1Index: string;
  l2Evidence: string;
  estimatedTokens: number;
  retrievalHandles: readonly string[];
}

/** Injected clock (deterministic in tests). Returns epoch ms. */
export type TimeProvider = () => number;

// ------------------------------------------------- phase/state transitions

/** An exit-gate evaluation for one phase. */
export interface ExitGateResult {
  /** Gate name, e.g. "gate", "tests", "handoff". */
  name: string;
  /** Phase the gate protects. */
  phase: string;
  /** True when the gate passed. */
  passed: boolean;
  /** Why it failed (empty when passed). */
  detail?: string;
}

export type TransitionResult = { ok: true; next: StateDocument } | { ok: false; reason: string };

/**
 * Phase/state transition engine (P08-01). Validates transitions against
 * dependency + gate rules; represents the hard-stop/fresh-session workflow:
 * a phase may only COMPLETE when its exit gates pass, and the fresh session
 * entry is derived from canonical state (never from agent memory).
 */
export interface TransitionEngine {
  /**
   * Attempt to advance state. `nextPhase` must be the exact next phase id in
   * the phase order (no skipping) unless `force` is explicitly true, and all
   * `gates` for the current phase must pass (exit gate rule). Fails loudly
   * otherwise.
   */
  advance(
    state: StateDocument,
    nextPhase: string,
    gates: readonly ExitGateResult[],
    opts?: { force?: boolean },
  ): TransitionResult;
  /** True when the phase id follows the completed phase order (gaps ok). */
  isNextPhase(state: StateDocument, phaseId: string): boolean;
  /**
   * Fresh-session entry point: deterministic derivation of the active
   * session (current phase, its exit gates, the next-phase prompt path).
   * Never consults memory/chat.
   */
  freshSession(state: StateDocument): FreshSession;
  /** Phase ids in dependency order (canonical, e.g. "00".."12"). */
  phaseOrder(state: StateDocument): readonly string[];
}

export interface FreshSession {
  currentPhase: string;
  /** Exit gates for the current phase (from the path list). */
  requiredGates: readonly string[];
  /** Path of the next-phase prompt file. */
  nextPrompt: string | undefined;
  /** True when the current phase has no handoff / is freshly started. */
  isFresh: boolean;
  /** Human-readable start instructions (deterministic, no prose invention). */
  instructions: readonly string[];
}

// ---------------------------------------------------------------- handoffs

export interface HandoffBuildInput {
  phase: string;
  status: HandoffDocument['status'];
  completedTasks: readonly string[];
  blocked?: HandoffDocument['blocked'];
  materialChanges?: readonly string[];
  testsRun?: HandoffDocument['testsRun'];
  securityFindings?: readonly string[];
  decisions?: readonly string[];
  git?: HandoffDocument['git'];
  knownDebt?: readonly string[];
  nextPhase: string;
  instructions?: readonly string[];
}

/**
 * Handoff builder (P08-02). Produces a schema-valid HandoffDocument that is
 * SUFFICIENT to resume from repository state alone.
 */
export interface HandoffBuilder {
  /** Deterministically build a handoff document (schema-valid via parse). */
  build(input: HandoffBuildInput): HandoffDocument;
  /** Missing fields that would prevent resuming; empty = sufficient. */
  missingForResume(doc: HandoffDocument): readonly string[];
}

// ------------------------------------------------------------- planmo next

export interface NextComposeInput {
  state: StateDocument;
  /** Handoff of the current phase (optional for fresh phases). */
  handoff?: HandoffDocument;
  /** Canonical prompt text of the next phase (from nextPrompt path). */
  nextPromptText?: string;
  /** Token budget for the context bundle (P08-10). */
  budgetTokens?: number;
}

/**
 * `planmo next` composer (P08-03 + P08-10). Deterministic next-session
 * context: what to do, what gates to meet, and a token-budgeted context
 * bundle compiled with the agent-bridge compiler (progressive disclosure
 * L0/L1/L2).
 */
export interface NextComposer {
  compose(input: NextComposeInput): NextSession;
}

export interface NextSession {
  /** One-line directive (deterministic). */
  directive: string;
  /** Phase id to work in. */
  phase: string;
  /** Steps in order (from canonical inputs). */
  steps: readonly string[];
  /** The compiled context bundle (agent-neutral, L0/L1/L2). */
  bundle: ContextBundleView;
  /** Token budget used. */
  budgetTokens: number;
  /** Non-empty blockers (e.g. RED gates) that must clear first. */
  blockers: readonly string[];
}

// ------------------------------------------------------- parallel work packets

export interface CompilePacketsInput {
  /** Tracking tasks (ids) to slice into packets. */
  taskIds: readonly string[];
  /** Ownership claims: path globs held by a claimant (worker/build). */
  ownership: readonly OwnershipClaim[];
  /** Optioal title prefix for the packet. */
  titlePrefix?: string;
}

export interface OwnershipClaim {
  owner: string;
  /** Path globs the owner exclusively controls, e.g. "packages/design-engine/src/**". */
  paths: readonly string[];
}

/**
 * Parallel work packet compiler (P08-04). Produces packets with
 * NON-OVERLAPPING ownership metadata: two packets that share a claimed path
 * are rejected loudly, so parallel workers never collide.
 */
export interface PacketCompiler {
  compile(input: CompilePacketsInput): readonly WorkPacket[];
}

// ------------------------------------------------------------ human gates

export interface GateDefinition {
  id: string;
  /** Phase scope, e.g. "08". */
  phase: string;
  /** Human-readable requirement. */
  requirement: string;
  /** Paths that must exist / be clean (e.g. handoff path). */
  requires?: readonly string[];
  /** When set, the gate blocks unless this flag is explicitly true. */
  humanApproval?: boolean;
}

export interface GateVerdict {
  gate: string;
  phase: string;
  passed: boolean;
  /** Exact reason when blocked. */
  reason?: string;
  /** Steps to unblock (never empty when blocked). */
  unblock?: readonly string[];
}

/**
 * Human/blocking gates (P08-05). Blocks unsafe automatic progression:
 * gates that require human approval or artifacts stay RED until satisfied.
 */
export interface GateEvaluator {
  evaluate(
    gates: readonly GateDefinition[],
    opts: { phase: string; approvals: Record<string, boolean> },
  ): readonly GateVerdict[];
}

// --------------------------------------------------------------- task DAG

/** Flat task descriptor (task graph input). */
export interface TaskNode {
  id: string;
  /** Depends on these task ids (all must be DONE for ready). */
  dependencies?: readonly string[];
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'REVIEW' | 'DONE';
}

/**
 * Task DAG / ready computation (P08-06, CHG-001). Explicit dependency graph,
 * READY only when all dependencies are DONE; `planmo ready` surfaces the
 * ready set deterministically.
 */
export interface TaskDag {
  /** Detect dependency cycles; return cycle task ids (empty = acyclic). */
  cycles(nodes: readonly TaskNode[]): readonly string[];
  /** Tasks whose dependencies are all DONE and own status allows work. */
  ready(nodes: readonly TaskNode[]): readonly string[];
  /** Deterministic topological order (stable: by id after Kahn). */
  ordered(nodes: readonly TaskNode[]): readonly TaskNode[];
}

// ----------------------------------------------------------- claims/leases

export interface Lease {
  /** Claimant id, e.g. "worker-a". */
  claimant: string;
  /** Task id claimed. */
  taskId: string;
  /** Epoch ms acquired. */
  acquiredAt: number;
  /** Epoch ms expiration. */
  expiresAt: number;
  /** Branch/worktree the claimant works in. */
  branch: string;
  /** Paths the claim covers (ownership). */
  paths: readonly string[];
}

/**
 * Claims + leases (P08-07, CHG-001). Expired claims can be reclaimed after
 * explicit checks; the manager is PURE (all time via injected provider).
 */
export interface LeaseManager {
  /** Create a lease (rejects an active lease on the same task). */
  claim(lease: Lease): { ok: true; lease: Lease } | { ok: false; reason: string };
  /** Release a lease (no-op unknown); returns released or none. */
  release(taskId: string, claimant: string): Lease | undefined;
  /** Active (non-expired) leases for a task. */
  activeFor(taskId: string): readonly Lease[];
  /**
   * Reclaim expired leases for a task. Returns expirations candidates
   * (previous leases) — the caller decides whether to re-claim; nothing is
   * auto-claimed. Explicit checks only.
   */
  expired(taskId: string): readonly Lease[];
  /** All leases sorted by (taskId, acquiredAt). */
  all(): readonly Lease[];
}

// ----------------------------------------------------- session memory (P08-08)

export const MEMORY_SOURCES = [
  'handoff',
  'decision',
  'task-evidence',
  'blocker-resolution',
  'preference',
  'standard',
] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

export const MEMORY_SENSITIVITIES = ['public', 'internal', 'sensitive'] as const;
export type MemorySensitivity = (typeof MEMORY_SENSITIVITIES)[number];

/** One durable memory candidate (NOT authoritative until consolidated). */
export interface SessionMemoryRow {
  id: string;
  source: MemorySource;
  /** Canonical provenance path (file path or doc id). */
  provenance: string;
  /** When captured (injected time). */
  capturedAt: number;
  sensitivity: MemorySensitivity;
  /** Compact statement (declarative fact, no instructions). */
  statement: string;
  /** Hash of the authoritative source (freshness index). */
  sourceHash?: string;
}

/**
 * Session memory lifecycle (P08-08, CHG-001 REQ-MEM-001..010). Capture
 * during a session is COLLECTION ONLY: candidates never become authoritative
 * until consolidation (P08-09). Raw chat is not durable by default.
 * PURE: rows are carried in/out; no storage engine in v1.
 */
export interface SessionMemory {
  /** Open a session: deterministic start row set (no chat text). */
  beginSession(opts: { sessionId: string; startedAt: number }): SessionMemoryRow[];
  /** Record a candidate (returns appended sorted rows). */
  record(
    rows: readonly SessionMemoryRow[],
    candidate: SessionMemoryRow,
  ): readonly SessionMemoryRow[];
  /** Candidates from allowed capture sources only (chat is rejected). */
  candidatesFromHandoff(doc: HandoffDocument): readonly SessionMemoryRow[];
  /** Mark stale any row whose source hash changed. */
  pruneStale(
    rows: readonly SessionMemoryRow[],
    current: Record<string, string>,
  ): readonly SessionMemoryRow[];
}

// --------------------------------------------- handoff-to-memory (P08-09)

/**
 * Consolidation (P08-09, REQ-MEM): turns handoff deltas into durable memory.
 * Dedupe, attach provenance, classify sensitivity, supersede outdated rows.
 * NEVER durably persists raw chat.
 */
export interface MemoryConsolidator {
  /**
   * Consolidate a handoff into memory rows. Deterministic:
   * dedup by (source, provenance); rows sorted by (source, id).
   */
  consolidate(
    doc: HandoffDocument,
    opts?: { sessionId?: string; now?: number },
  ): readonly SessionMemoryRow[];
}

// ------------------------------------------------------- change engine (P08-11)

export interface ChangeEngineResult {
  ok: boolean;
  reason?: string;
  change?: ChangePackage;
}

/**
 * Change Engine workflow (P08-11, CHG-001 REQ-CHG-001..004).
 * `new` produces a proposed package with ADDED/MODIFIED/REMOVED deltas;
 * `apply` (after acceptance) records provenance and updates canonical
 * artifacts; `archive` preserves the accepted package. No silent rewrites:
 * every transition is explicit and validated against ChangePackageSchema.
 */
export interface ChangeEngine {
  /** Create a proposed change package (schema-validated; >= 1 delta). */
  newChange(input: {
    id: string;
    slug: string;
    proposal: string;
    requirementDeltas: ChangePackage['requirementDeltas'];
  }): ChangeEngineResult;
  /** Accept + apply: status -> applied, stamp decision (provenance). */
  apply(change: ChangePackage, decision: string): ChangeEngineResult;
  /** Archive: status -> archived. */
  archive(change: ChangePackage): ChangeEngineResult;
}
