# Phase 11 Worker Brief — Ecosystem & integrations

Read FIRST: `packages/packs/src/phase11-contracts.ts` (packs scope) or
`packages/agent-bridge/src/phase11-contracts.ts` (agent-bridge scope). These
are FROZEN: implement exactly these names/signatures. Do not edit either
contracts file. Lead deletes `declare` stubs at integration.

Repo: `C:/Users/Damascus/Videos/clel/planmo` (git-bash). Branch
`feat/phase-11-ecosystem-and-integrations`. Run EVERY command from repo root.

## Machine toolchain (git-bash, Windows)

```bash
export PATH="/c/Users/Damascus/AppData/Local/Programs/node-v24.11.0-win-x64:$PATH"
pnpm --filter <pkg> typecheck        # per-package typecheck
pnpm exec vitest run packages/<pkg>/src/<your-file>.test.ts
```

Single-quoted PATH breaks resolution ($PATH not expanded) — always the
double-quoted export above. `python` is fine for scratch.

## Shared rules (all workers)

- Write ONLY files in YOUR ownership list. Do not create stub/dummy versions
  of a sibling worker's file even if typecheck complains — the sibling writes
  it concurrently.
- Do NOT run `git add/commit/reset/checkout` (lead commits).
- Do NOT run `pnpm check` or the full-package suite against partial state;
  run vitest on YOUR test files only, plus your package's typecheck.
- Tests ship with the behavior (repo rule), including negative cases.
- Determinism: every exported value byte-stable for identical input. No
  timestamps/randomness in output.
- Strict types, no `any`. Match surrounding code style (Prettier 2-space,
  `import ... from '...js'` with `.js` suffix on relative imports).

---

## Worker A — P11-01 trust model + P11-02 catalog/source abstraction

Package: `@planmo/packs`.

Ownership (create/edit ONLY these):
- `packages/packs/src/trust.ts` + `trust.test.ts`
- `packages/packs/src/catalog.ts` + `catalog.test.ts`
- `docs/08-security/pack-trust.md` (rewrite: trust levels, review burden,
  remote-pack rules per REQ-TRUST-001/002, ADR-0004, ADR-0018 consequences)
- `docs/16-evals-trust/trust-engine-future.md` (extend, not rewrite: reflect
  the implemented classification)

Implement:
- `classifyTrust(input: TrustInput): TrustClassification` — deterministic;
  builtin => builtin/no review; local => local/no review; remote (git/
  registry) with provenance declaring verified-source => third-party level
  with `requiresReview` (verified-source UNASSIGNABLE to remotes until a
  signing design exists — treat any declared `verified-source` on a remote as
  third-party + review + reason); remote without integrity => review; remote
  with integrity + third-party declared => review (community class per
  ADR-0021 spirit: ALWAYS `requiresReview: true`, cannot be disabled).
  `reasons` sorted, stable.
- `formatTrust(...)` — deterministic one-liner.
- `resolveCatalog(sources, fetcher): Promise<readonly CatalogEntry[]>` —
  per source kind: local-dir lists `pack.yml` files under url; registry
  lists refs then fetches each; git same via ref. `integritySha256` computed
  (node:crypto sha256 hex) for EVERY remote entry, required; local-dir may
  omit. Fetcher is injected — no I/O in the engine itself.
- `pickCatalogEntry(entries, ref, version?)` — exact version match wins;
  else highest valid SemVer for ref; null when none. Deterministic sort.
- Negative tests: source declares verified-source on remote, missing
  integrity on remote, unknown ref, duplicate refs, fetcher failure, empty
  catalog. Use inline YAML strings; do NOT add fixture files unless a real
  dir test needs one (makeTempDir from `./test-utils.js`).
- Loader reuse: import `packIntegrity` from `./loader.js`; do NOT modify
  loader.ts, resolve.ts, lock.ts, or their tests.

Sibling contract: Worker B owns install/lock verification; do not implement
plans here. `lockedAt` etc. is NOT part of the contracts — don't invent extra
fields in CatalogEntry.

Draft your ADR-0025 text INSIDE your report (lead edits + files it) — do not
create the ADR file yourself unless you are certain of repo format; safer:
report the 3-5 decision bullets.

## Worker B — P11-03 checksums/pinning/reversibility + P11-05 GitHub export

Package: `@planmo/packs`.

Ownership (create/edit ONLY these):
- `packages/packs/src/install.ts` + `install.test.ts`
- `packages/packs/src/github-export.ts` + `github-export.test.ts`
- `docs/04-packs/resolution.md` (add pinning/update/reversibility section)
- `docs/04-packs/versioning.md` (extend with lock/pinning rules if missing)

Implement:
- `planLockDiff(from: LockfileDocument | null, to: LockfileDocument): InstallPlan`
  — row per ref across both lockfiles; actions added/removed/updated/unchanged;
  `from/to` carry version + integrity digest; `reversible: true` always (plan
  never mutates state); `diff` lines deterministic (`+ref@v  -ref@v` style,
  sorted by ref).
- `verifyLockIntegrity(lock, readContent)` — for every entry with integrity,
  sha256(readContent(entry)) must equal digest; local entries without
  integrity pass. Return { ok, failures } with stable failure strings
  (`ref@version: integrity mismatch`). This is PURE except the injected read.
- `lockFromResolution(result, planmoVersion)` — reuse `buildLockfile` from
  `./lock.js` then add `trustLevel` per entry (builtin for local source,
  third-party for registry/git) so the new lock entries carry trust
  classification (schema already supports optional trustLevel).
- `renderGithubExport(input)` — additive payload: files sorted by path,
  title deterministic (`feat: <repo> planning artifacts (planmo)`), body
  contains the summaryLines + an explicit additive note; NO network calls.
- Negative tests: empty diff both null, drift digest mismatch, removed pack,
  unchanged identical locks, export file path traversal rejected (paths must
  stay under a single `artifacts/` prefix or be rejected), body never empty.
- Reuse `buildLockfile`/`lockfileFingerprint` from `./lock.js`,
  `resolvePacks` from `./resolve.js` where natural. Do NOT edit loader.ts,
  resolve.ts, lock.ts, trust/catalog files (Worker A owns those).

## Worker C — P11-04 authoring docs + P11-06 (CHG-001) portable context/memory

Scopes: `docs/04-packs/*` authoring + `@planmo/agent-bridge`.

Ownership (create/edit ONLY these):
- `docs/04-packs/authoring.md` (NEW — pack authoring guide)
- `packages/agent-bridge/src/memory-portable.ts` + `memory-portable.test.ts`
- `packages/agent-bridge/src/memory-file-provider.ts` + `memory-file-provider.test.ts`
- `docs/14-context-memory/storage-portability.md` (extend with concrete
  formats + round-trip rules)

Implement (contracts file `packages/agent-bridge/src/phase11-contracts.ts`):
- `exportMemoryPortable(view | null, rows, format)` — 'json': single
  PortableMemoryDocument pretty-printed; 'jsonl': one JSON object per line
  (document header line + one row per line); 'markdown': deterministic MD
  (header + one bullet per row `- [<kind>] <summary> (source: <source>)`).
  Rows sorted by id before emit. Never emits timestamps.
- `importMemoryPortable(text, format)` — exact reverse; validate
  schemaVersion === 1, `format === 'planmo-memory'`, rows shape
  (id/kind/summary/source); throw descriptive Error on malformed/stale.
  JSONL: first line header, subsequent lines rows.
- `createFileMemoryProvider({readText, format, limit?})` — MemoryProvider
  whose `relevant(contextId, limit)` reads the portable text, imports rows,
  filters rows with nonempty id, sorts by id, slices min(limit, configured
  limit); returns the standard no-op row when text empty/unparseable —
  NEVER fabricates rows (REQ-MEM-001). Reuse `noMemoryRows` from
  `./memory-provider.js` when import yields none.
- Round-trip tests: json/jsonl/markdown export->import identity; malformed
  JSON rejected; wrong schemaVersion rejected; empty input => no-op row;
  limit honored; deterministic identical output for identical input.
- Authoring guide content (docs/04-packs/authoring.md): categories
  (stack/domain/risk/design/agent/workflow/standards/policy/context —
  from `PACK_CATEGORIES`), required pack.yml fields (schemaVersion/ref/name/
  version/category/description), provides/requires semantics,
  PACK ref pattern (`stack/nextjs`), SemVer + compatibility rules
  (docs/04-packs/versioning.md), executable-construct rejection list
  (loader EXECUTABLE_KEYS: hooks/scripts/commands/exec/install/postinstall/
  preinstall/run/shell/lifecycle/template-engine/code — any key at ANY depth
  => rejected), provenance requirements for remote packs (REQ-TRUST-001:
  source/url/integrity/trustLevel; third-party => review), standards/policy/
  context content shapes with one small YAML example each, and the packs
  boundary rule (never import @planmo/* outside allowed graph — see
  scripts/check-boundaries.mjs). Follow existing doc tone (concise,
  reference the ADRs by number).

---

## Verification commands (yours only)

```bash
export PATH="/c/Users/Damascus/AppData/Local/Programs/node-v24.11.0-win-x64:$PATH"
pnpm --filter @planmo/packs typecheck
pnpm exec vitest run packages/packs/src/<your>.test.ts
# Worker C additionally:
pnpm --filter @planmo/agent-bridge typecheck
pnpm exec vitest run packages/agent-bridge/src/<your>.test.ts
```

All tests in your files must pass BEFORE you report. If a sibling dependency
prevents typecheck of YOUR package, still report that state honestly with the
exact error.

## Report format (required)

1. Files written (absolute paths).
2. Tests run + pass/fail counts (real output, no fabrications).
3. Design decisions + any contract gap you hit (do NOT silently widen types:
   report it; lead amends the contract).
4. Draft ADR bullets (Worker A only).
5. Anything BLOCKED with exact unblock steps.