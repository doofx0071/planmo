# Phase 06 Handoff — Agent Bridge

Status: **COMPLETE** (2026-09-20)
Branch: `feat/phase-06-agent-bridge` → PR (merged to `main`)
Gate: `pnpm check` exit 0 — build, typecheck, test (340), lint, format:check; boundaries OK
Next phase: Phase 07 — Frontend design engine (+ Phase 08 workflow/session engine later)

## What shipped

New packages:
- `packages/adapters` — pure argv+prompt adapters, boundary `['core','shared']` (imports nothing from schema; agent-neutral by design):
  - `generic.ts` (P06-02): argv empty, prompt = output; only `supportsInlineContext: true`; explicit degradation notes.
  - `opencode.ts` (P06-03): `opencode run <prompt> [--format json] [-f <handle>...] [-c]` — flags request-driven, pinned order.
  - `codex.ts` (P06-04): `codex exec <prompt> --sandbox workspace-write` — EXTENSION adapter, not v1-primary (ADR-0008 reconcile).
  - `claude-code.ts` (P06-05): `claude -p <prompt> --output-format json ...` — v1-primary.
  - `contract.ts` (frozen): `AgentRequest`/`AgentInvocation`/`AgentAdapter`/`AdapterCapabilities`/`CapabilityDegradation` + structural `ContextView`/`StandardView`/`PacketView`/`MemoryRowView`.
- `packages/agent-bridge` — boundary `['core','shared','schema','adapters']`:
  - `registry.ts` (P06-01): `createRegistry` + `createDefaultRegistry` (generic/opencode/claude-code + codex extension), duplicate-refusal, deterministic ids, `resolve` with explicit error/degradation.
  - `proposal.ts` (P06-06, critical): `AiProposalSchema.safeParse` boundary; strict object (agent/requestId/items deltas); unknown keys fail; nothing partial applied.
  - `context-bundle.ts` (P06-07): token-budget compiler, L0 capsule / L1 index / L2 evidence caps, sorted handles; `createContextProvider(reader)` injected (deterministic).
  - `standards-injector.ts` (P06-08): precedence-tier-then-id ordering render.
  - `memory-provider.ts` (P06-10): explicit no-op rows (`no-durable-memory`), never fabricates; no hosted engine in v1.
  - `execution-packet.ts` (P06-11): `PacketView`+`ContextView` → self-contained block.
  - `providers.ts` (frozen): `ContextProvider`/`MemoryProvider`/`StandardsInjector`/`PacketRenderer` interfaces + `ProposalValidator`.
- `@planmo/schema` additions: `AiProposalSchema` + `ContextBundleSchema` (`packages/schema/src/agent-bridge.ts`, strict objects, versioned) — 9 schema tests.

## Acceptance evidence

- Adapters snapshot tests (argv + prompt shapes, degradation lists, determinism, capped/progressive bundle).
- Registry: unknown id → explicit error (not silent); duplicates throw.
- Proposal gate: malformed / future-version / array input rejected with diagnostics; input never mutated.
- E2E proof `scripts/e2e-phase06.mjs`: all four adapters render, proposal valid+invalid paths, re-render byte-identical → `PHASE 06 E2E OK`.
- Full gate 340 tests, 31 files; `node scripts/check-boundaries.mjs` OK.

## Decisions / reconciliations

- ADR-0020 accepted (capabilities, validation, context bundles).
- Codex: task P06-04 existed but ADR-0008 excluded codex from v1 — shipped as extension adapter behind the default registry; canonical `AGENT_IDS` unchanged (`opencode | claude-code | generic`).
- Memory: no storage engine in v1 (ADR-0013); provider returns explicit no-op rows.
- Registry `resolve(id, requested)` — requested capabilities flow to the adapter's own `degradations()` for note rendering.

## Workers

3 parallel subagents (dispatch `deleg_955c619f`): A = generic+opencode adapters, B = codex+claude-code adapters, C = bridge CHG-001 (bundle/injector/memory/packet). Worker B delivered verified code + tests. Workers A and C burned their budgets on design without writing files — lead implemented those scopes directly (same frozen contracts).

## Phase 07 heads-up

- Phase 07 is the FRONTEND design engine (not the CLI runner); Phase 08 is the workflow/session engine.
- `scripts/e2e-phase06.mjs` shows the composition seam for the CLI runner: registry → provider → adapter render → proposal validation.
- `.planmo/state.yml` → currentPhase 07, `nextPrompt: prompts/08-phase-07-frontend-design-engine.md`.

## Tasks

P06-01..06 + CHG-001 P06-07..11 → DONE (11); total DONE 49. Tracker/state/traceability/DECISIONS/CHANGELOG/changeset updated. MANIFEST regenerated (must equal `git ls-files`).