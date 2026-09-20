# Detailed Roadmap

## Phase 00 — Product & research foundation
Lock product boundaries, naming/package availability, source baseline, supported agents/platforms/styles, licensing criteria, and non-goals.

## Phase 01 — Repository & engineering foundation
Create pnpm monorepo, strict TypeScript, lint/format, Vitest, Changesets, GitHub Actions, package boundaries, release scaffolding, CLI smoke command.

## Phase 02 — Canonical project model & schemas
Version schemas for project config, state, pack metadata, lockfile, manifest, requirements, design profiles, trace graph, handoffs, work packets; add migration tests.

## Phase 03 — CLI foundation
Implement `init`, root resolution, interactive wizard, safe filesystem writer, dry-run, diff, ownership/collision rules, `status`.

## Phase 04 — Pack & profile system
Implement declarative pack loading, compatibility/dependencies, deterministic resolution, conflicts, lockfile, planning-depth profiles.

## Phase 05 — Planning compiler & artifact generator
Generate AGENTS/root docs/planning/docs/prompts/.github/.planmo with ownership manifest and reproducible regeneration; add golden repositories.

## Phase 06 — Agent bridge
Implement generic, OpenCode, Codex, Claude Code adapters; command/skill/prompt installation; structured AI proposal contract.

## Phase 07 — Frontend design engine
Implement design profiles, DTCG tokens, eight styles, accessibility/motion rules, shadcn source adapter, frontend docs.

## Phase 08 — Workflow/session engine
Implement phases, dependencies, hard stops, handoffs, `planmo next`, work packets, parallel-safe annotations, human/blocking gates.

## Phase 09 — Trace, validate, doctor & drift
Implement requirement trace graph, orphan/stale/missing-test detection, manifest drift, `validate`, `doctor`, `trace`.

## Phase 10 — Existing repository adoption
Implement passive scanner, stack/test/CI detection, prompt-injection isolation, `adopt`, brownfield diff, malicious fixtures.

## Phase 11 — Ecosystem & integrations
Implement pack catalogs/source abstraction, trust metadata, checksums/pinning, authoring docs, GitHub export prototype.

## Phase 12 — Hardening, pilot & v1
Security review, property/fuzz, cross-platform E2E, migration/upgrade tests, real pilots, docs/examples/npm packaging, 1.0 go/no-go. CHG-001: context/memory eval suite, token budget benchmark, poisoning/staleness/security tests, index corruption/rebuild tests (P12-08..11).

# Change governance

- **CHG-001 — Quality, Context, Memory & Governance** — **ACCEPTED 2026-09-20** (rebaseline). Adds standards & quality engines, local-first context/memory (canonical state authoritative), change packages, managed-file ownership classes, task graph/claims/execution packets, architecture fitness, AI planning evals, and future pack trust metadata across Phase 04–12. Package: `planning/changes/CHG-001-quality-context-governance/`; ADRs 0012–0017; 35 tasks appended to `planning/tasks.csv`; phase addenda in `planning/phase-addenda/`. Completed Phase 00–03 history and task IDs are untouched.
