# ADR-0017 — Task Graph, Claims, and Execution Packets

**Status:** Accepted (CHG-001; originally proposed as pack ADR-0012, unchanged number)

PlanMo tasks become an explicit dependency graph with ready/blocked state.

Parallel-agent work may use claim leases.

Each worker receives a bounded Execution Packet containing requirements, standards, context, risks, ownership, and tests.

See `docs/15-change-governance/task-graph-execution-packets.md`.