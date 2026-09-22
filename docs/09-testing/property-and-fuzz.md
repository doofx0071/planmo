# Property / Fuzz Testing

High-value properties:

## Path safety
Arbitrary pack path either resolves within root or is rejected without write.

## Pack resolution
Independent pack selection permutations yield same semantic resolution.

## Manifest regeneration
Unchanged inputs/files produce no-op regeneration.

## State transitions
Invalid phase/task transitions never persist as valid state.

## Token references
Alias graph fully resolves or yields deterministic cycle/missing-reference diagnostics.

## Phase 12 evidence (P12-02, property/fuzz suites)

Implemented as dedicated seeded test suites in the `property-fuzz-*.test.ts`
files below. All suites are deterministic end to end: a fixed-seed mulberry32
PRNG (never `Math.random`), a fixed iteration budget, and reusable oracles
that assert the documented invariant against independent reference walks.
Negative cases ship with every suite (rejection paths, near-miss keys,
false-positive guards, malformed-input robustness).

### Property definitions

| ID | Invariant (asserted on every seeded iteration) |
|---|---|
| P-PATH-1 | Arbitrary target either resolves inside root (`isInsideRoot`) or throws `PathTraversalError`; never an outside path, never another error type. |
| P-PATH-2 | Traversal/escape constructions (`..` climbs, absolute paths outside root) are rejected; benign normalizations and URL-encoded `..` (not decoded) resolve inside. |
| P-PATH-3 | Escaping symlinks are rejected by `ensureNoSymlinkEscape`/`realpathWithinRoot` with `UnsafeSymlinkError`; in-root symlinks pass; non-existent traversal targets fail closed. |
| P-LOAD-1 | Executable keys (`hooks scripts commands exec install postinstall preinstall run shell lifecycle template-engine code`) at ANY depth, in objects or arrays, are rejected fail-closed with `PackLoadError(kind: 'executable')`. |
| P-LOAD-2 | Arbitrary pack.yml shapes (structured fuzz + raw byte fuzz) either load into a fully-valid executable-free pack or throw a deterministic `PackLoadError` — never partial load, never an unrelated error. |
| P-RES-1 | Request-order permutations of a shared pack set: acyclic closures share fingerprint, topological order, `ok`, pack set and full diagnostic multiset. |
| P-RES-2 | Cycles, capability conflicts and missing deps surface deterministic diagnostics matching independent oracles (three-color DFS for cycles, digest-distinct providers for conflicts). |
| P-VER-1 | Future-major and unknown schema versions are rejected with `UnsupportedSchemaVersionError`/`MissingSchemaVersionError`; `readSchemaVersion` matches the documented contract exactly. |
| P-VER-2 | Round-trip serialization is stable: schema-valid documents survive 3× JSON parse/stringify with deep equality. |
| P-VER-3 | Per-document-kind legacy (v0) fixtures migrate, re-serialize stably, and re-migrate idempotently; extensions preserved verbatim. |
| P-TOK-1 | Alias graphs are either fully resolvable (every chain terminates at a literal within a bounded walk) or the engine reports cycle/missing-reference diagnostics matching the per-token walk oracle; deep/cyclic graphs terminate (no hangs). |
| P-TOK-2 | `emit()` is byte-identical for any order of the same token multiset; repeated emits are stable. |
| P-TOK-3 | Negative value diagnostics: duplicate names, `NaN`, unit-less dimensions, empty `{}` aliases, self/mutual cycles, motion-profile demands. |
| P-IR-1 | No-op regeneration: unchanged inputs produce byte-identical IR (`inputHash`) and byte-identical rendered artifacts; locked-pack multiset permutations leave the IR untouched. |
| P-IR-2 | Malformed input is rejected without crashing: garbage project configs fail `ProjectConfigSchema.safeParse` deterministically; pathological IR shapes (huge/duplicate/empty phases, garbage locked packs) render deterministically. |

### Seed strategy

Every suite uses a fixed mulberry32 seed hard-coded per iteration budget (e.g.
200 × fixed seed), so a failure is byte-reproducible across runs, machines and
CI. No suite consumes unseeded randomness; the harness itself is verified
deterministic (same seed → identical corpus → identical outcomes).

### Files and pass counts (2026-09-22, Windows git-bash, Node v24.11.0, Vitest 5)

| Test file | Tests | Pass |
|---|---|---|
| `packages/core/src/property-fuzz-paths.test.ts` | 21 | 21 |
| `packages/packs/src/property-fuzz-loader.test.ts` | 6 | 6 |
| `packages/packs/src/property-fuzz-resolve.test.ts` | 5 | 5 |
| `packages/schema/src/property-fuzz-versioning.test.ts` | 11 | 11 |
| `packages/design-engine/src/property-fuzz-tokens.test.ts` | 7 | 7 |
| `packages/generator/src/property-fuzz-ir.test.ts` | 7 | 7 |
| **Total** | **57** | **57** |

All five touched packages typecheck (`pnpm --filter @planmo/<pkg> typecheck`)
and all six suites pass when run together (`pnpm exec vitest run <paths>`).

### Finding (P-RES): cycle-membership is DFS-entry-order dependent

The resolver's three-color DFS marks a pack as a cycle member only when a
cycle happens to close through it in the walked path. For closures containing
several interleaved cycles, a different request permutation can admit a real
cycle member into the resolved pack set (and vary the detected cycle-path
diagnostics). The P12-02 suite therefore asserts full permutation invariance
for **acyclic** closures, and for cyclic closures asserts the order-invariant
half of the contract: a fatal `cycle` diagnostic is always surfaced and
`ok === false` in every permutation. Unblock step for a follow-up hardening
task: after any back-edge detection, also mark the nodes on the DFS path that
lead into the detected cycle (or re-run cycle detection over the admitted
subgraph) so cycle membership — and thus the resolved set and fingerprint —
is request-order independent.