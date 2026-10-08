# Master Plan — fixture-app

## Goal

Deliver the web-application described by this plan, starting from a greenfield state.

## Scope

- Project type: web-application
- Lifecycle: greenfield
- Risk: medium
- Planning depth: standard
- Phase mode: gated

## Stack

- language: typescript
- frontend: react
- test: vitest

## Phase spine

| Phase | Title | Objective |
|---|---|---|
| 00 | Product & research foundation | Lock product boundaries, naming, licensing criteria, and non-goals. |
| 01 | Repository & engineering foundation | Create monorepo toolchain, strict types, lint/format/test, CI, boundaries. |
| 02 | Canonical project model & schemas | Schema-version every persisted PlanMo document and add migration tests. |
| 03 | CLI foundation | Implement init, safe filesystem writer, dry-run/diff, ownership rules, status. |
| 04 | Pack & profile system | Implement declarative packs, deterministic resolution, lockfile, profiles. |
| 05 | Planning compiler & artifact generator | Generate plan documents with an ownership manifest and reproducible regeneration. |
| 06 | Agent bridge | Implement generic and per-agent adapters with a structured AI proposal contract. |

## Deliverables

1. A working implementation of the scope above.
2. Tests and evidence for every phase exit gate.
3. Documentation updated alongside the code.
4. Traceability from requirement to task to test.

## Exit gates

- unit tests
- typecheck
- lint
- format:check

## Non-goals

_Record the non-goals here: what this project deliberately will not do._
