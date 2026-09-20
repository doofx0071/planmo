# Retrieval & Token Budget

## Goal

Reduce context usage without hiding critical constraints.

## Progressive disclosure

### Level 0 — Context capsule
Very small:
- project;
- phase/task;
- branch;
- active blockers;
- key invariants;
- relevant paths.

### Level 1 — Relevant index
- selected decisions;
- standards;
- memory titles/summaries;
- repository map fragments;
- tests/contracts.

### Level 2 — Selected evidence
Load full memory records, ADR excerpts, docs, symbol signatures.

### Level 3 — Source bodies
Read full code/files only when necessary.

## Ranking

Baseline ranking should be understandable and testable. Candidate signals:
- exact/lexical match;
- task/path scope match;
- requirement links;
- freshness;
- importance;
- provenance confidence;
- dependency/reference relationship.

Optional semantic similarity can be fused later.

## Budget

A `ContextRequest` should contain an explicit budget rather than "include everything."

Possible allocation:
- 10% capsule/invariants
- 20% standards/constraints
- 20% memory/decisions
- 30% repo map/references
- 20% task-specific evidence

These are starting heuristics, not hard universal numbers.

## Overflow

If the budget is insufficient:
1. preserve security/invariants;
2. preserve task acceptance criteria;
3. preserve directly referenced contracts;
4. compress/reduce secondary history;
5. provide retrieval handles for on-demand expansion.
