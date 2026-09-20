'@planmo/schema': minor
'@planmo/workflow': minor
---

Phase 08 — Workflow/session engine: validated phase transitions (exit gates, double-advance refusal, hard-stop fresh sessions), resume-sufficient schema-valid handoff builder, `planmo next` with token-budgeted agent-neutral context bundle (via agent-bridge `compileContextBundle`), parallel work packet compiler with fail-fast non-overlapping ownership, pure human/blocking gate evaluator, task DAG (cycles/ready/ordered), claim/lease manager with injected clock, session memory lifecycle (raw chat never durable), handoff-to-memory consolidation with provenance + supersession, and the Change Engine (`ChangePackageSchema`, ADDED/MODIFIED/REMOVED deltas, add decision on apply, archive). CHG-001 REQ-WRK-001..003 (DAG/leases/packets), REQ-CTX-001..005 (budgeted next-bundle), REQ-MEM-001..010 (lifecycle/consolidation), REQ-CHG-001..004 (change workflow). ADR-0022.
