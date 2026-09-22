# Pack Resolution

Deterministic precedence:
1. explicit project overrides;
2. explicitly selected packs;
3. profile-provided packs;
4. built-in defaults.

Semantic conflicts are errors or require explicit resolution; never silent last-writer-wins.

Resolver outputs:
- selected versions;
- dependency graph;
- conflicts;
- overridden values;
- provenance;
- final lockfile.

Property tests cover permutation invariance where order should not matter.

## Pinning, updates, and reversibility (P11-03)

- Every resolved pack is pinned in `.planmo/lock.yml` with `ref`, `version`, `source`, and a sha256 `integrity` digest of the raw resolved content. The digest is never optional for remote packs.
- The lockfile is the single source of truth for what is installed. Install/update plans are computed as diffs between the current lock and the next lock; nothing is ever written without an explicit diff first.
- `planLockDiff(from, to)` compares two lockfiles into a reversible plan: one row per pack ref across both locks, actions `added` / `removed` / `updated` / `unchanged`. A pack is `updated` when its version **or** its integrity digest changes — content drift under the same version is never silent.
- The rendered diff is deterministic, unified-ish, sorted by ref, and shows only changed rows:
  - `+ref@version` — added;
  - `-ref@version` — removed;
  - `~ref@v1 => v2` — updated.
- Plans are plan-only in v1: `reversible` is always true because the plan never mutates anything (dry-run/diff before destructive changes).
- `verifyLockIntegrity(lock, readContent)` re-hashes each locked pack's actual resolved content and compares it to the recorded digest. Mismatches are reported as `ref@version: integrity mismatch` in a stable, sorted failure list. Entries without a recorded digest (e.g. local entries in pre-Phase-11 locks) pass — the checksum layer verifies what the lock asserts.
- Reversibility rule: an update is safe to reverse exactly when the previous lockfile is retained and its entries still verify (`verifyLockIntegrity` on the old lock passes). Keep the old lockfile.
- `lockFromResolution(result, planmoVersion)` builds the "next" lock from a deterministic resolution: it reuses `buildLockfile` output and adds a per-entry `trustLevel` (`builtin` for local sources, `third-party` for registry/git) so the lock itself carries the classified trust.
