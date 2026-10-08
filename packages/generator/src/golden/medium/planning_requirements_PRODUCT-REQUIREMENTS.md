# Product Requirements — fixture-app

## Problem

_What problem does this project solve, and for whom?_

## Scope

- Project type: `web-application`
- Lifecycle: `greenfield`
- Risk: `medium`

## Requirements

| ID | Requirement | Priority | Phase | Acceptance |
|---|---|---|---|---|
| REQ-001 | Lock product boundaries, naming, licensing criteria, and non-goals. | MUST | 00 | Phase 00 exit gates pass. |
| REQ-002 | Create monorepo toolchain, strict types, lint/format/test, CI, boundaries. | MUST | 01 | Phase 01 exit gates pass. |
| REQ-003 | Schema-version every persisted PlanMo document and add migration tests. | MUST | 02 | Phase 02 exit gates pass. |
| REQ-004 | Implement init, safe filesystem writer, dry-run/diff, ownership rules, status. | MUST | 03 | Phase 03 exit gates pass. |
| REQ-005 | Implement declarative packs, deterministic resolution, lockfile, profiles. | MUST | 04 | Phase 04 exit gates pass. |
| REQ-006 | Generate plan documents with an ownership manifest and reproducible regeneration. | MUST | 05 | Phase 05 exit gates pass. |
| REQ-007 | Implement generic and per-agent adapters with a structured AI proposal contract. | MUST | 06 | Phase 06 exit gates pass. |

## Non-functional requirements

| Area | Requirement |
|---|---|
| Accessibility | Meet the declared accessibility target on every screen. |
| Security | No path traversal, no unsafe symlink following, no secret in the repository. |
| Determinism | Identical inputs produce identical generated output. |
| Data safety | User-owned files are never silently overwritten. |

## Non-goals

_What this project deliberately will not do._
