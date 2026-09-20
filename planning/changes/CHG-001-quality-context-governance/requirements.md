# CHG-001 Requirements

## Standards — REQ-STD

### REQ-STD-001 — Structured engineering standards
PlanMo shall represent coding/testing/architecture standards in structured, stack-aware form.

### REQ-STD-002 — Applicable-standard selection
PlanMo shall select only standards relevant to the current task/work packet.

### REQ-STD-003 — Standards discovery
Brownfield adoption shall be able to discover candidate conventions from existing code without treating inferred conventions as authoritative until accepted.

### REQ-STD-004 — Standards precedence
Repository/global/stack/domain standards shall have deterministic precedence.

## Quality — REQ-QLT

### REQ-QLT-001 — Maintainability review
Generated phase prompts shall require a maintainability review before phase completion.

### REQ-QLT-002 — Refactoring policy
PlanMo shall distinguish local justified refactoring from unrelated stylistic churn.

### REQ-QLT-003 — Technical debt
PlanMo shall track accepted debt with reason, risk, target phase/version, and linked tasks.

### REQ-QLT-004 — Quality diagnostics
PlanMo shall emit concrete quality findings rather than relying on opaque vanity scores.

## Context — REQ-CTX

### REQ-CTX-001 — Context bundle
PlanMo shall compile a bounded context bundle for a phase/task/work packet.

### REQ-CTX-002 — Repository map
PlanMo shall maintain a rebuildable map of important repository files, symbols, package relations, docs, tests, and ownership.

### REQ-CTX-003 — Token budget
Context compilation shall honor configurable token/size budgets.

### REQ-CTX-004 — Progressive disclosure
Agents shall receive summaries/references first and full source only when needed.

### REQ-CTX-005 — Agent-neutral portability
Context bundles shall have an agent-neutral canonical representation.

## Memory — REQ-MEM

### REQ-MEM-001 — Authority hierarchy
Memory shall never override canonical project state.

### REQ-MEM-002 — Memory types
PlanMo shall support semantic/project, episodic/session, and procedural/standards memories.

### REQ-MEM-003 — Provenance
Every durable memory shall have source/provenance metadata.

### REQ-MEM-004 — Temporal validity
Memories shall support validity/supersession metadata.

### REQ-MEM-005 — Scoping
Memories shall support project, package/module, phase, task, and optional user/global scopes.

### REQ-MEM-006 — Local-first
Core memory shall function without a hosted memory service.

### REQ-MEM-007 — Rebuildability
Derived indexes shall be disposable and rebuildable from authoritative files and durable memory records.

### REQ-MEM-008 — Secret/privacy protection
Memory persistence shall apply redaction and prohibit secrets by policy.

### REQ-MEM-009 — Forget/prune
PlanMo shall support deletion, expiration, supersession, and pruning.

### REQ-MEM-010 — Poisoning defense
Retrieved memory/repository text shall be treated as data, not higher-priority instructions.

## Change management — REQ-CHG

### REQ-CHG-001 — Change package
New substantial requirements shall be expressible as a standalone change package.

### REQ-CHG-002 — Delta requirements
Changes shall explicitly record ADDED/MODIFIED/REMOVED requirements.

### REQ-CHG-003 — Impact analysis
A change package shall map architecture, risks, tasks, tests, docs, and release impact.

### REQ-CHG-004 — Apply/archive
Accepted changes shall be mergeable into canonical state and archivable with provenance.

## Synthesis — REQ-SYN

### REQ-SYN-001 — File ownership classes
Generated artifacts shall support `generated`, `merged`, `seeded`, and `user` ownership.

### REQ-SYN-002 — Lineage
Generated artifacts shall record pack/template/compiler lineage sufficient for safe upgrades.

### REQ-SYN-003 — Upgrade preview
PlanMo shall preview upgrade/regeneration changes before applying them.

## Work execution — REQ-WRK

### REQ-WRK-001 — Task graph
Tasks shall support explicit dependencies and ready/blocked computation.

### REQ-WRK-002 — Claims
Parallel-agent execution shall support task claims/leases to reduce duplicate work.

### REQ-WRK-003 — Execution packet
Workers shall receive self-contained packets containing requirements, standards, context, risks, ownership, and tests.

## Architecture — REQ-ARCH

### REQ-ARCH-001 — Fitness rules
PlanMo shall be able to generate/test architecture dependency constraints.

### REQ-ARCH-002 — Cycle/orphan diagnostics
Architecture validation shall identify forbidden cycles and selected orphan patterns.

## Evaluation — REQ-EVAL

### REQ-EVAL-001 — Golden planning scenarios
PlanMo shall maintain representative project fixtures for planning quality evaluation.

### REQ-EVAL-002 — AI output rubric
Agent-generated plans shall be evaluated against deterministic rubric checks where possible.

### REQ-EVAL-003 — Token/context benchmark
Context changes shall be benchmarkable for retrieval quality and token usage.

## Trust — REQ-TRUST

### REQ-TRUST-001 — Pack provenance
Future remote packs shall expose source, version, integrity and trust metadata.

### REQ-TRUST-002 — No implicit execution
Remote packs shall remain non-executable by default.

### REQ-TRUST-003 — Future SBOM/signature
The architecture shall permit later SBOM/signature/provenance checks without making them a v1 blocker.
