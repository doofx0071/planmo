# Context Bundle

## Capsule

Project: PlanMo
Phase: 06
Tasks: P06-07, P06-08

## Non-negotiable invariants

- Canonical project state outranks memory.
- AI proposals are schema-validated.
- Packs are non-executable in v1.

## Applicable standards

- TypeScript strictness
- package boundary policy
- deterministic serialization
- negative-path tests

## Relevant decisions

- ADR-0001 CLI-first / agent-native
- ADR-0008 memory authority model

## Relevant repository map

- `packages/core/...`
- `packages/agent-bridge/...`

## Relevant memories

- references only; expand on demand

## Required tests

- token budget enforcement
- deterministic ordering
- stale memory exclusion
- prompt-injection classification
