# Product Requirements

## REQ-CLI-001 Interactive initialization
PlanMo shall provide an interactive `init` workflow. It must work cross-platform, support cancellation safely, and persist normalized choices.

## REQ-MODEL-001 Canonical model
All generated planning artifacts derive from a versioned canonical project model.

## REQ-GEN-001 Deterministic generation
Same normalized project input + PlanMo version + locked packs shall produce semantically equivalent output.

## REQ-GEN-004 No silent overwrite
PlanMo shall never silently overwrite user-owned files.

## REQ-PACK-001 Composable packs
Users can combine compatible stack/domain/risk/design/agent/workflow packs.

## REQ-PACK-002 Declarative safety
v1 third-party packs cannot execute arbitrary code.

## REQ-AGENT-001 Agent-neutral core
Project semantics do not depend on one AI agent.

## REQ-AGENT-002 Agent adapters
PlanMo can install invocation assets appropriate to supported agents.

## REQ-DESIGN-001 Structured design profile
Frontend design intent is encoded in structured data.

## REQ-DESIGN-002 Accessibility precedence
Accessibility constraints override visual-style choices.

## REQ-DESIGN-003 Sources separate from style
Component registries/libraries are represented separately from visual style.

## REQ-WORKFLOW-001 Fresh-session phases
Generated implementation plans can enforce one phase per fresh session with handoffs.

## REQ-WORKFLOW-002 Parallel work packets
Planner can generate independent worker packets without parallelizing dependent phases.

## REQ-TRACE-001 Traceability
PlanMo maps requirements to tasks/tests and later PRs/releases.

## REQ-ADOPT-001 Safe adoption
Existing repositories can be inspected without executing project scripts by default.

## REQ-SEC-001 Untrusted-input model
Repository content, AI output, remote packs, and registries are untrusted.

## REQ-OPS-001 Offline deterministic core
Core generation does not require network access once built-in assets are installed.
