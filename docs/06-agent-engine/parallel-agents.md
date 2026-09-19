# Parallel Agent Model

Parallelism is intra-phase only by default.

Coordinator:
- decomposes independent tasks;
- assigns file ownership;
- integrates;
- runs final checks;
- owns phase completion.

Workers:
- exact task IDs;
- allowed/forbidden paths;
- tests;
- assumptions/blockers report.

Initial recommendation: max 3 workers + coordinator. Prefer Git worktrees where supported. Security-critical work can use builder + breaker.
