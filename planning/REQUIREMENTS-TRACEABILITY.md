# Requirements Traceability

Model:
`Requirement -> Decision/Risk/Threat -> Control -> Task -> Test -> PR -> Release`

Requirement families:
- `REQ-CLI-*`
- `REQ-MODEL-*`
- `REQ-PACK-*`
- `REQ-GEN-*`
- `REQ-AGENT-*`
- `REQ-DESIGN-*`
- `REQ-WORKFLOW-*`
- `REQ-TRACE-*`
- `REQ-ADOPT-*`
- `REQ-SEC-*`
- `REQ-OPS-*`

Example:
`REQ-GEN-004 No silent overwrite -> R-007 -> ownership/dry-run -> P03/P05 -> filesystem/generator tests -> PR -> release`

## Phase 00 trace

| Requirement family | Decision/artifact | Task | Test/evidence |
|---|---|---|---|
| Product positioning / non-goals | README, `docs/01-product/`, `planning/DECISIONS.md` | P00-01 | Consistency review 2026-09-19 |
| Naming / distribution | ADR-0007, `docs/11-research/naming-and-availability.md` | P00-02 | npm registry + GitHub verification 2026-09-19 |
| Support matrix (REQ-AGENT-001/002, REQ-DESIGN-003) | ADR-0008, `docs/11-research/support-matrix.md` | P00-03 | Official-source verification 2026-09-19 |
| Research baseline | `docs/11-research/2026-source-notes.md` | P00-04 | registry/nodejs.org/designtokens.org lookups 2026-09-19 |
| Licensing criteria | `docs/11-research/licensing.md` | P00-05 | Criteria review; final license deferred to Phase 12 |
