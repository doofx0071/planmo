/**
 * Frozen adapter contracts (Phase 06, P06-01).
 *
 * Adapters translate PlanMo workflows to real agent CLI invocations WITHOUT
 * changing canonical semantics (exit gate). They are PURE: given a task
 * request they return an invocation (argv + prompt text); they never
 * execute anything themselves and never touch the filesystem.
 *
 * Adapters are AGENT-NEUTRAL by design and depend only on @planmo/shared
 * (boundary graph: adapters: ['core', 'shared']). They never import the
 * canonical schema package: the agent-bridge compiles schema-validated
 * state into the plain structural views below, so adapters stay decoupled
 * from PlanMo's canonical documents (product invariant).
 */

// ------------------------------------------------------------------ agent ids

/**
 * Adapter ids. `generic` is the agent-neutral adapter that always works
 * (exit gate). `opencode`/`claude-code` are v1 primary targets (ADR-0008);
 * `codex` is an EXTENSION registered outside the canonical AGENT_IDS enum
 * (ADR-0008: not v1-primary; generic contract allows adding without
 * architecture change).
 */
export const ADAPTER_IDS = ['generic', 'opencode', 'codex', 'claude-code'] as const;
export type AdapterId = (typeof ADAPTER_IDS)[number];

// ------------------------------------------------------- structural views
// Plane, schema-free shapes the agent-bridge fills from validated state.

/** Token-budgeted context bundle (structural view of ContextBundleSchema). */
export interface ContextView {
  project: string;
  contextId: string;
  l0Capsule: string;
  l1Index: string;
  l2Evidence: string;
  estimatedTokens: number;
  retrievalHandles: readonly string[];
}

/** Structural view of a selected standard (REQ-STD). */
export interface StandardView {
  id: string;
  precedence: string;
  rule: string;
  rationale?: string;
  references?: readonly string[];
}

/** Structural view of an execution packet. */
export interface PacketView {
  id: string;
  taskId: string;
  title: string;
  scope: string;
  inputs: readonly string[];
  outputs: readonly string[];
  dependencies: readonly string[];
  status: string;
}

// ---------------------------------------------------------------- invocation

export interface AgentInvocation {
  /** Adapter id this invocation came from. */
  adapter: AdapterId;
  /** argv to run the agent CLI (empty for `generic`: prompt is the output). */
  argv: string[];
  /** Working directory for the CLI call. */
  cwd: string;
  /** The full prompt handed to the agent (generic adapters output this). */
  prompt: string;
  /**
   * Filesystem paths (relative to cwd) the agent is ALLOWED to read/write.
   * The generic adapter always returns [] (agent-neutral).
   */
  allowedPaths: string[];
  /**
   * Structured-output contract when the CLI supports it (e.g. opencode
   * `--format json`); null when the adapter cannot request JSON output.
   */
  structuredOutput: 'json' | null;
}

// ------------------------------------------------------------- capabilities

export interface AdapterCapabilities {
  /** Whether the CLI can emit machine-readable (JSON) output. */
  supportsStructuredOutput: boolean;
  /** Whether project context can be attached as files (not only prompt). */
  supportsContextFiles: boolean;
  /** Whether an existing session can be resumed by id/continue flag. */
  supportsResume: boolean;
  /** Whether the adapter can receive the context bundle inline. */
  supportsInlineContext: boolean;
}

/**
 * How an adapter behaves when a requested capability is unavailable — must
 * be EXPLICIT, never silent (exit gate: "unsupported capabilities degrade
 * explicitly rather than silently").
 */
export interface CapabilityDegradation {
  /** Capability id that is unavailable. */
  capability: keyof AdapterCapabilities;
  /** Human-readable degradation note included in the prompt/output. */
  note: string;
}

// ------------------------------------------------------------------- request

/** Everything an adapter needs to render an invocation. */
export interface AgentRequest {
  /** Canonical task text (already schema-validated upstream). */
  task: string;
  /** Context bundle compiled by the agent-bridge (agent-neutral views). */
  context: ContextView;
  /** Standards selected for this task, rendered readable. */
  standards: readonly StandardView[];
  /** Execution packet when this task is part of a parallel work stream. */
  packet?: PacketView;
  /** Project root (absolute); adapters only use it for cwd/allowedPaths. */
  root: string;
  /** Requested capability overrides; unsupported ones degrade explicitly. */
  requested: Partial<AdapterCapabilities>;
}

// ------------------------------------------------------------------ adapter

/** A registered adapter implementation. Must be pure and deterministic. */
export interface AgentAdapter {
  readonly id: AdapterId;
  readonly capabilities: AdapterCapabilities;
  /** Render the invocation for a request (never executes). */
  render(request: AgentRequest): AgentInvocation;
  /**
   * List degradations for requested capabilities this adapter lacks.
   * Pure: no probing, no I/O.
   */
  degradations(request: Partial<AdapterCapabilities>): CapabilityDegradation[];
}
