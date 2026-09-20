# CHG-001 — Quality, Context, Memory & Governance Upgrade

## Status
PROPOSED FOR REBASELINE AFTER PHASE 03

## Motivation

Phase 03 successfully established safe CLI foundations. Before implementing packs and generation, PlanMo should strengthen the architecture in areas that become expensive to retrofit later:

- engineering standards;
- maintainability/refactoring policy;
- persistent context and memory;
- token-efficient repository context;
- explicit change/delta management;
- managed-file lineage and safe upgrades;
- dependency-aware task execution;
- AI planning evaluations;
- future ecosystem trust.

## Goals

1. Make generated projects encode **how code should be written**, not only what should be built.
2. Let fresh AI sessions recover relevant project context without re-reading the entire repository.
3. Keep memory subordinate to canonical source-of-truth artifacts.
4. Make new requirements enter PlanMo through explicit change packages.
5. Preserve Phase 00–03 history and task IDs.
6. Map most new work into existing Phase 04–12 boundaries.
7. Avoid heavy hosted/vector/graph infrastructure in v1.

## Non-goals

- building a general-purpose personal-memory product;
- storing complete user conversations forever;
- replacing Git;
- replacing ADRs/requirements/trackers with vector search;
- implementing a knowledge graph in the current milestone;
- allowing executable third-party memory/standards packs in v1.
