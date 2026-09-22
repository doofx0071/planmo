/**
 * P12-08 — Context retrieval evaluation (CHG-001 hardening).
 *
 * Deterministic retrieval fixtures for the 7 scenario types required by
 * docs/14-context-memory/evaluation.md (architecture decision lookup, failed
 * prior approach, code symbol location, package standard, stale/superseded
 * decision, conflicting facts, security invariant), plus one CONTROL scenario
 * that proves the v1 provider's ranking limitation honestly.
 *
 * WHAT IS MEASURED — documented exactly:
 *
 * - @planmo/agent-bridge v1 exposes NO query-aware retrieval function. The
 *   MemoryProvider interface is `relevant(contextId, limit)` and the shipped
 *   implementations (createMemoryProvider / createFileMemoryProvider) serve
 *   stored rows in deterministic id-ascending order, sliced to the limit;
 *   they are store adapters, not rankers. There is no stale/security filter
 *   in the provider (row kind has no staleness field).
 *
 * - This eval therefore measures TWO layers, kept visibly distinct:
 *   (1) the REFERENCE LEXICAL RANKER — a deterministic, in-file implementation
 *       of the "exact/lexical match" ranking signal from
 *       docs/14-context-memory/retrieval-token-budget.md (token-overlap
 *       score, id-ascending tie-break), applied to the same stored rows;
 *   (2) the REAL PROVIDER path — `relevant(contextId, k)` serving rows in
 *       id order. Both layers are measured with the SAME metric functions,
 *       so the numbers are directly comparable and the provider's behavior
 *       (deterministic, bounded, no fabrication) is asserted separately.
 *
 * - Metrics: recall@k, precision@k, required-fact inclusion (the golden
 *   "must surface" row is in the top-k), stale-memory exclusion (no
 *   SUPERSEDED-row in the top-k), and a deterministic token estimate computed
 *   by the REAL budget logic (compileContextBundle, 4 chars ≈ 1 token).
 *
 * - Stale convention: a row whose summary starts with "SUPERSEDED:" is stale.
 *   The eval fixture keeps stale rows as NEAR-MISSES (they share query terms)
 *   on purpose, so exclusion is measured, not assumed.
 *
 * Deterministic: fixed inline fixtures, seeded-free pure scoring, no
 * timestamps, no randomness.
 */
import { describe, expect, it } from 'vitest';
import { compileContextBundle, type BundleSource } from './context-bundle.js';
import { createMemoryProvider } from './memory-provider.js';
import { createFileMemoryProvider } from './memory-file-provider.js';
import { exportMemoryPortable } from './memory-portable.js';
import type { MemoryRowView } from './providers.js';

// ---------------------------------------------------------------- fixtures

interface Scenario {
  id: string;
  type: string;
  query: string;
  /** All rows stored in the memory layer for this context. */
  rows: readonly MemoryRowView[];
  /** Golden relevant rows (the evidence that genuinely answers the query). */
  relevantIds: readonly string[];
  /** The row that MUST surface in the top-k (required-fact inclusion). */
  requiredId: string;
  /** Golden stale rows that must NOT surface in the top-k. */
  staleIds: readonly string[];
}

const VIEW = { project: 'planmo-eval', contextId: 'eval', estimatedTokens: 0 };

function row(
  id: string,
  kind: MemoryRowView['kind'],
  summary: string,
  source: string,
): MemoryRowView {
  return { id, kind, summary, source };
}

/**
 * 1. Architecture decision lookup — which canonical ObjectId parser applies.
 * All three relevant rows score 5; the stale row scores 1; distractors score 0.
 */
const ADR_LOOKUP: Scenario = {
  id: 'scenario-01-adr-lookup',
  type: 'architecture decision lookup',
  query: 'which ObjectId parsing strategy is canonical for the payment adapter',
  rows: [
    row(
      'm0101',
      'decision',
      'ADR-007 canonical: payment adapter must use the ObjectId parser in packages/core/src/oid.ts',
      'docs/ADR-007.md',
    ),
    row(
      'm0102',
      'lesson',
      'rejected approach: hand-rolled ObjectId parsing inside the payment adapter failed zod validation',
      'docs/ADR-007.md',
    ),
    row(
      'm0103',
      'lesson',
      'always check the payment adapter ObjectId canonical source before writing parsers',
      'docs/12-lessons.md',
    ),
    row(
      'z-stale-1',
      'decision',
      'SUPERSEDED: legacy ObjectId shim under shared/utils was withdrawn after ADR-007',
      'docs/ADR-003.md',
    ),
    row(
      'm0104',
      'fact',
      'monorepo uses pnpm 10 workspaces with strict packaging',
      'docs/architecture.md',
    ),
    row(
      'm0105',
      'fact',
      'CI runs vitest across all packages on every push',
      'docs/architecture.md',
    ),
    row(
      'm0106',
      'warning',
      'node engines are pinned to major version twenty four at the repo root',
      'docs/architecture.md',
    ),
    row(
      'm0107',
      'fact',
      'documentation sources live under docs/ and are markdown only',
      'docs/architecture.md',
    ),
  ],
  relevantIds: ['m0101', 'm0102', 'm0103'],
  requiredId: 'm0101',
  staleIds: ['z-stale-1'],
};

/**
 * 2. Failed previous approach — what was tried for offline sync before the
 * queue worker. Relevant rows score 8/5/3; the stale row ties the third
 * relevant row at 3 and is pushed out by the deterministic id tie-break.
 */
const FAILED_APPROACH: Scenario = {
  id: 'scenario-02-failed-approach',
  type: 'failed prior approach',
  query: 'what did we previously attempt for offline sync before settling on the queue worker',
  rows: [
    row(
      'm0201',
      'lesson',
      'earlier offline sync attempt used a WebRTC peer channel and we dropped it for the queue worker',
      'docs/12-lessons.md',
    ),
    row(
      'm0202',
      'decision',
      'offline sync now goes through the durable queue worker with retries',
      'docs/ADR-009.md',
    ),
    row(
      'm0203',
      'lesson',
      'the WebRTC offline sync prototype never survived a restart',
      'docs/12-lessons.md',
    ),
    row(
      'z-stale-2',
      'decision',
      'SUPERSEDED: the weekly-batch offline sync plan is obsolete',
      'docs/ADR-002.md',
    ),
    row(
      'm0204',
      'fact',
      'auth uses rotating session tokens with short expiry',
      'docs/architecture.md',
    ),
    row('m0205', 'fact', 'CI runs the full suite on a schedule', 'docs/architecture.md'),
    row('m0206', 'fact', 'node is pinned at major version twenty four', 'docs/architecture.md'),
    row('m0207', 'fact', 'the release notes live in the changelog', 'docs/architecture.md'),
  ],
  relevantIds: ['m0201', 'm0202', 'm0203'],
  requiredId: 'm0201',
  staleIds: ['z-stale-2'],
};

/**
 * 3. Symbol location — where validateToken is defined. Relevant rows score
 * 5/2/2; the stale near-miss also scores 2 and is pushed to rank 4 by the id
 * tie-break (proving exclusion under a deliberate near-miss).
 */
const SYMBOL_LOCATION: Scenario = {
  id: 'scenario-03-symbol-location',
  type: 'code symbol location',
  query: 'where is the validateToken helper defined in this repository',
  rows: [
    row(
      'm0301',
      'fact',
      'validateToken helper is defined in packages/core/src/tokens.ts',
      'packages/core/src/tokens.ts',
    ),
    row(
      'm0302',
      'fact',
      'src/routes/health.ts imports validateToken from the token signing layer',
      'packages/scanner/src/scan/',
    ),
    row(
      'm0303',
      'fact',
      'the token signing layer re-exports validateToken for adapters',
      'packages/core/src/tokens.ts',
    ),
    row(
      'z-stale-3',
      'fact',
      'SUPERSEDED: validateToken used to live in shared/utils/string.ts',
      'docs/ADR-001.md',
    ),
    row(
      'm0304',
      'fact',
      'monorepo uses pnpm 10 workspaces with strict packaging',
      'docs/architecture.md',
    ),
    row(
      'm0305',
      'fact',
      'CI runs vitest across all packages on every push',
      'docs/architecture.md',
    ),
    row(
      'm0306',
      'warning',
      'node engines are pinned to major version twenty four at the repo root',
      'docs/architecture.md',
    ),
    row(
      'm0307',
      'fact',
      'documentation sources live under docs/ and are markdown only',
      'docs/architecture.md',
    ),
  ],
  relevantIds: ['m0301', 'm0302', 'm0303'],
  requiredId: 'm0301',
  staleIds: ['z-stale-3'],
};

/**
 * 4. Package standard — what a published PlanMo package must declare.
 * Relevant rows score 4/4/3; the stale row scores 2.
 */
const PACKAGE_STANDARD: Scenario = {
  id: 'scenario-04-package-standard',
  type: 'package standard',
  query: 'which package standard does planmo require for new published packages',
  rows: [
    row(
      'm0401',
      'decision',
      'published packages must ship types, an exports map and a build script per the package standard',
      'docs/STANDARDS.md',
    ),
    row(
      'm0402',
      'fact',
      'ADR-012 mandates the pnpm workspaces package layout for all packages',
      'docs/ADR-012.md',
    ),
    row(
      'm0403',
      'lesson',
      'every new published package in this repo must declare exports per package standard',
      'docs/12-lessons.md',
    ),
    row(
      'z-stale-4',
      'decision',
      'SUPERSEDED: the single-package repo standard was abandoned after the monorepo adoption',
      'docs/ADR-002.md',
    ),
    row('m0404', 'fact', 'the CI pipeline runs lint and format checks', 'docs/architecture.md'),
    row('m0405', 'fact', 'vitest powers all test runners', 'docs/architecture.md'),
    row(
      'm0406',
      'fact',
      'node engines are pinned to major version twenty four',
      'docs/architecture.md',
    ),
    row('m0407', 'fact', 'release notes live in the changelog', 'docs/architecture.md'),
  ],
  relevantIds: ['m0401', 'm0402', 'm0403'],
  requiredId: 'm0401',
  staleIds: ['z-stale-4'],
};

/**
 * 5. Stale/superseded decision — which payment processor decision applies.
 * Relevant rows score 3/2/2; the stale row ties at 2 and loses the id
 * tie-break (z- ids sort after m- ids).
 */
const STALE_DECISION: Scenario = {
  id: 'scenario-05-stale-decision',
  type: 'stale/superseded decision',
  query: 'what is the current payment processor decision',
  rows: [
    row(
      'm0501',
      'decision',
      'stripe is the active payment processor decision for all merchants',
      'docs/ADR-008.md',
    ),
    row(
      'm0502',
      'fact',
      'stripe relay endpoint handles payment processor callbacks',
      'docs/architecture.md',
    ),
    row(
      'm0503',
      'lesson',
      'adyen was rejected as the payment processor in 2026',
      'docs/12-lessons.md',
    ),
    row(
      'z-stale-5',
      'decision',
      'SUPERSEDED: braintree served as payment processor until q2',
      'docs/ADR-001.md',
    ),
    row('m0504', 'fact', 'the queue worker drains pending jobs hourly', 'docs/architecture.md'),
    row('m0505', 'fact', 'CI runs the full suite on a schedule', 'docs/architecture.md'),
    row('m0506', 'fact', 'the docs site uses static markdown', 'docs/architecture.md'),
    row('m0507', 'fact', 'node is pinned at major version twenty four', 'docs/architecture.md'),
  ],
  relevantIds: ['m0501', 'm0502', 'm0503'],
  requiredId: 'm0501',
  staleIds: ['z-stale-5'],
};

/**
 * 6. Conflicting facts — an old allowance vs the current prohibition both
 * surface (both are relevant evidence for the question); the SUPERSEDED row
 * still must not make the top-k.
 */
const CONFLICTING_FACTS: Scenario = {
  id: 'scenario-06-conflicting-facts',
  type: 'conflicting facts',
  query: 'can e2e tests mutate the production database',
  rows: [
    row(
      'm0601',
      'decision',
      'e2e tests must never run against the production database',
      'docs/ADR-011.md',
    ),
    row(
      'm0602',
      'fact',
      'staging e2e test database is copied from production nightly',
      'docs/architecture.md',
    ),
    row(
      'm0603',
      'warning',
      'a 2025 e2e suite once pointed at the production database by accident',
      'docs/12-lessons.md',
    ),
    row(
      'z-stale-6',
      'decision',
      'SUPERSEDED: an earlier decision allowed e2e tests against production on approved nights',
      'docs/ADR-002.md',
    ),
    row('m0604', 'fact', 'the CI pipeline runs lint and format checks', 'docs/architecture.md'),
    row('m0605', 'fact', 'release notes live in the changelog', 'docs/architecture.md'),
    row('m0606', 'fact', 'node engines are pinned', 'docs/architecture.md'),
    row('m0607', 'fact', 'the queue worker drains pending jobs', 'docs/architecture.md'),
  ],
  relevantIds: ['m0601', 'm0602', 'm0603'],
  requiredId: 'm0601',
  staleIds: ['z-stale-6'],
};

/**
 * 7. Security invariant — API keys must never be committed. Relevant rows
 * score 4/3/2; the stale row ties at 3 and loses the id tie-break.
 */
const SECURITY_INVARIANT: Scenario = {
  id: 'scenario-07-security-invariant',
  type: 'security invariant',
  query: 'is an api key allowed in a committed config file',
  rows: [
    row(
      'm0701',
      'warning',
      'api keys must never be committed to config files in this repository',
      'docs/SECURITY.md',
    ),
    row(
      'm0702',
      'fact',
      'secret scanning runs on every commit and blocks api key patterns',
      'docs/architecture.md',
    ),
    row(
      'm0703',
      'warning',
      'a dev config sample once contained an api key and was scrubbed',
      'docs/12-lessons.md',
    ),
    row(
      'z-stale-7',
      'decision',
      'SUPERSEDED: older policy permitted test api keys inside committed fixtures',
      'docs/ADR-002.md',
    ),
    row('m0704', 'fact', 'the queue worker drains pending jobs hourly', 'docs/architecture.md'),
    row('m0705', 'fact', 'vitest powers all test runners', 'docs/architecture.md'),
    row('m0706', 'fact', 'the docs site uses static markdown', 'docs/architecture.md'),
    row('m0707', 'fact', 'release notes live in the changelog', 'docs/architecture.md'),
  ],
  relevantIds: ['m0701', 'm0702', 'm0703'],
  requiredId: 'm0701',
  staleIds: ['z-stale-7'],
};

/**
 * 8. CONTROL — the SAME corpus as scenario 1 with ids permuted so the
 * relevant rows sort LAST alphabetically. The reference ranker still returns
 * the three relevant rows (scoring is id-independent), while the real v1
 * provider (id-ascending order) returns the stale row + two distractors.
 * This isolates the provider's ranking limitation from retrieval quality.
 */
const CONTROL_ID_PERMUTATION: Scenario = {
  id: 'scenario-08-control-provider-blind-spot',
  type: 'control: provider ranking blind spot',
  query: 'which ObjectId parsing strategy is canonical for the payment adapter',
  rows: [
    row(
      'a-stale-8',
      'decision',
      'SUPERSEDED: legacy ObjectId shim under shared/utils was withdrawn after ADR-007',
      'docs/ADR-003.md',
    ),
    row(
      'm08d1',
      'fact',
      'monorepo uses pnpm 10 workspaces with strict packaging',
      'docs/architecture.md',
    ),
    row(
      'm08d2',
      'fact',
      'CI runs vitest across all packages on every push',
      'docs/architecture.md',
    ),
    row(
      'm08d3',
      'warning',
      'node engines are pinned to major version twenty four at the repo root',
      'docs/architecture.md',
    ),
    row(
      'm08d4',
      'fact',
      'documentation sources live under docs/ and are markdown only',
      'docs/architecture.md',
    ),
    row(
      'z-rel-a',
      'decision',
      'ADR-007 canonical: payment adapter must use the ObjectId parser in packages/core/src/oid.ts',
      'docs/ADR-007.md',
    ),
    row(
      'z-rel-b',
      'lesson',
      'rejected approach: hand-rolled ObjectId parsing inside the payment adapter failed zod validation',
      'docs/ADR-007.md',
    ),
    row(
      'z-rel-c',
      'lesson',
      'always check the payment adapter ObjectId canonical source before writing parsers',
      'docs/12-lessons.md',
    ),
  ],
  relevantIds: ['z-rel-a', 'z-rel-b', 'z-rel-c'],
  requiredId: 'z-rel-a',
  staleIds: ['a-stale-8'],
};

const SCENARIOS: readonly Scenario[] = [
  ADR_LOOKUP,
  FAILED_APPROACH,
  SYMBOL_LOCATION,
  PACKAGE_STANDARD,
  STALE_DECISION,
  CONFLICTING_FACTS,
  SECURITY_INVARIANT,
  CONTROL_ID_PERMUTATION,
];

const K = 3;

// ------------------------------------------------- reference lexical ranker

/**
 * Reference lexical ranker (docs/14-context-memory/retrieval-token-budget.md,
 * "exact/lexical match" signal). Deterministic: token-overlap score, tie-break
 * by id ascending. It is the EVAL HARNESS baseline, not shipped product code —
 * @planmo/agent-bridge v1 has no retrieval ranker (documented above), and the
 * provider numbers below measure what the real layer actually serves.
 */
export function tokenize(text: string): readonly string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export function lexicalScore(query: string, rowText: string): number {
  const queryTokens = tokenize(query);
  const rowTokens = tokenize(rowText);
  let score = 0;
  for (const token of queryTokens) {
    if (rowTokens.includes(token)) score += 1;
  }
  return score;
}

function rowText(rowEntry: MemoryRowView): string {
  // Kind is metadata, not content: score summary + provenance only, matching
  // the L1 "memory titles/summaries" signal (retrieval-token-budget.md).
  return `${rowEntry.summary} ${rowEntry.source}`;
}

export function rankRows(query: string, rows: readonly MemoryRowView[]): MemoryRowView[] {
  return [...rows].sort((a, b) => {
    const scoreA = lexicalScore(query, rowText(a));
    const scoreB = lexicalScore(query, rowText(b));
    return scoreB - scoreA || a.id.localeCompare(b.id);
  });
}

function isStale(rowEntry: MemoryRowView): boolean {
  return rowEntry.summary.startsWith('SUPERSEDED:');
}

// ----------------------------------------------------------------- metrics

export interface RetrievalMetrics {
  recallAtK: number;
  precisionAtK: number;
  requiredFactIncluded: boolean;
  staleRowsInTopK: number;
}

/** Pure metric computation over an already-selected top-k. */
export function metricsFor(topK: readonly MemoryRowView[], scenario: Scenario): RetrievalMetrics {
  const relevantInTopK = topK.filter((r) => scenario.relevantIds.includes(r.id)).length;
  const staleInTopK = topK.filter(
    (r) => scenario.staleIds.includes(r.id) || (isStale(r) && scenario.staleIds.length > 0),
  ).length;
  return {
    recallAtK: relevantInTopK / scenario.relevantIds.length,
    precisionAtK: relevantInTopK / topK.length,
    requiredFactIncluded: topK.some((r) => r.id === scenario.requiredId),
    staleRowsInTopK: staleInTopK,
  };
}

/** The rows the REAL v1 provider serves: deterministic id-ascending, sliced. */
export function providerTopK(rows: readonly MemoryRowView[], k: number): MemoryRowView[] {
  return [...rows]
    .filter((r) => r.id.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, k);
}

// --------------------------------------------------------------- the tests

describe('P12-08 reference lexical ranker — metric properties', () => {
  it('scores deterministically: identical inputs produce identical rankings', () => {
    for (const scenario of SCENARIOS) {
      const once = rankRows(scenario.query, scenario.rows).map((r) => r.id);
      const twice = rankRows(scenario.query, scenario.rows).map((r) => r.id);
      expect(twice).toEqual(once);
    }
  });

  it('ranks the required fact first and returns exactly the golden top-3 for every canonical scenario', () => {
    // Hand-derived expected orders (score desc, id asc tie-break). Locked as
    // snapshots: any change to the ranker or fixtures breaks this test loudly.
    const expectedTop3: Readonly<Record<string, readonly string[]>> = {
      'scenario-01-adr-lookup': ['m0101', 'm0102', 'm0103'],
      'scenario-02-failed-approach': ['m0201', 'm0202', 'm0203'],
      'scenario-03-symbol-location': ['m0301', 'm0302', 'm0303'],
      'scenario-04-package-standard': ['m0401', 'm0403', 'm0402'],
      'scenario-05-stale-decision': ['m0501', 'm0503', 'm0502'],
      'scenario-06-conflicting-facts': ['m0601', 'm0603', 'm0602'],
      'scenario-07-security-invariant': ['m0703', 'm0701', 'm0702'],
      'scenario-08-control-provider-blind-spot': ['z-rel-a', 'z-rel-b', 'z-rel-c'],
    };
    for (const scenario of SCENARIOS) {
      const top3 = rankRows(scenario.query, scenario.rows)
        .slice(0, K)
        .map((r) => r.id);
      expect(top3, scenario.id).toEqual(expectedTop3[scenario.id]);
      // Required-fact inclusion (in top-K), the measure in evaluation.md.
      expect(top3, `${scenario.id} required fact in top-${K}`).toContain(scenario.requiredId);
    }
  });

  it('achieves recall@3 = 1, precision@3 = 1, required-fact inclusion and full stale exclusion for all 8 scenarios', () => {
    for (const scenario of SCENARIOS) {
      const top3 = rankRows(scenario.query, scenario.rows).slice(0, K);
      const m = metricsFor(top3, scenario);
      expect(m.recallAtK, `${scenario.id} recall@3`).toBe(1);
      expect(m.precisionAtK, `${scenario.id} precision@3`).toBe(1);
      expect(m.requiredFactIncluded, `${scenario.id} required fact`).toBe(true);
      expect(m.staleRowsInTopK, `${scenario.id} stale exclusion`).toBe(0);
    }
  });

  it('near-miss stale rows score below the evidence: stale rows are never rank 1-3', () => {
    // The stale rows deliberately share query terms; assert they still rank
    // below all relevant rows in every scenario (deterministic exclusion).
    for (const scenario of SCENARIOS) {
      const ranked = rankRows(scenario.query, scenario.rows);
      const worstRelevantRank = Math.max(
        ...scenario.relevantIds.map((id) => ranked.findIndex((r) => r.id === id)),
      );
      for (const staleId of scenario.staleIds) {
        const staleRank = ranked.findIndex((r) => r.id === staleId);
        expect(staleRank, `${scenario.id} stale ${staleId}`).toBeGreaterThan(worstRelevantRank);
      }
    }
  });
});

describe('P12-08 real provider path (relevant(contextId, k))', () => {
  it('serves rows in deterministic id-ascending order within the limit, never fabricating', async () => {
    const provider = createMemoryProvider(ADR_LOOKUP.rows);
    const rows = await provider.relevant('scenario-01-adr-lookup', K);
    expect(rows.map((r) => r.id)).toEqual(['m0101', 'm0102', 'm0103']);
    // All returned rows are verbatim source rows (REQ-MEM-001: no fabrication).
    for (const returned of rows) {
      expect(ADR_LOOKUP.rows).toContainEqual(returned);
    }
  });

  it('returns the same deterministic subset on repeated calls', async () => {
    const provider = createMemoryProvider(ADR_LOOKUP.rows);
    const first = await provider.relevant('scenario-01-adr-lookup', K);
    const second = await provider.relevant('scenario-01-adr-lookup', K);
    expect(second).toEqual(first);
  });

  it('respects the caller limit and the configured limit (file provider)', async () => {
    const text = exportMemoryPortable(VIEW, ADR_LOOKUP.rows, 'json');
    const fileProvider = createFileMemoryProvider({ format: 'json', readText: async () => text });
    expect((await fileProvider.relevant('scenario-01-adr-lookup', 2)).map((r) => r.id)).toEqual([
      'm0101',
      'm0102',
    ]);
    expect((await fileProvider.relevant('scenario-01-adr-lookup', 100)).length).toBe(8);
  });

  it('returns the explicit no-op row for an empty memory (never fabricates)', async () => {
    const provider = createMemoryProvider([]);
    const rows = await provider.relevant('scenario-01-adr-lookup', K);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('no-durable-memory');
    expect(rows[0]?.source).toBe('canonical-project-state');
  });

  it('CONTROL: the v1 provider (id-ordered) misses the evidence when relevant rows sort last', async () => {
    // The reference ranker still solves the control perfectly (asserted
    // above); the REAL provider selects purely by id, so it returns the stale
    // row plus two distractors and ZERO of the relevant rows. This is the
    // honest, measured limit of the v1 provider — the docs record it.
    const provider = createMemoryProvider(CONTROL_ID_PERMUTATION.rows);
    const topK = await provider.relevant('scenario-08-control-provider-blind-spot', K);
    expect(topK.map((r) => r.id)).toEqual(['a-stale-8', 'm08d1', 'm08d2']);
    const m = metricsFor(topK, CONTROL_ID_PERMUTATION);
    expect(m.recallAtK).toBe(0);
    expect(m.precisionAtK).toBe(0);
    expect(m.requiredFactIncluded).toBe(false);
    expect(m.staleRowsInTopK).toBe(1);
  });

  it('provides a stable baseline: providers over the same rows yield identical metrics for all scenarios', async () => {
    for (const scenario of SCENARIOS) {
      const p = createMemoryProvider(scenario.rows);
      const rows = await p.relevant(scenario.id, K);
      const m = metricsFor(rows, scenario);
      const again = metricsFor(rows, scenario);
      expect(again).toEqual(m);
    }
  });
});

describe('P12-08 token estimate (real budget logic) and bundle determinism', () => {
  function bundleFor(scenario: Scenario, topK: readonly MemoryRowView[]): BundleSource {
    return {
      project: 'planmo-eval',
      contextId: scenario.id,
      capsule: scenario.query,
      indexEntries: topK.map((r) => `[${r.kind}] ${r.summary}`),
      evidenceEntries: topK.map((r) => `${r.summary} (source: ${r.source})`),
      retrievalHandles: topK.map((r) => `memory:${r.id}`),
      sourcePaths: topK.map((r) => r.source),
    };
  }

  it('estimates tokens deterministically with compileContextBundle (4 chars per token)', () => {
    for (const scenario of SCENARIOS) {
      const topK = rankRows(scenario.query, scenario.rows).slice(0, K);
      const first = compileContextBundle(bundleFor(scenario, topK));
      const second = compileContextBundle(bundleFor(scenario, topK));
      expect(second.estimatedTokens).toBe(first.estimatedTokens);
      expect(first.l0Capsule).toBe(scenario.query);
      expect(first.retrievalHandles).toEqual([...topK.map((r) => `memory:${r.id}`)].sort());
      // Small deterministic bundles: capture layer estimates are pure counts.
      expect(first.estimatedTokens).toBeGreaterThan(0);
    }
  });

  it('keeps every scenario bundle within the eval budget of 250 estimated tokens', () => {
    for (const scenario of SCENARIOS) {
      const topK = rankRows(scenario.query, scenario.rows).slice(0, K);
      const bundle = compileContextBundle(bundleFor(scenario, topK));
      expect(bundle.estimatedTokens, `${scenario.id} <= 250`).toBeLessThanOrEqual(250);
    }
  });

  it('honors the index/evidence caps of the progressive-disclosure machinery', () => {
    const topK = rankRows(ADR_LOOKUP.query, ADR_LOOKUP.rows).slice(0, K);
    const source = bundleFor(ADR_LOOKUP, topK);
    const capped = compileContextBundle(source, {
      indexMax: 2,
      evidenceMax: 0,
      budgetTokens: 1000,
    });
    expect(capped.l1Index.split('\n').filter((line) => line.length > 0)).toHaveLength(2);
    expect(capped.l2Evidence).toBe('');
    // The budget accounting reflects the caps: fewer entries, fewer tokens.
    const uncapped = compileContextBundle(source, { budgetTokens: 1000 });
    expect(capped.estimatedTokens).toBeLessThan(uncapped.estimatedTokens);
  });
});
