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
