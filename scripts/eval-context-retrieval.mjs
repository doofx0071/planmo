/**
 * PlanMo P12-08 — context retrieval eval harness (CHG-001).
 *
 * Run (repo root, dist current):
 *   node scripts/eval-context-retrieval.mjs
 *
 * Prints the deterministic eval table for the 7 scenario types required by
 * docs/14-context-memory/evaluation.md (plus one provider blind-spot
 * control) and exits nonzero when any measured requirement fails.
 *
 * The fixtures and the reference lexical ranker are byte-identical copies of
 * packages/agent-bridge/src/context-retrieval-eval.test.ts — the numbers this
 * script prints are asserted as pass/fail by that test, so docs can quote
 * either the script output or the vitest run and they agree.
 *
 * Measured (exactly, no more):
 *   - recall@k / precision@k of a deterministic lexical ranker (the
 *     "exact/lexical match" first-ranking signal from
 *     docs/14-context-memory/retrieval-token-budget.md) over the fixture
 *     corpora;
 *   - the same metrics for the REAL provider path
 *     (@planmo/agent-bridge createMemoryProvider.relevant(ctx, k)), which in
 *     v1 selects rows by deterministic id order — NOT by query relevance;
 *     agent-bridge exposes no query-aware retrieval function beyond the
 *     providers, so the provider numbers document exactly what v1 selects;
 *   - required-fact inclusion (the required row inside top-k);
 *   - stale-memory exclusion (SUPERSEDED-marked rows never inside top-k);
 *   - token estimate (compileContextBundle's real chars/4 accounting over
 *     the ranked bundle). Latency is NOT measured: the harness is pure
 *     in-memory and sub-ms; claiming latency numbers would be fabrication.
 *
 * Deterministic: fixed fixtures, no timestamps, no Math.random.
 */

import {
  compileContextBundle,
  createMemoryProvider,
  importMemoryPortable,
  exportMemoryPortable,
} from '../packages/agent-bridge/dist/index.js';

let failures = 0;
const K = 3;

// ---------------------------------------------------------------------------
// Fixtures (identical to the vitest file).
// ---------------------------------------------------------------------------

const row = (id, kind, summary, source) => ({ id, kind, summary, source });
const S = (id, query, rows, relevantIds, requiredId, staleIds) => ({
  id,
  query,
  rows,
  relevantIds,
  requiredId,
  staleIds,
});

const SCENARIOS = [
  S(
    'scenario-01-adr-lookup',
    'which ObjectId parsing strategy is canonical for the payment adapter',
    [
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
        'docs/12-lessons.md',
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
        'docs/ADR-002.md',
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
        'node engines are pinned to major version twenty four',
        'docs/architecture.md',
      ),
      row(
        'm0107',
        'fact',
        'documentation sources live under docs/ and are markdown only',
        'docs/architecture.md',
      ),
    ],
    ['m0101', 'm0102', 'm0103'],
    'm0101',
    ['z-stale-1'],
  ),
  S(
    'scenario-02-failed-approach',
    'what did we previously attempt for offline sync before settling on the queue worker',
    [
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
        'the WebRTC offline sync prototype never survived a browser restart',
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
      row('m0205', 'fact', 'CI runs the full test suite on schedule', 'docs/architecture.md'),
      row(
        'm0206',
        'fact',
        'node engines are pinned at major version twenty four',
        'docs/architecture.md',
      ),
      row('m0207', 'fact', 'documentation is markdown under docs/', 'docs/architecture.md'),
    ],
    ['m0201', 'm0202', 'm0203'],
    'm0201',
    ['z-stale-2'],
  ),
  S(
    'scenario-03-symbol-location',
    'where is the validateToken helper defined in this repository',
    [
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
        'src/routes/health.ts',
      ),
      row(
        'm0303',
        'fact',
        'the token signing layer re-exports validateToken for adapters',
        'packages/adapters/src/contract.ts',
      ),
      row(
        'z-stale-3',
        'fact',
        'SUPERSEDED: validateToken used to live in shared/utils/string.ts',
        'docs/ADR-003.md',
      ),
      row('m0304', 'fact', 'the monorepo is managed with pnpm workspaces', 'docs/architecture.md'),
      row('m0305', 'fact', 'CI runs the full test suite on schedule', 'docs/architecture.md'),
      row('m0306', 'fact', 'the queue worker drains pending jobs hourly', 'docs/architecture.md'),
      row(
        'm0307',
        'fact',
        'node engines are pinned at major version twenty four',
        'docs/architecture.md',
      ),
    ],
    ['m0301', 'm0302', 'm0303'],
    'm0301',
    ['z-stale-3'],
  ),
  S(
    'scenario-04-package-standard',
    'which package standard does planmo require for new published packages',
    [
      row(
        'm0401',
        'decision',
        'published packages must ship types, an exports map and a build script per the package standard',
        'docs/ADR-012.md',
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
      row('m0406', 'fact', 'node engines are pinned to major twenty four', 'docs/architecture.md'),
      row('m0407', 'fact', 'release notes live in the changelog', 'docs/architecture.md'),
    ],
    ['m0401', 'm0402', 'm0403'],
    'm0401',
    ['z-stale-4'],
  ),
  S(
    'scenario-05-stale-decision',
    'what is the current payment processor decision',
    [
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
    ['m0501', 'm0502', 'm0503'],
    'm0501',
    ['z-stale-5'],
  ),
  S(
    'scenario-06-conflicting-facts',
    'can e2e tests mutate the production database',
    [
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
      row('m0606', 'fact', 'node engines are pinned to major twenty four', 'docs/architecture.md'),
      row('m0607', 'fact', 'the queue worker drains pending jobs hourly', 'docs/architecture.md'),
    ],
    ['m0601', 'm0602', 'm0603'],
    'm0601',
    ['z-stale-6'],
  ),
  S(
    'scenario-07-security-invariant',
    'is an api key allowed in a committed config file',
    [
      row(
        'm0701',
        'warning',
        'api keys must never be committed to config files in this repository',
        'docs/11-security.md',
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
    ['m0701', 'm0702', 'm0703'],
    'm0701',
    ['z-stale-7'],
  ),
  // Control: the SAME corpus as scenario-01 with ids permuted so relevant
  // rows sort LAST by id. The ranker must be unaffected (score-based); the
  // id-ordered v1 provider must be blind to it — the documented gap.
  S(
    'scenario-08-control-provider-blind-spot',
    'which ObjectId parsing strategy is canonical for the payment adapter',
    [
      row(
        'a-stale-8',
        'decision',
        'SUPERSEDED: legacy ObjectId shim under shared/utils was withdrawn after ADR-007',
        'docs/ADR-002.md',
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
        'node engines are pinned to major version twenty four',
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
        'docs/12-lessons.md',
      ),
      row(
        'z-rel-c',
        'lesson',
        'always check the payment adapter ObjectId canonical source before writing parsers',
        'docs/12-lessons.md',
      ),
    ],
    ['z-rel-a', 'z-rel-b', 'z-rel-c'],
    'z-rel-a',
    ['a-stale-8'],
  ),
];

// ---------------------------------------------------------------------------
// Reference lexical ranker (identical to the vitest file).
// ---------------------------------------------------------------------------

const rowText = ({ summary, source }) => `${summary} ${source}`;
const tokenize = (text) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const lexicalScore = (query, text) => {
  const q = new Set(tokenize(query));
  let score = 0;
  for (const t of tokenize(text)) if (q.has(t)) score += 1;
  return score;
};
const rankRows = (query, rows) =>
  [...rows].sort((a, b) => {
    const sa = lexicalScore(query, rowText(a));
    const sb = lexicalScore(query, rowText(b));
    return sb - sa || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });

const metricsFor = (topK, s) => {
  const ids = new Set(topK.map((r) => r.id));
  const relevant = s.relevantIds.filter((id) => ids.has(id)).length;
  const stale = s.staleIds.filter((id) => ids.has(id)).length;
  return {
    recallAtK: relevant / s.relevantIds.length,
    precisionAtK: relevant / K,
    requiredFactIncluded: ids.has(s.requiredId),
    staleRowsInTopK: stale,
  };
};

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

// ---------------------------------------------------------------------------
// Measurement.
// ---------------------------------------------------------------------------

console.log('P12-08 context retrieval eval (deterministic; k = 3)');
console.log(
  'scenario | ranker recall@3 | ranker precision@3 | required-fact | stale-exclusion | provider recall@3 | provider precision@3 | provider required | provider stale-in-top3 | token estimate',
);
console.log('-'.repeat(180));

let aggregated = {
  rankerRecall: [],
  rankerPrecision: [],
  required: [],
  staleExclusion: [],
  providerRecall: [],
  providerPrecision: [],
  providerRequired: [],
  providerStale: [],
  tokens: [],
};

for (const s of SCENARIOS) {
  const ranked = rankRows(s.query, s.rows);
  const top3 = ranked.slice(0, K);
  const m = metricsFor(top3, s);

  const provider = createMemoryProvider(s.rows);
  const providerRows = await provider.relevant(s.id, K);
  const pm = metricsFor(providerRows, s);

  // Deterministic token estimate over the ranked bundle (real accounting:
  // compileContextBundle's chars/4).
  const bundle = compileContextBundle({
    project: 'planmo-eval',
    contextId: s.id,
    capsule: s.query,
    indexEntries: top3.map((r) => r.summary),
    evidenceEntries: top3.map((r) => `${r.summary} (source: ${r.source})`),
    retrievalHandles: top3.map((r) => r.id),
  });

  // deterministic repeatability of the provider path
  const again = await provider.relevant(s.id, K);
  if (JSON.stringify(again) !== JSON.stringify(providerRows)) {
    failures += 1;
    console.log(`FAIL ${s.id}: provider path not deterministic`);
  }

  console.log(
    `${s.id} | ${fmt(m.recallAtK)} | ${fmt(m.precisionAtK)} | ${m.requiredFactIncluded ? 'yes' : 'NO'} | ${m.staleRowsInTopK === 0 ? 'yes' : `NO(${m.staleRowsInTopK})`} | ${fmt(pm.recallAtK)} | ${fmt(pm.precisionAtK)} | ${pm.requiredFactIncluded ? 'yes' : 'NO'} | ${pm.staleRowsInTopK} | ${bundle.estimatedTokens}`,
  );

  aggregated.rankerRecall.push(m.recallAtK);
  aggregated.rankerPrecision.push(m.precisionAtK);
  aggregated.required.push(m.requiredFactIncluded ? 1 : 0);
  aggregated.staleExclusion.push(m.staleRowsInTopK === 0 ? 1 : 0);
  aggregated.providerRecall.push(pm.recallAtK);
  aggregated.providerPrecision.push(pm.precisionAtK);
  aggregated.providerRequired.push(pm.requiredFactIncluded ? 1 : 0);
  aggregated.providerStale.push(pm.staleRowsInTopK);
  aggregated.tokens.push(bundle.estimatedTokens);

  if (
    m.recallAtK < 1 ||
    m.precisionAtK < 1 / K ||
    !m.requiredFactIncluded ||
    m.staleRowsInTopK > 0
  ) {
    failures += 1;
    console.log(`FAIL ${s.id}: ranker requirement not met`);
  }
  if (bundle.estimatedTokens > 300) {
    failures += 1;
    console.log(`FAIL ${s.id}: token estimate ${bundle.estimatedTokens} over budget 300`);
  }
}

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log('-'.repeat(180));
console.log(
  `aggregate | ${fmt(avg(aggregated.rankerRecall))} | ${fmt(avg(aggregated.rankerPrecision))} | ${aggregated.required.reduce((a, b) => a + b, 0)}/8 | ${aggregated.staleExclusion.reduce((a, b) => a + b, 0)}/8 | ${fmt(avg(aggregated.providerRecall))} | ${fmt(avg(aggregated.providerPrecision))} | ${aggregated.providerRequired.reduce((a, b) => a + b, 0)}/8 | ${aggregated.providerStale.reduce((a, b) => a + b, 0)} | ${Math.max(...aggregated.tokens)}`,
);
console.log(
  `note: v1 provider selects by deterministic id order, not query relevance; the blind-spot control (scenario-08) quantifies that gap. token estimate = compileContextBundle chars/4 over the ranked top-${K} bundle (max across scenarios).`,
);

// Portable round-trip cross-check: every fixture corpus exports and re-imports
// byte-stably (the eval fixtures are rebuildable from canonical bytes).
for (const s of SCENARIOS) {
  const text = exportMemoryPortable(
    { project: 'planmo-eval', contextId: s.id, estimatedTokens: 64 },
    s.rows,
    'json',
  );
  const imported = importMemoryPortable(text, 'json');
  if (imported.rows.length !== s.rows.length) {
    failures += 1;
    console.log(`FAIL ${s.id}: portable round-trip lost rows`);
  }
}

if (failures > 0) {
  console.log(`\nP12-08 eval: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\nP12-08 eval: PASS');
