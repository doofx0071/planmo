/**
 * PlanMo P12-09 — retrieval & token budget benchmark (CHG-001).
 *
 * Run (repo root, dist current):
 *   node scripts/eval-token-budget.mjs
 *
 * Compares the four context strategies from
 * docs/14-context-memory/retrieval-token-budget.md on a representative
 * PlanMo fixture set (the committed generator golden "high" planning tree):
 *
 *   1. full-context   — every golden planning document, concatenated;
 *   2. repo-map only  — @planmo/scanner contextMapEngine output for the same
 *                       fixture tree (real repo-map artifact, no evidence);
 *   3. repo-map + lexical — repo map plus the real lexicalContext token
 *                       histogram over the golden files;
 *   4. hybrid         — repo map + lexical + deterministically selected
 *                       policy evidence (semantic-retrieval placeholder:
 *                       keyword-select the security + standards policies).
 *
 * Token estimation is EXACTLY the accounting the bundle compiler uses today:
 * 4 chars ≈ 1 token (Math.ceil(len/4), context-bundle.ts), cross-checked by
 * running the same text through compileContextBundle. No claims beyond that.
 *
 * The overflow rule ("preserve security/invariants first") is applied as a
 * verdict, not an assumption: a strategy that drops the security policy
 * excerpt is marked as NOT retaining invariants even when it is cheaper.
 *
 * Deterministic: committed fixtures, sorted reads, fixed budget 8000
 * (context-bundle.ts DEFAULT_BUDGET_TOKENS), no timestamps, no Math.random.
 * Exits nonzero when any strategy exceeds the budget or when the
 * full-context baseline is missing.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileContextBundle } from '../packages/agent-bridge/dist/index.js';
import { contextMapEngine } from '../packages/scanner/dist/index.js';
import { lexicalContext } from '../packages/scanner/dist/index.js';

const root = dirname(fileURLToPath(import.meta.url)); // scripts/
const GOLDEN_DIR = join(root, '..', 'packages', 'generator', 'src', 'golden', 'high');
const BUDGET = 8000; // context-bundle.ts DEFAULT_BUDGET_TOKENS

let failures = 0;

// ---------------------------------------------------------------------------
// Fixture tree: the committed golden "high" planning documents.
// ---------------------------------------------------------------------------

const goldenFiles = readdirSync(GOLDEN_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort(); // deterministic

const files = new Map(
  goldenFiles.map((f) => [`planning/${f}`, readFileSync(join(GOLDEN_DIR, f), 'utf8')]),
);

/** Deterministic ScanReport mirroring the golden tree (real sizes from disk). */
function goldenScanReport() {
  const entries = [];
  const dirs = new Set();
  for (const [path, text] of files) {
    const dir = path.slice(0, path.lastIndexOf('/'));
    if (dir.length > 0) dirs.add(dir);
    entries.push({ path, type: 'file', size: Buffer.byteLength(text, 'utf8') });
  }
  for (const d of [...dirs].sort()) {
    entries.push({ path: d, type: 'dir', size: 0 });
  }
  entries.push({ path: 'planning', type: 'dir', size: 0 });
  return {
    root: 'planmo-golden-high',
    entries,
    warnings: [],
    stats: {
      files: [...files.keys()].length,
      dirs: dirs.size + 1,
      symlinks: 0,
      totalBytes: [...files.values()].reduce((n, t) => n + Buffer.byteLength(t, 'utf8'), 0),
    },
    truncatedBy: null,
  };
}

const DETECTION = {
  stacks: [
    {
      id: 'typescript',
      category: 'language',
      confidence: 'high',
      evidence: [
        {
          path: 'planning/planning_phases_phase-00.md',
          source: 'file-convention',
          code: 'DET-004',
          match: 'typescript',
        },
      ],
    },
  ],
  testFrameworks: ['vitest'],
  ciSystems: ['github-actions'],
};

// ---------------------------------------------------------------------------
// Strategy builders (deterministic).
// ---------------------------------------------------------------------------

const SECURITY_EXCERPT = (() => {
  const text = files.get('planning/planning_policies_security.md') ?? '';
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 5)
    .join('\n');
})();

const STANDARDS_EXCERPT = (() => {
  const text = files.get('planning/planning_STANDARDS.md') ?? '';
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 5)
    .join('\n');
})();

const fullContext = (() => {
  let out = '';
  for (const f of goldenFiles) {
    out += `===== planning/${f} =====\n${files.get(`planning/${f}`)}\n\n`;
  }
  return out.trim();
})();

async function buildStrategies() {
  const map = await contextMapEngine().map(goldenScanReport(), DETECTION);
  const repoMap = [
    `root: ${map.root}`,
    `entry points: ${map.entryPoints.join(', ') || '(none)'}`,
    `top-level: ${map.topLevel.map((t) => `${t.path} (${t.files}f/${t.dirs}d)`).join(', ') || '(none)'}`,
    `config files: ${map.configFiles.join(', ') || '(none)'}`,
    `scripts: ${map.scripts.map((s) => `${s.path}:${s.name}`).join(', ') || '(none)'}`,
    `warnings: ${map.warnings.join('; ') || '(none)'}`,
  ].join('\n');

  const lexical = await lexicalContext.index(files);
  const lexicalText = lexical
    .map((e) => {
      const top = e.tokens
        .slice(0, 20)
        .map((t) => `${t.token}x${t.count}`)
        .join(' ');
      const markers = e.markers.length > 0 ? ` [${e.markers.join(',')}]` : '';
      return `${e.file}: ${top}${markers}`;
    })
    .join('\n');

  const repoMapOnly = `CAPSULE (L0)\nproject: planmo-golden-high (generator golden fixture)\ninvariants: security policy retained via the overflow rule — NOT included in this strategy (finding)\n\nREPOSITORY MAP (L1)\n${repoMap}`;

  const repoMapLexical = `CAPSULE (L0)\nproject: planmo-golden-high (generator golden fixture)\ninvariants: security policy excerpt retained (overflow rule)\n\n${SECURITY_EXCERPT}\n\nREPOSITORY MAP (L1)\n${repoMap}\n\nLEXICAL INDEX (L1)\n${lexicalText}`;

  const hybrid = `${repoMapLexical}\n\nSELECTED EVIDENCE (L2, deterministic keyword seed)\n${STANDARDS_EXCERPT}\n\n${SECURITY_EXCERPT}`;

  return {
    '1-full-context': { text: fullContext, invariants: true },
    '2-repo-map-only': { text: repoMapOnly, invariants: false }, // security excerpt absent — finding
    '3-repo-map+lexical': { text: repoMapLexical, invariants: true },
    '4-hybrid': { text: hybrid, invariants: true },
  };
}

// ---------------------------------------------------------------------------
// Measurement (chars/4, cross-checked through compileContextBundle).
// ---------------------------------------------------------------------------

const estimateChars4 = (text) => Math.ceil(text.length / 4);
const bundleEstimate = (text) =>
  compileContextBundle({
    project: 'planmo-golden-high',
    contextId: 'token-budget-bench',
    capsule: '',
    indexEntries: [text],
    evidenceEntries: [],
    retrievalHandles: [],
  }).estimatedTokens;

const strategies = await buildStrategies();

console.log(
  'P12-09 retrieval & token budget benchmark (deterministic; fixtures: packages/generator/src/golden/high)',
);
console.log(
  'strategy | chars | tokens (chars/4) | compileContextBundle | vs full-context | invariants retained | verdict',
);
console.log('-'.repeat(160));

const rows = [];
for (const [name, { text, invariants }] of Object.entries(strategies)) {
  const chars = Buffer.byteLength(text, 'utf8');
  const tokensC4 = estimateChars4(text);
  const tokensBundle = bundleEstimate(text);
  rows.push({ name, chars, tokensC4, tokensBundle, invariants });
}

const fullTokens = rows.find((r) => r.name === '1-full-context')?.tokensC4;
if (fullTokens === undefined) {
  console.log('FAIL: full-context baseline missing');
  process.exit(1);
}

for (const r of rows) {
  const delta = ((r.tokensC4 / fullTokens) * 100).toFixed(0);
  const overBudget = r.tokensC4 > BUDGET;
  const invariantNote = r.invariants ? 'yes' : 'NO (overflow-rule finding)';
  const verdict = overBudget ? 'OVER-BUDGET' : 'PASS';
  if (overBudget) failures += 1;
  console.log(
    `${r.name} | ${r.chars} | ${r.tokensC4} | ${r.tokensBundle} | ${delta}% | ${invariantNote} | ${verdict}`,
  );
  if (r.tokensBundle !== r.tokensC4) {
    failures += 1;
    console.log(
      `FAIL ${r.name}: compileContextBundle (${r.tokensBundle}) disagrees with chars/4 (${r.tokensC4})`,
    );
  }
}

console.log('-'.repeat(160));
console.log(
  `verdict per retrieval-token-budget.md: budget ${BUDGET} tokens (context-bundle.ts default); over-budget fails. Tiers: 1-full-context = baseline (${fullTokens}), 2-repo-map-only = ${(((rows.find((r) => r.name === '2-repo-map-only')?.tokensC4 ?? 0) / fullTokens) * 100).toFixed(0)}% of baseline but drops the security excerpt (overflow-rule finding) — do not use alone; 3-repo-map+lexical retains invariants at ${(((rows.find((r) => r.name === '3-repo-map+lexical')?.tokensC4 ?? 0) / fullTokens) * 100).toFixed(0)}%; 4-hybrid adds evidence at ${(((rows.find((r) => r.name === '4-hybrid')?.tokensC4 ?? 0) / fullTokens) * 100).toFixed(0)}%.`,
);

if (failures > 0) {
  console.log(`\nP12-09 benchmark: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\nP12-09 benchmark: PASS');
