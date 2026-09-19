# ADR-0005 — Hard phase stops and fresh agent sessions

**Status:** Accepted

Generated implementation roadmaps default to one phase per AI-agent session with a repository handoff at each boundary.

Parallel workers may operate only on independent work inside the same phase unless a workflow explicitly states otherwise.
