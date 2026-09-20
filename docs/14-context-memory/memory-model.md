# Memory Model

## Memory types

### Semantic / project memory
Stable facts and accepted knowledge.

Examples:
- "Canonical design tokens use DTCG."
- "Phase sessions hard-stop before the next phase."

### Episodic / session memory
What happened.

Examples:
- a migration failed for a specific reason;
- Phase 03 introduced the safe writer;
- a provider integration was rejected.

### Procedural memory
How work should be done.

Examples:
- release steps;
- coding standards;
- required test commands;
- repository-specific workflows.

### Reference context
Repository symbols/paths/relationships are better modeled as rebuildable context, not durable memory.

## Proposed record shape

Each durable record should include:

- `id`
- `schema_version`
- `type`
- `scope`
- `title`
- `content`
- `tags`
- `importance`
- `source_refs`
- `source_hashes`
- `created_at`
- `valid_from`
- `valid_to`
- `superseded_by`
- `expires_at`
- `trust_class`
- `sensitivity`
- optional `embedding_ref`

## Scope

Suggested scopes:
- project
- package/module
- phase
- task
- agent-neutral user/global (future, opt-in)

Branch-specific facts should be used cautiously because branches are transient.

## Correction

Prefer supersession over destructive rewriting when historical context matters.

Example:
`MEM-001` becomes invalid and points to `MEM-019`.
