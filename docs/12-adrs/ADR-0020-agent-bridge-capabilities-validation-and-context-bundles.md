# ADR-0020: Agent Bridge — Capabilities, Validation, and Context Bundles

- Status: Accepted
- Date: 2026-09-20
- Phase: 06 (Agent bridge)
- Replaces: — (extends ADR-0008, ADR-0013/0014 context-memory, ADR-0017 execution packets)

## Context

PlanMo must integrate with real agent CLIs (OpenCode, Claude Code) for
project execution while keeping the deterministic core agent-neutral and
never letting AI output affect canonical state unvalidated.

## Decision

1. **Adapters are pure builders.** `@planmo/adapters` renders argv + prompt
   for a pinned CLI surface per agent (generic, opencode, codex, claude-code).
   Adapters never execute a CLI, never read the filesystem, import nothing
   from `@planmo/schema` (boundary: core/shared only) — they receive plain
   structural views (`ContextView`, `StandardView`, `PacketView`).
2. **Registry with explicit degradation.** `@planmo/agent-bridge` registers
   adapters and resolves requests; requested-but-unsupported capabilities
   degrade into explicit notes (never silent).
3. **AI proposals are schema-validated before affecting state (critical).**
   `AiProposalSchema` is a strict object: agent, requestId, items (DELTAS —
   "what should change and why", never commands). Unknown keys fail.
   `validateProposal` returns `{ ok, errors, proposal }`; nothing partial is
   ever applied.
4. **Context bundles are token-budgeted and agent-neutral.** L0 capsule,
   L1 index, L2 evidence (progressive disclosure, `ContextBundleSchema`);
   retrieval handles are layer-A paths the agent may load on demand.
5. **Standards injector** renders selected standards in precedence order;
   **memory provider** returns explicit no-op rows when nothing is stored
   (no hosted memory engine in v1, ADR-0013); **packet renderer** emits a
   self-contained execution block from `PacketView` + `ContextView`.
6. **Codex is an extension adapter, not a v1-primary agent.** ADR-0008
   excluded codex from v1; P06-04 task listed a codex adapter. Reconcile:
   the codex adapter ships behind the registry as an extension (ADR-0008's
   own "generic contract allows adding it later without architecture change"),
   while canonical AGENT_IDS remains `opencode | claude-code | generic`.
   `createDefaultRegistry()` registers all four; primary selection still
   validates against AGENT_IDS.

## Consequences

- Schemas stay strict; agent proposals that smuggle extra fields are rejected.
- All adapters share the same context/standards/packet bytes (portability).
- Deterministic re-render is guaranteed; E2E proof re-renders byte-identical.
- CLI execution (Phase 08) consumes `AgentInvocation` without new adapters.