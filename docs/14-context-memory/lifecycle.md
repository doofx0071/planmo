# Memory Lifecycle

## Capture sources

Preferred durable-memory sources:
- accepted ADRs/decisions;
- phase handoffs;
- task completion evidence;
- resolved blockers;
- explicit user/project preferences;
- accepted standards.

Raw chat/session transcripts are not durable memory by default.

## Session start

1. resolve active phase/task;
2. load canonical state;
3. query context/memory;
4. compile bounded Context Bundle;
5. inject via agent adapter.

## During session

Potential memory candidates may be collected but should not immediately become authoritative.

## Session close

1. create handoff;
2. identify durable deltas;
3. deduplicate;
4. attach provenance;
5. classify sensitivity;
6. write accepted/certain memories;
7. supersede outdated memories;
8. refresh affected indexes.

## Freshness

Indexes tie entries to file/source hashes or Git commit/tree identifiers where useful. When authoritative sources change, stale derived context should be invalidated or marked stale.

## Pruning

Support:
- expiration;
- supersession;
- manual forget;
- low-value pruning;
- rebuild of derived indexes.

Never rely on pruning to delete the authoritative project history.
