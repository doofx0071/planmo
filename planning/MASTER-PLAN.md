# PlanMo Master Plan

## Objective
Build PlanMo as a production-quality developer tool that converts a software idea or existing codebase into a structured, agent-ready project workspace.

PlanMo solves:
1. discovery;
2. planning;
3. frontend/design planning;
4. security/risk scaling;
5. AI-agent session orchestration;
6. traceability.

## Product boundaries
PlanMo v1 is not:
- an autonomous coding agent;
- an IDE;
- a Git replacement;
- a package manager;
- a general shell-execution workflow engine;
- a required hosted SaaS;
- an unrestricted plugin runtime.

## Architecture
```text
CLI / Agent Adapter / Optional Direct AI
               |
               v
        Context + Discovery
               |
               v
       Canonical Project Model
               |
    +----------+-----------+
    |          |           |
 Packs      Policies    Profiles
    |          |           |
    +----------+-----------+
               |
               v
        Planning Compiler
               |
     +---------+---------+
     |         |         |
 Generator  Validator  Trace Graph
     |         |         |
     +---------+---------+
               |
               v
     Project Files + Manifest
```

## Deterministic boundary
Same PlanMo version + normalized model + locked packs + generation options must produce semantically equivalent output.

AI may propose model changes but does not bypass validation or file ownership rules.

## Canonical state
```text
.planmo/
├── project.yml
├── state.yml
├── lock.yml
├── manifest.json
└── cache/
```

## Package architecture
```text
packages/
├── cli/
├── core/
├── schema/
├── generator/
├── scanner/
├── packs/
├── workflow/
├── trace/
├── design-engine/
├── agent-bridge/
├── adapters/
├── testing-fixtures/
└── shared/
```

## Stack direction
- TypeScript
- Node.js 24 LTS baseline
- pnpm workspace
- Zod
- YAML
- `@clack/prompts`
- command router chosen in Phase 01 via ADR
- Vitest
- Changesets
- GitHub Actions
- DTCG design tokens
- shadcn as adapter/source, not core dependency

Exact versions are pinned in Phase 01 after compatibility verification.

## Planning profiles
- Lean
- Standard
- Production
- High Assurance
- Custom

Risk/complexity adjusts generated artifacts.

## Initial design styles
- minimal
- editorial
- neobrutalism
- soft-product
- dense-dashboard
- developer-tool
- luxury
- playful

## Packs
Categories:
- stack
- domain
- risk
- design
- agent
- workflow

Packs are declarative in v1; no arbitrary lifecycle scripts.

## Quality
Every critical feature requires:
- unit tests;
- integration tests;
- golden fixtures;
- negative/security tests;
- deterministic regeneration tests;
- cross-platform tests where relevant.

## Standards, quality, context & memory (CHG-001, accepted 2026-09-20)
- Engineering standards are structured, stack-aware concepts selected per task (ADR-0012) — never a giant prompt with every rule.
- Quality findings are concrete and evidence-backed (ADR-0012); unrelated stylistic refactoring is forbidden; tracked debt carries reason/risk/target (see AGENTS.md engineering-quality rules).
- Canonical repository state is the single source of truth; memory is derived, provenance-bearing, temporally valid, scope-filtered, secret-safe, token-budgeted and rebuildable (ADR-0013/0014). Raw chat transcripts are not durable memory by default.
- Context/memory is local-first; a deterministic lexical baseline is the v1 retrieval engine; embeddings and hosted/graph services are optional adapters only.
- Substantial post-plan changes enter through change packages with ADDED/MODIFIED/REMOVED requirement deltas (ADR-0015).
- Generated files carry ownership classes (generated/merged/seeded/user) and lineage, with upgrade preview before destructive changes (ADR-0016).
- Tasks form an explicit dependency graph with ready/blocked computation, lease-based claims, and bounded execution packets (ADR-0017).

## Release
SemVer. `1.0.0` requires stable schema migration policy, safe manifest ownership, tested upgrade path, cross-platform validation, security review, and pilot evidence.

## Execution
One fresh AI-agent session per phase. Up to 3 parallel workers inside a phase only.
