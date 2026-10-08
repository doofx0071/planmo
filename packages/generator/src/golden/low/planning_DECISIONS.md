# Decision Log

Architecture Decision Records for this project. One entry per decision,
newest first. A decision is not closed until its consequences are recorded.

## Recorded at generation

These follow from `.planmo/project.yml` and are the starting position:

- **D-000 — Project type is `web-application`.** Lifecycle: `greenfield`; risk: `medium`.
- **D-001 — Planning depth is `lean`.** The phase spine is pruned to 4 phases accordingly.
- **D-002 — Phases run `continuous`.** A handoff is still recorded at every phase boundary.
- **D-003 — Primary agent is `opencode`.** Agent integrations are adapters; project state stays agent-neutral.
- **D-004 — Design is `minimal`, `comfortable` density, target `aa`.** Accessibility outranks visual style.

## Template

### D-NNN — <decision>

- Status: proposed | accepted | superseded by D-NNN
- Context: <what forced a choice>
- Decision: <what was chosen>
- Consequences: <what becomes easier, what becomes harder>
- References: <docs, issues, ADRs>
