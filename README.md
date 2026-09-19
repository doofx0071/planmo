# PlanMo

**PlanMo** is a CLI-first, agent-native planning system that turns a software idea or an existing codebase into an execution-ready workspace for AI coding agents and human engineers.

PlanMo is inspired by the strengths of spec-driven tools such as GitHub Spec Kit, but its product center is broader: **project planning, design-system planning, risk/security planning, agent-session orchestration, traceability, handoffs, and validation across the full project lifecycle**.

## Product thesis

AI coding agents work best when the repository itself carries durable project memory. PlanMo therefore makes the repository the source of truth for requirements, architecture, roadmap, risks, design direction, agent rules, testing, handoffs, and traceability.

```text
Idea / Existing Repository
        |
        v
Discovery + Clarification
        |
        v
Normalized Project Model
        |
        +--> Stack / Domain / Risk / Design / Agent Packs
        |
        v
Planning Compiler
        |
        +--> AGENTS.md
        +--> docs/
        +--> planning/
        +--> prompts/
        +--> design/
        +--> .github/
        +--> .planmo/
        |
        v
AI Agent Implementation Sessions
        |
        v
Handoff -> Fresh Session -> Next Phase
```

## CLI-first + agent-native

The CLI owns deterministic operations:

- `planmo init`
- `planmo adopt`
- `planmo generate`
- `planmo status`
- `planmo next`
- `planmo validate`
- `planmo doctor`
- `planmo trace`
- `planmo handoff`
- `planmo diff`
- `planmo pack ...`
- `planmo agent ...`

AI-agent commands/skills own reasoning-heavy work:

- `planmo.discover`
- `planmo.clarify`
- `planmo.architect`
- `planmo.design`
- `planmo.risk`
- `planmo.roadmap`
- `planmo.tasks`
- `planmo.review`
- `planmo.generate`
- `planmo.next`

Invocation syntax is adapter-specific.

## Core architectural rule

```text
AI reasoning
   |
   v
Structured project model / proposed patch
   |
   v
Schema validation
   |
   v
Deterministic PlanMo generator
   |
   v
Files + manifest + diff
```

AI does not get unrestricted ownership of the generated filesystem.

## Frontend/design planning

PlanMo separates:
- frontend framework;
- component foundation;
- component source/registry;
- visual style;
- design tokens;
- typography;
- icon system;
- interface density;
- motion profile;
- accessibility target;
- responsive rules.

Initial styles:
- Minimal
- Editorial
- Neobrutalism
- Soft Product
- Dense Dashboard
- Developer Tool
- Luxury
- Playful

DTCG-compatible design tokens are canonical; Tailwind/shadcn/CSS are adapters.

## Start implementation

Read:
1. `AGENTS.md`
2. `planning/MASTER-PLAN.md`
3. `planning/ROADMAP.md`
4. `planning/TRACKER.md`
5. `prompts/01-phase-00-product-and-research-foundation.md`

Each implementation phase hard-stops and hands off to a fresh AI-agent session.

## Implementation phases

1. Phase 00 — Product & research foundation: `prompts/01-phase-00-product-and-research-foundation.md`
2. Phase 01 — Repository & engineering foundation: `prompts/02-phase-01-repository-and-engineering-foundation.md`
3. Phase 02 — Canonical project model & schemas: `prompts/03-phase-02-canonical-project-model-and-schemas.md`
4. Phase 03 — CLI foundation: `prompts/04-phase-03-cli-foundation.md`
5. Phase 04 — Pack & profile system: `prompts/05-phase-04-pack-and-profile-system.md`
6. Phase 05 — Planning compiler & artifact generator: `prompts/06-phase-05-planning-compiler-and-artifact-generator.md`
7. Phase 06 — Agent bridge: `prompts/07-phase-06-agent-bridge.md`
8. Phase 07 — Frontend design engine: `prompts/08-phase-07-frontend-design-engine.md`
9. Phase 08 — Workflow/session engine: `prompts/09-phase-08-workflow-session-engine.md`
10. Phase 09 — Trace, validate, doctor & drift: `prompts/10-phase-09-trace-validate-doctor-and-drift.md`
11. Phase 10 — Existing repository adoption: `prompts/11-phase-10-existing-repository-adoption.md`
12. Phase 11 — Ecosystem & integrations: `prompts/12-phase-11-ecosystem-and-integrations.md`
13. Phase 12 — Hardening, pilot & v1: `prompts/13-phase-12-hardening-pilot-and-v1.md`

Each phase hard-stops and produces a handoff under `planning/handoffs/`.
