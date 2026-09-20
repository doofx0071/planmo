# Phase 05 Handoff

## Status
COMPLETE — Planning compiler & artifact generator implemented in new
`@planmo/generator` package, including all five CHG-001 Phase 05 tasks
(P05-06..09). All 9 owned tasks DONE. Hard stop before Phase 06.

## Completed tasks (9/9)
- P05-01 Planning compiler IR — `ir.ts`: canonical phase spine (00–12),
  depth pruning (lean 4 / standard 7 / production 10 / high-assurance 13),
  pack total-order sort, sha256 `inputHash` over canonical (sorted-key) JSON.
  Input-order independent (tested).
- P05-02 Artifact renderers — `render.ts`: ROADMAP.md, TRACKER.md,
  phase-NN.md per `ir.phases`, handoff template; owned by PlanMo (generated/
  seeded classes); path-prefixed under `planning/`.
- P05-03 Generation manifest/checksums — `manifest.ts`: sha256 per artifact,
  `@planmo/generator` id, path-sorted entries, revision semantics, schema
  round-trip via `toPersistableManifest`.
- P05-04 Golden generated-repository fixtures — `src/golden/{low,medium,high}/`
  48 committed snapshots from the real pipeline (11/15/22 artifacts);
  `scripts/update-goldens.mjs` regenerates them; Prettier-excluded.
- P05-05 Idempotent regeneration — `idempotency.test.ts` + E2E proof: GEN2
  diff 0 bytes, manifest byte-identical, unmanaged content preserved,
  dry-run touches nothing, unmanaged-file collision refused.
- P05-06 Ownership classes generated/merged/seeded/user — schema
  `OWNERSHIP_MODES` extended additively; legacy `managed`/`merge` accepted.
- P05-07 Artifact lineage — `input:<hash>` + `pack:<ref>@<ver>` markers on
  every manifest entry.
- P05-08 Upgrade/synth preview — `synth.ts` `previewSynth`: pure report,
  per-class create/overwrite/merge/skip/collision; never writes.
- P05-09 Standards/context docs generation — `standards-context.ts`:
  STANDARDS.md (precedence-ordered, conflicts surfaced), policies/<class>.md,
  CONTEXT.md (project/stack/design/agents/planning + lineage).

## Files/packages materially changed
- NEW `packages/generator/` (package.json, tsconfigs, src/{ir,contracts,
  render,standards-context,manifest,synth,compile,fixtures}.ts, 7 test files,
  golden/ snapshot tree, scripts/update-goldens.mjs)
- `packages/schema/src/state-lock-manifest.ts` (+`merged`/`seeded` ownership
  modes; canonical doc comment) and its test (+canonical-class case)
- `.prettierignore` (+golden snapshots exclusion)
- Planning: tasks.csv (9 DONE), TRACKER, DECISIONS, REQUIREMENTS-TRACEABILITY,
  CHANGELOG, state.yml → Phase 06, .changeset/phase-05-*.md
- NEW `docs/12-adrs/ADR-0019-deterministic-planning-compiler-and-generation-manifest.md`
- NEW `scripts/e2e-phase05.mjs` (end-to-end compile/idempotency demo)

## Commands/tests actually executed
- `pnpm exec vitest run packages/generator packages/schema` → 82 generator
  tests (IR 9, render 12, standards-context 12, manifest 17, synth 23,
  golden + idempotency 9) + schema suite green.
- `node scripts/e2e-phase05.mjs`: GEN1 written 16, safe, 0 collisions;
  manifest entries 15, ownership `generated`, lineage markers present;
  GEN2 diff 0 bytes, manifest byte-identical.
- Full gate `pnpm check` exit 0 — 271 tests, boundaries OK, format OK, smoke OK.

## Security/reliability findings
- Generation only writes through the Phase 03 ManagedWriter (containment,
  symlink safety, atomic rename, TOCTOU re-check); synth preview is pure.
- Unmanaged files at target paths are collisions, never silently overwritten
  (ADR-0016 exit gate), verified by test.
- Fixed during integration: `listExistingPaths` normalized only one side of
  the path on Windows (backslashes vs forward slashes) — real existing files
  were invisible to collision detection; corrected + regression-covered.
- Golden snapshots are byte-exact renderer output; reformatting them is
  forbidden by `.prettierignore` and would fail the golden tests.

## ADRs/decisions created
- ADR-0019 Deterministic planning compiler & generation manifest (Accepted).
- DECISIONS.md Phase 05 confirmations (IR-only contract, additive ownership
  classes, pure preview, golden fence).

## Git
- Branch `feat/phase-05-planning-compiler-and-artifact-generator`;
  contract commit `dd59fb0`; PR #6 (pending merge); main == origin/main at
  `388984a` pre-merge.

## Known debt
- CLI wiring (`planmo generate`, `--dry-run`, `--preview`) is deliberately
  deferred to Phase 08 (workflow/session engine owns `planmo next`).
- AI proposal contract (upstream of the IR) is Phase 06 (agent bridge) scope.
- Generator `index.ts` re-exports fixtures (test-only inputs today); consider
  splitting a test-support entry point before publishing.

## Next phase
Phase 06 — Agent bridge (`prompts/07-phase-06-agent-bridge.md`).

## Instructions for next fresh session
1. `git checkout main && git pull` (after PR #6 merges).
2. Read: AGENTS.md, `prompts/07-phase-06-agent-bridge.md`, `planning/phases/
   phase-06.md`, TRACKER, tasks.csv (P06 rows), DECISIONS, RISKS, ADR-0019 +
   phase-05 prompt list, this handoff.
3. Branch `feat/phase-06-agent-bridge`; mark P06 tasks IN_PROGRESS.
4. The generator IR is the downstream contract; adapters must emit
   schema-validated proposals, never raw AI output into `buildIr`.
5. Gate: `pnpm check` exit 0; update tracker/state/handoff; hard stop after
   Phase 06.