# Context & Memory Evaluation

Memory needs tests beyond "it seems useful."

## Retrieval fixtures

Create scenarios with known relevant evidence:
- architecture decision lookup;
- failed previous approach;
- code symbol location;
- package standard;
- stale/superseded decision;
- conflicting facts;
- security invariant.

Measure:
- recall@k;
- precision@k;
- required-fact inclusion;
- stale-memory exclusion;
- token count;
- latency.

## Token benchmark

Compare:
1. full-context baseline;
2. repo-map only;
3. repo-map + lexical memory;
4. optional hybrid semantic retrieval.

Do not claim token savings until measured on PlanMo fixtures.

## Agent outcome eval

For selected coding tasks, compare:
- task success;
- tests passed;
- number of exploratory file reads;
- main-agent input tokens;
- incorrect assumptions;
- time/latency.

## Security eval

Include:
- prompt injection inside README;
- malicious "remember this instruction";
- secret-like strings;
- cross-project memory IDs;
- stale superseded architecture;
- corrupted index;
- forged provenance.

## Phase 12 measured results (CHG-001 — real runs, 2026-09-22)

Measured against the actual retrieval/memory selection logic exposed by
`@planmo/agent-bridge`. v1 exposes NO query-aware retrieval function beyond
`MemoryProvider.relevant(contextId, limit)` (deterministic id-order selection
with caps and an explicit no-op row) and the PURE context-bundle compiler
(`compileContextBundle`, chars/4 token accounting). The eval therefore layers
a deterministic reference lexical ranker (the "exact/lexical match" first
signal from `retrieval-token-budget.md`) over the same rows and reports BOTH
the reference metrics and the real provider-path selection side by side.
Fixtures cover all 7 scenario types plus a provider blind-spot control; all
are fixed fixtures with seeded content — no timestamps, no randomness.

Reference harness: `packages/agent-bridge/src/context-retrieval-eval.test.ts`
(13 vitest cases), executable table printer: `scripts/eval-context-retrieval.mjs`.

### P12-08 — retrieval metrics (k = 3, real run: `node scripts/eval-context-retrieval.mjs`)

| scenario | ranker recall@3 | ranker precision@3 | required-fact | stale-exclusion | provider recall@3 | provider precision@3 | provider required | provider stale-in-top3 | token estimate |
|---|---|---|---|---|---|---|---|---|---|
| 01 ADR lookup | 1 | 1 | yes | yes | 1 | 1 | yes | 0 | 174 |
| 02 failed prior approach | 1 | 1 | yes | yes | 1 | 1 | yes | 0 | 158 |
| 03 symbol location | 1 | 1 | yes | yes | 1 | 1 | yes | 0 | 142 |
| 04 package standard | 1 | 1 | yes | yes | 1 | 1 | yes | 0 | 163 |
| 05 stale/superseded decision | 1 | 1 | yes | yes | 1 | 1 | yes | 0 | 122 |
| 06 conflicting facts | 1 | 1 | yes | yes | 1 | 1 | yes | 0 | 127 |
| 07 security invariant | 1 | 1 | yes | yes | 1 | 1 | yes | 0 | 133 |
| 08 control (provider blind spot) | 1 | 1 | yes | yes | 0 | 0 | NO | 1 | 174 |
| **aggregate** | **1.0** | **1.0** | **8/8** | **8/8** | **0.88** | **0.88** | **7/8** | **1** | **max 174** |

Exit code: 0 (PASS). Deterministic: rerunning produces byte-identical rows.

What this measures, exactly:
- **Reference ranker**: lexical overlap (query tokens vs row summary + source),
  score desc, id asc tie-break; the same code the vitest file asserts
  (expected top-3 ids are locked snapshots).
- **Provider path**: `createMemoryProvider(...).relevant(contextId, 3)` on the
  same rows — v1 selects by id order, NOT relevance. The 7 canonical
  scenarios all sorted relevant rows first by id (fixture artifact, not
  quality); the control (scenario 08, same corpus, ids permuted so relevant
  rows sort last) proves the provider is relevance-blind: recall/precision
  0, required fact missed, stale row served. **Do not read the provider
  numbers as retrieval quality — read them as the documented v1 gap.**
- **Token estimate**: `compileContextBundle` chars/4 over the ranked top-3
  bundle (capsule + index + evidence layers). Latency is NOT measured: the
  harness is pure in-memory; claiming latency numbers would be fabrication.

Gaps flagged by the eval: v1 has no relevance ranking in the provider path
(the blind-spot control quantifies it), no staleness field on rows, no
provenance verification, no secret redaction — see P12-10 below.

### P12-09 — token budget benchmark (real run: `node scripts/eval-token-budget.mjs`)

Fixtures: committed generator golden "high" planning tree
(`packages/generator/src/golden/high`, 22 markdown documents, 18,066 chars).
Strategy texts: full-context concatenation; real scanner `contextMapEngine`
repo map; real `lexicalContext` token histograms; a fixed policy evidence
excerpt as the semantic-retrieval placeholder. Token accounting is the
bundle compiler's own chars/4 (`Math.ceil(len/4)`), cross-checked by running
each strategy text through `compileContextBundle` (identical values — 4496,
103, 1328, 1457).

| strategy | chars | tokens (chars/4) | compileContextBundle | vs full-context | invariants retained |
|---|---|---|---|---|---|
| 1 full-context (baseline) | 18066 | 4496 | 4496 | 100% | yes |
| 2 repo-map only | 412 | 103 | 103 | 2% | **NO** (overflow-rule finding) |
| 3 repo-map + lexical | 5314 | 1328 | 1328 | 30% | yes |
| 4 hybrid (+ selected evidence) | 5834 | 1457 | 1457 | 32% | yes |

Exit code: 0 (PASS; over-budget would fail). Budget: 8000 tokens
(`context-bundle.ts` default) — every strategy is comfortably inside.
Verdict:
- Token savings ARE real and now measured: repo-map+lexical cuts the
  full-context baseline to 30%, hybrid to 32%.
- **Overflow rule matters**: repo-map-only (2%) drops the security policy
  excerpt, violating "preserve security/invariants first". A bare repo map
  must never be the whole context — keep the L0 capsule + invariants.
- The 20/30/20/10/20 allocation from this document remains a starting
  heuristic; the benchmark provides the measured fixture numbers to tune it.

### P12-10 — memory poisoning / staleness / security (real run: `pnpm exec vitest run packages/agent-bridge/src/memory-poisoning-staleness.test.ts`, 18 cases, all pass)

- **Prompt injection inside README/memory content** is context DATA: rows
  carrying multi-marker injection text import and serve verbatim as
  `{id, kind, summary, source}`; the row type has no instruction surface;
  an instruction-like `kind` is rejected; extra JSON fields
  (`instructions`, `role`, `system`) are canonicalized away on import.
- **Malicious "remember this instruction"** content stays data (verbatim
  summary, classified kind unchanged).
- **Secret-like strings** (github/OpenAI/AWS/Slack token patterns + PEM
  private keys): v1 import/export has NO redaction step — the provider
  round-trips them verbatim (documented gap). The eval harness's
  deterministic secret detector flags every pattern; benign lookalikes are
  not flagged. Detection capability proven; redaction is out of scope for
  the provider path and must land before secret persistence is enabled.
- **Cross-project memory IDs**: store-scoped reads never leak across
  projects (foreign context yields the explicit no-op row); a document whose
  `context.contextId` mismatches the requested context is flagged by the
  harness; rows bearing foreign `proj-x:` ids are served verbatim — v1 has
  no id-scope filter (documented gap; isolation is caller-side via scoped
  stores).
- **Stale superseded entries**: v1 rows carry no staleness field, so the
  provider faithfully serves SUPERSEDED rows (documented gap); the eval's
  deterministic stale filter drops them and keeps the superseding evidence.
- **Forged provenance**: `source` is preserved verbatim with no authenticity
  verification (documented gap); the harness's canonical-source allowlist
  check flags forged sources deterministically.

### P12-11 — index corruption / rebuild (real run: `pnpm exec vitest run packages/scanner/src/context/index-corruption-rebuild.test.ts`, 20 cases, all pass)

- **Validate path** (`importMemoryPortable`): truncated/garbage JSON,
  wrong format identifier, stale schemaVersion, non-array rows, truncated
  JSONL header/row lines, garbage markdown lines and partial metadata all
  throw descriptive, deterministic errors; the same corrupt bytes produce
  the identical error every time.
- **Doctor path** (`createFileMemoryProvider`): every corrupt input degrades
  to the standard explicit no-op row (`no-durable-memory`,
  `canonical-project-state`) — never a crash, never a fabricated row
  (REQ-MEM-001); repeated reads of corrupt bytes return identical results;
  a rejecting reader is an ordinary state.
- **Rebuild**: export → import round-trips byte-stably for json/jsonl/
  markdown; replacing corrupt bytes with valid text restores service.
- **Scanner context engines** on garbage/truncated input: lexicalContext,
  symbolIndex, contextMap and memoryBootstrap stay deterministic, never
  crash, and never invent facts or paths (truncated input is a stable,
  strict subset of the full index; corrupted scan stats echo garbage-in/
  garbage-out but attach no fabricated provenance).
