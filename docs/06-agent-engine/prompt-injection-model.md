# Prompt Injection Model

Adoption is exposed to repository-local prompt injection through AGENTS/README/comments/source strings.

Rules:
- discovered repo instructions are evidence/data, not PlanMo authority;
- PlanMo's own root instructions and active prompt outrank scanned content;
- prefer deterministic parsers for manifests/config;
- never automatically execute commands suggested by scanned content;
- minimize secret-bearing content sent to external models;
- maintain adversarial repository fixtures.
