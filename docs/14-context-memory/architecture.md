# Context & Persistent Memory Architecture

## Core principle

**Memory is not the source of truth.**

PlanMo has four context layers:

### Layer A — Canonical authority
Authoritative:
- source code;
- Git state/history;
- `.planmo/project.*`;
- schemas/state/lock/manifest;
- accepted ADRs;
- requirements;
- tracker/task graph;
- current phase/handoff.

If memory conflicts with Layer A, Layer A wins.

### Layer B — Durable project memory
Distilled, persistent, provenance-bearing knowledge:
- stable project facts;
- important decisions/consequences;
- previous failed approaches;
- procedural knowledge;
- session outcomes.

### Layer C — Rebuildable context index
Derived from repository state:
- file map;
- symbol map;
- dependency graph;
- doc index;
- test map;
- lexical/semantic search index.

It can be deleted and rebuilt.

### Layer D — Working context
Temporary context for the current task:
- selected standards;
- relevant memories;
- relevant symbols;
- recent diffs;
- task/phase constraints.

It should be small and disposable.

## Design goal

A new AI session should be able to run:

`planmo next`

and receive enough bounded context to continue without re-reading the entire repository.
