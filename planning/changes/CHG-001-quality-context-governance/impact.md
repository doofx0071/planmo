# CHG-001 Impact Analysis

## Phase 03

Phase 03 is complete and remains historically stable.

Existing safe filesystem writer, dry-run, ownership/collision handling, status command, and tests are valuable prerequisites for CHG-001.

Potential follow-up only:
- verify the managed-writer model can represent future ownership classes and lineage;
- if not, create a new compatibility task instead of reopening completed P03 tasks.

## Future architecture

### Phase 04 — Packs & profiles
Add:
- standards packs;
- engineering policy inheritance;
- memory/context policy metadata;
- provenance fields;
- bundle/profile composition metadata.

### Phase 05 — Compiler/generator
Add:
- managed-file ownership classes;
- lineage metadata;
- safe regeneration/upgrade preview;
- generation of standards/context docs;
- generated context bootstrap artifacts.

### Phase 06 — Agent bridge
Add:
- Context Bundle contract;
- Standards Injector;
- agent-neutral memory/context adapter interface;
- structured memory proposals;
- Execution Packet rendering.

### Phase 07 — Design engine
Add:
- design standards as structured standards;
- frontend quality/accessibility anti-pattern checks.

### Phase 08 — Workflow/session engine
Add:
- task DAG;
- ready/blocked calculation;
- claims/leases;
- session-close memory extraction;
- handoff -> episodic memory;
- context bundle generation for `planmo next`;
- Change Engine workflow.

### Phase 09 — Validate/doctor/drift
Add:
- standards drift;
- architecture fitness;
- technical-debt diagnostics;
- stale/superseded memory checks;
- context index health;
- lineage/ownership diagnostics.

### Phase 10 — Existing repo adoption
Add:
- repository context map;
- standards discovery;
- reference implementation discovery;
- prompt-injection-safe indexing;
- context index generation;
- optional memory bootstrap.

### Phase 11 — Ecosystem
Add:
- standards/context packs;
- optional memory provider adapters;
- trust/provenance metadata;
- portable context export.

### Phase 12 — Hardening
Add:
- memory poisoning tests;
- retrieval quality evals;
- token benchmark;
- stale-memory tests;
- context budget regression tests;
- future trust prototype.
