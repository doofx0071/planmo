# Phase 01 — Repository & engineering foundation

## Objective
Create monorepo toolchain, strict types, lint/format/test, CI, boundaries..

## Phase mode
Phases run continuously; a handoff is still recorded at every phase boundary.

## Test & evidence gate
- unit tests
- typecheck
- lint
- format:check

## Exit gates
- [ ] Generation is byte-stable for identical inputs.
- [ ] Generated artifacts are recorded in `.planmo/manifest.json`.
- [ ] Regeneration preserves user-owned content.

## Required phase handoff
Create `planning/handoffs/phase-01-handoff.md` containing completed task IDs, task statuses and blockers, material changes, tests and evidence, security and reliability findings, decisions/ADRs, current Git state, known debt, and exact next-phase instructions.

## Stop rule
**Record the phase handoff at the phase boundary before starting the next phase.**
