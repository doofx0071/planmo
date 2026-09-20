# ADR-0022: Workflow / Session Engine — Transitions, Packets, Leases, Gates, Session Memory

- **Status:** Accepted
- **Date:** 2026-09-21
- **Phase:** 08 (workflow/session engine)
- **Extends:** ADR-0010 (CLI contract), ADR-0013/0014 (memory/context), ADR-0015 (change engine), ADR-0017 (task graph), ADR-0020 (agent bridge)

## Context

One-phase-at-a-time is the default execution model. Phases need validated
transitions, resume-sufficient handoffs, a `planmo next` directive, parallel
work packets, human gates, claim leases, session memory lifecycle, and the
Change Engine workflow. These are the machine-readable halves of workflows
that AGENTS.md and the phase prompts describe in prose.

## Decision

New package **`@planmo/workflow`** (boundary widened to
`['core','shared','schema','agent-bridge']` — it compiles the token-budgeted
context bundle via agent-bridge's `compileContextBundle`, REQ-CTX-001..005).
All engines are PURE + deterministic:

- **Transition engine (P08-01, critical):** `advance(state, nextPhase, gates)`
  validates continuity (next must immediately follow the last completed phase
  or equal the current), requires ALL exit gates passed, refuses double-advance
  and SKIP flags. Hard-stop/fresh-session is representable: `freshSession` pins
  the active phase, prompt path, and status; the engine never auto-advances.
- **Handoff builder (P08-02):** deterministic `HandoffDocument` construction
  (schema-valid via `HandoffSchema` from @planmo/schema, P02) +
  `missingForResume` surfaces the exact fields a fresh session needs.
- **`planmo next` (P08-03 + P08-10):** composes the next-session directive —
  phase, task set, focused steps — plus a token-budgeted agent-neutral context
  bundle (L0/L1/L2) compiled under an explicit budget, with RED-gate blockers
  surfaced when a prior phase has failing gates.
- **Parallel packet compiler (P08-04):** one `WorkPacketSchema`-valid packet
  per task with deterministic ids (`WP-<taskId>`), assignee from the ownership
  claim, shared inputs, owned outputs. Ownership overlap (exact or glob-prefix)
  THROWS with the offending owner/path pairs — fail-fast, never ambiguous
  ownership. Exit gate: packets carry non-overlapping ownership metadata.
- **Gate evaluator (P08-05):** human/blocking gates prevent unsafe automatic
  progression. Evaluator is pure; artifact presence is attested by the caller
  via the approvals map (documented). Blocked verdicts always carry non-empty
  reason + unblock steps.
- **Task DAG (P08-06):** explicit dependency graph — `cycles` (DFS
  visited/in-stack), `ready` (deps all DONE, own status allows work, BLOCKED
  and missing-dep tasks never ready), `ordered` (Kahn + min-heap keyed by id:
  deterministic, alphabetical tie-break).
- **Claim/lease manager (P08-07):** one ACTIVE lease per task; clock INJECTED
  (`TimeProvider`), never `Date.now()`; `expired()` is a pure query — the
  manager never auto-claims, the caller decides.
- **Session memory (P08-08):** lifecycle over REQ-MEM-005 — raw chat is NOT
  durable; only capture sources from `docs/14-context-memory/lifecycle.md`.
  `beginSession` returns no rows (no storage engine in v1, no raw chat;
  ADR-0013 canonical-outranks-memory).
- **Consolidation (P08-09):** handoff → memory rows with provenance, source
  mapping (`task-evidence`, `decision`, `blocker-resolution`), sensitivity
  (blocked → `internal`), dedupe by (source, provenance), supersede by later
  sort position, `capturedAt` stamped at consolidation.
- **Change Engine (P08-11):** `newChange` (ChangePackageSchema-valid,
  ADDED/MODIFIED/REMOVED deltas), `apply` (stamps decision, provenance,
  refuses double-apply/invalid decisions), `archive`.

## Consequences

- Workflow engines are schema-fed: workflows serialize to @planmo/schema
  documents (HandoffDocument, WorkPacket, ChangePackage), so CLI commands in
  later phases are thin read/validate/apply shells over these engines.
- Time is injected everywhere — tests are fully deterministic.
- Ownership conflicts fail loudly instead of silently splitting work.
- The `workflow` boundary grew by one edge (agent-bridge) vs the pre-registered
  `['core','shared']` — justified by REQ-CTX-001..005 (budgeted bundle for
  `planmo next`); recorded in DECISIONS.