# Phase 07 Handoff — Frontend design engine

- **Status:** COMPLETE (2026-09-21)
- **Branch:** `feat/phase-07-frontend-design-engine`
- **Merge:** PR (implementation `7b1ca41` + close-out commit)
- **Gate:** `pnpm run check` exit 0 — build · typecheck · **465 tests** (125 new) · lint · format:check · boundary-check · smoke; E2E `node scripts/e2e-phase07.mjs` → `PHASE 07 E2E OK`
- **PlanMo state:** `.planmo/state.yml` → `currentPhase: "08"`, `completedPhases: ["00".."07"]`, next `prompts/09-phase-08-workflow-session-engine.md`
- **Tasks:** P07-01..07 all DONE (56 total done across phases)

## What shipped

New package **`@planmo/design-engine`** (boundary `['core','shared','schema']`, workspace dep `@planmo/schema`) + schema additions:

| Task | Module | Surface |
|---|---|---|
| P07-01 | `packages/schema/src/design-profile.ts` | `RichDesignProfileSchema` (style variant/density/geometry/typography/icons/motion/accessibility/components+registries/responsive; backendOnly valid) + `MOTION_PROFILES`, `REGISTRY_TRUST_LEVELS`, `RegistryItemSchema` (http(s)-only; community/untrusted FORCED `requiresReview` true) — 13 schema tests |
| P07-02 | `src/tokens.ts` | `dtcTokenEngine` — alias `{ref}` resolution, cycle/missing-ref/duplicate/invalid-unit detection, byte-deterministic DTCG JSON emit — 14 tests |
| P07-03 | `src/packs.ts` | `designPackCatalog` — 8 declarative packs (minimal, editorial, neobrutalism, soft-product, dense-dashboard, developer-tool, luxury, playful), each ≥10 DTCG tokens validated by the engine, ≥3 style anti-patterns, responsive + accessibility notes — 61 tests |
| P07-04 | `src/shadcn.ts` | `shadcnRegistryAdapter` — registry item resolution with trust metadata; `file://`/malformed rejected; every item round-trips `RegistryItemSchema` — 8 tests |
| P07-05 | `src/docs.ts` | `designDocsGenerator` — deterministic markdown (profile/tokens/anti-patterns/responsive/accessibility/motion + validation warnings; missing blocks omitted cleanly) — 7 tests |
| P07-06 | `src/accessibility.ts` | `a11yValidator` — WCAG 2.2 AA contrast via exact relative luminance (AA 4.5/3.0, AAA 7.0/4.5), reduced-motion required, compact-density touch-target heuristic, cinematic flash-risk warning, `a11y.*` skip-token rejection, backendOnly short-circuit — 9 tests |
| P07-07 | `src/design-standards.ts` + `src/anti-patterns.ts` | 13 structured `StandardRule`s (`design.*` ids, class `language` — no `design` class in `STANDARD_CLASSES`; flagged for Phase 09), universal + per-style anti-pattern policy — 22 tests |

`src/contracts.ts` — frozen interfaces (workers implemented against these). Lead merged worker output, wired `src/index.ts`, added `requiresReview?: boolean` to `RegistryResolveInput` (brief required it; contract lacked it), removed one bad assertion in my own schema test, formatted.

## Architecture decisions

- **Engine owns validation:** packs are validated by the same `dtcTokenEngine` that emits canonical DTCG, so invalid pack content can never reach generated docs.
- **Trust forces review:** community/untrusted registry items are FORCED `requiresReview: true` at both adapter and schema layers — caller/style cannot disable; only official/verified may set false explicitly.
- **A11y outranks style (REQ-DESIGN-002):** validator refuses `a11y.*` skip tokens (e.g. `a11y.contrast.skip`) that would let a style disable accessibility checks — same invariant as ADR-0021.
- **Design standards as data (CHG-001):** 13 `design.*` rules parse against `StandardRuleSchema`; class `language` because `STANDARD_CLASSES` lacks `design` — Phase 09 standards-injection work should add the class + wire `appliesTo` refinement.
- **Motion profiles** constrained to the canonical set (none/restrained/expressive/cinematic) via schema enum; reduced motion (WCAG 2.3.3) mandatory on frontend profiles.
- Registry parse of `{baseUrl, itemPath}` produces id `<host>/<first-segment>`, name = last segment sans extension — documented + tested.

## Verification

- E2E (`scripts/e2e-phase07.mjs`): all 8 packs cataloged + token-validation clean; deterministic DTCG emit (3748 bytes); official vs community registry review paths correct; 7-section docs (3246 bytes); a11y pass w/ 1 info diagnostic; 13 structured standards.
- Gate 465/465 across 38 files; boundary-check green (`design-engine: ['core','shared','schema']`); Prettier clean; secret scan clean.
- Worker discipline: 3/3 landed files (8/4/4 worker files), 3 accidental duplicate C-agents stopped before writing (no collisions); Worker A 26 API calls / 61 tests, B 36 / 15, C 36 / 22.

## For Phase 08 (Workflow session engine)

- `@planmo/design-engine` dist is import-ready: `createDefaultRegistry`-style wiring can pull `designPackCatalog`, `dtcTokenEngine`, `shadcnRegistryAdapter`, `designDocsGenerator`, `a11yValidator`, `designStandardsFor` from `src/index.ts`.
- Phase 09: add a `design` class to `STANDARD_CLASSES` + wire `appliesTo` in `designStandardsFor` (currently returns all sorted).
- `RichDesignProfileSchema` is strict — new fields added in later phases must land in the schema (extension policy ADR-0011) + rebuild schema dist before consuming workspace-wide.
- Keep `docs/05-design-engine/*.md` in sync with any pack/standard changes (they are the canonical source; `design-standards.ts` cites them).

## Docs updated

ADR-0021 · `planning/REQUIREMENTS-TRACEABILITY.md` (Phase 07 trace) · `planning/DECISIONS.md` · `planning/TRACKER.md` · `planning/tasks.csv` (P07 DONE) · `.planmo/state.yml` · `CHANGELOG.md` · `.changeset/phase-07-frontend-design-engine.md` · `docs/05-design-engine/*` (pre-existing, unchanged) · MANIFEST regenerated (N files).