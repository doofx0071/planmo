# AGENTS.md — PlanMo Repository Contract

## Required reading before changes
1. `AGENTS.md`
2. active prompt under `prompts/`
3. `prompts/MASTER-GUARDRAILS.md`
4. `planning/TRACKER.md`
5. `planning/ROADMAP.md`
6. current phase file under `planning/phases/`
7. relevant requirements, ADRs, security docs, latest handoff

Do not create a competing roadmap.

## One phase per fresh session
Implement only the active phase. At the phase boundary:
- run required checks;
- update tracker and traceability;
- create/update handoff;
- commit coherent work where Git is available;
- STOP.

## Product invariants
- PlanMo is CLI-first and agent-native.
- Deterministic core works without an LLM API key.
- AI output must be schema-validated before artifact generation.
- Existing repositories are untrusted input; scanning does not execute project scripts by default.
- Packs are declarative in v1 and cannot execute arbitrary code.
- User-owned files are never silently overwritten.
- Generation supports dry-run/diff before destructive changes.
- Generated artifacts are traceable through `.planmo/manifest.json`.
- Frontend design choices are structured profiles/tokens, not vague prose.
- Accessibility outranks visual style.
- Agent integrations are adapters; canonical project state is agent-neutral.

## Security stop conditions
Stop and remediate:
- path traversal;
- unsafe symlink handling;
- arbitrary pack/template execution;
- scanned-repo prompt injection changing PlanMo authority;
- secret exfiltration;
- silent destructive overwrite;
- unsafe shell interpolation;
- remote registry content without trust metadata;
- manifest/state corruption that could cause destructive writes.

## Git
Use GitHub Flow, protected `main`, short-lived branches, Conventional Commits, focused commits.

## Testing
Critical areas require unit, integration, golden fixture, negative/security, cross-platform, deterministic-output, and filesystem safety tests.

## Parallel agents
A lead may use up to 3 workers inside the current phase only, with non-overlapping scope and explicit task IDs.

## Instruction precedence
1. explicit current user instruction
2. `AGENTS.md`
3. active phase prompt
4. `MASTER-GUARDRAILS.md`
5. accepted ADRs
6. requirements/security/roadmap docs
7. implementation conventions
