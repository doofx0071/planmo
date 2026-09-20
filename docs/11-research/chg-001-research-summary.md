# Context, Memory, and Agent-Workflow Research Summary

## Key finding

PlanMo should separate **authoritative project state** from **derived memory**.

Persistent memory can reduce repeated context loading, but stale or poisoned memory can also make agents confidently wrong. PlanMo therefore needs provenance, supersession, scopes, token budgets, and a clear authority hierarchy.

## Patterns worth adopting

### Aider — token-budgeted repository map
Aider creates a concise map of important repository symbols and dynamically selects the most relevant portions for a token budget instead of sending the entire repository.

PlanMo adaptation:
- build a rebuildable repository context map;
- budget context by task;
- include paths/symbols/signatures before full source bodies;
- read full code only when required.

### Serena — project onboarding + file memories
Serena performs project onboarding, writes memories under the repository, and recommends switching to a fresh conversation after onboarding. It also emphasizes reading only the necessary symbol bodies.

PlanMo adaptation:
- explicit project onboarding/context indexing;
- persistent project knowledge;
- fresh-session workflow remains first-class;
- memory retrieval before broad file reads.

### Claude-Mem / claudemem — progressive disclosure and session recall
Projects in this space preserve session summaries or observations across conversations and retrieve only relevant memory.

PlanMo adaptation:
- store durable session outcomes, not whole chat transcripts by default;
- progressive disclosure:
  1. tiny context capsule;
  2. relevant memory index;
  3. selected details;
  4. source files only when needed.

### OpenHands — project/user memory tiers
OpenHands demonstrates opt-in project and user memory loaded at session start.

PlanMo adaptation:
- project memory is primary;
- optional user/global preferences can exist later;
- project memory must never override canonical repository state.

### FastContext / Aide
FastContext separates repository exploration from the main coding solver so exploratory reads do not pollute the solver's context.

PlanMo adaptation:
- a read-only Context Explorer can locate relevant files/symbols;
- the implementation agent receives compact evidence/citations rather than exploration history.

### Mem0
Mem0 shows the value of persistent memories, scoped identifiers, metadata, expiration, and hybrid retrieval.

PlanMo adaptation:
- memory records include scope, type, provenance, importance, validity, expiration/supersession;
- semantic retrieval is optional, not required for the deterministic core.

### Graphiti
Graphiti emphasizes temporal facts, provenance, and hybrid graph/semantic/keyword retrieval.

PlanMo adaptation:
- PlanMo should model `valid_from`, `valid_to`, `superseded_by`, and source provenance from the beginning;
- a graph backend is a future adapter, not a v1 dependency.

### OpenMemory
OpenMemory focuses on porting coding sessions between coding harnesses.

PlanMo adaptation:
- context bundles and durable project memory should be agent-neutral and exportable;
- adapter-specific session formats must not become canonical state.

## Recommended maturity ladder

### V1
- repository/phase/session context capsules;
- deterministic lexical index;
- repo map;
- provenance;
- handoff-derived episodic memory;
- standards/procedure memory;
- token budgets;
- local-first storage;
- portable JSON/Markdown export.

### V1.x
- optional embeddings;
- semantic + lexical hybrid retrieval;
- learned retrieval weights only behind evaluation.

### V2+
- temporal/knowledge graph adapter;
- cross-repository memory;
- team/shared memory;
- remote memory providers.

## What not to do initially

- Do not embed every source file by default.
- Do not treat raw chat history as durable memory.
- Do not make a hosted memory service mandatory.
- Do not let memory override Git, ADRs, schemas, tracker, or current source.
- Do not persist secrets or unrelated personal data.
- Do not inject every memory into every prompt.
