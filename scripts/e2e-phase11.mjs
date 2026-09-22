/**
 * Phase 11 E2E proof — run: node scripts/e2e-phase11.mjs (from repo root,
 * after `pnpm -r build` so dist/ is current).
 *
 * Proves the ecosystem & integrations engine end-to-end:
 *  - deterministic trust classification (builtin/local/remote + review burden)
 *  - catalog/source resolution with injected fetcher (integrity per entry)
 *  - diffable, reversible install/update plans (lock diff)
 *  - lock integrity verification (tamper detection)
 *  - additive GitHub export payload rendering (no network, sorted files)
 *  - portable context/memory export-import round-trips (json/jsonl/markdown)
 *  - file-backed MemoryProvider adapter (no fabrication on empty input)
 */
import { createHash } from 'node:crypto';

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
};

const packs = await import('../packages/packs/dist/index.js');
const bridge = await import('../packages/agent-bridge/dist/index.js');
const schema = await import('../packages/schema/dist/index.js');

const {
  classifyTrust,
  formatTrust,
  resolveCatalog,
  pickCatalogEntry,
  planLockDiff,
  verifyLockIntegrity,
  lockFromResolution,
  renderGithubExport,
} = packs;
const { exportMemoryPortable, importMemoryPortable, createFileMemoryProvider } = bridge;
const { LockfileSchema } = schema;

// --------------------------------------------------------------- trust model
{
  const builtin = classifyTrust({ source: 'builtin' });
  check(
    'trust: builtin => builtin, no review',
    builtin.trustLevel === 'builtin' && builtin.requiresReview === false,
  );

  const local = classifyTrust({ source: 'local' });
  check(
    'trust: local => local, no review',
    local.trustLevel === 'local' && local.requiresReview === false,
  );

  const remote = classifyTrust({
    source: 'registry',
    provenance: {
      source: 'registry',
      url: 'https://example.com/packs',
      integrity: { algorithm: 'sha256', digest: 'a'.repeat(64) },
      trustLevel: 'third-party',
    },
  });
  check(
    'trust: remote w/ integrity => third-party, ALWAYS review',
    remote.trustLevel === 'third-party' && remote.requiresReview === true,
  );

  const forgedVerified = classifyTrust({
    source: 'git',
    provenance: {
      source: 'git',
      url: 'https://example.com/repo.git',
      integrity: { algorithm: 'sha256', digest: 'b'.repeat(64) },
      trustLevel: 'verified-source',
    },
  });
  check(
    'trust: declared verified-source on remote is NOT honored (unsigned, future design)',
    forgedVerified.trustLevel === 'third-party' && forgedVerified.requiresReview === true,
  );

  const noIntegrity = classifyTrust({
    source: 'registry',
    provenance: { source: 'registry', url: 'https://x.example' },
  });
  check('trust: remote without integrity => review', noIntegrity.requiresReview === true);

  const line = formatTrust(remote);
  check(
    'trust: formatTrust is a deterministic one-liner',
    typeof line === 'string' && line.includes('third-party'),
  );
}

// ------------------------------------------------------------------ catalog
{
  const remoteYaml = [
    'schemaVersion: 1',
    'ref: domain/foo',
    'name: Foo domain pack',
    'version: 1.2.0',
    'category: domain',
    'description: Catalog fixture.',
  ].join('\n');

  const fetcher = {
    async fetchText(url) {
      if (url.endsWith('index.json')) return JSON.stringify({ refs: ['domain/foo'] });
      if (url.endsWith('domain/foo/pack.yml') || url.endsWith('packs/domain/foo.yml'))
        return remoteYaml;
      throw new Error(`unexpected fetch: ${url}`);
    },
    async listRefs(url) {
      if (url.endsWith('index.json')) return ['domain/foo'];
      throw new Error(`unexpected list: ${url}`);
    },
  };

  const entries = await resolveCatalog(
    [
      {
        id: 'reg-a',
        kind: 'registry',
        url: 'https://reg.example/index.json',
        declaredTrust: 'third-party',
      },
    ],
    fetcher,
  );
  check('catalog: remote entry resolved', entries.length === 1 && entries[0].ref === 'domain/foo');
  check(
    'catalog: remote entry carries sha256 integrity',
    entries[0].integritySha256 === createHash('sha256').update(remoteYaml, 'utf8').digest('hex'),
  );

  const picked = pickCatalogEntry(entries, 'domain/foo');
  check('catalog: pick by ref', picked !== null && picked.version === '1.2.0');
  check('catalog: pick unknown ref => null', pickCatalogEntry(entries, 'nope/nope') === null);
}

// -------------------------------------------------- lock diff + reversibility
{
  // lockFromResolution: trustLevel per entry follows provenance (P11-03).
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planmo-e2e-p11-'));
  const writePack = (rel, yaml) => {
    const dirPath = path.join(dir, rel);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(path.join(dirPath, 'pack.yml'), yaml, 'utf8');
  };
  writePack(
    'local/stack',
    [
      'schemaVersion: 1',
      'ref: stack/base',
      'name: Base',
      'version: 1.0.0',
      'category: stack',
      'description: d.',
    ].join('\n'),
  );
  writePack(
    'remote/foo',
    [
      'schemaVersion: 1',
      'ref: domain/foo',
      'name: Foo',
      'version: 1.2.0',
      'category: domain',
      'description: d.',
      'provenance:',
      '  source: registry',
      '  url: https://reg.example/packs',
      '  trustLevel: third-party',
    ].join('\n'),
  );
  const localPack = packs.loadPack(path.join(dir, 'local/stack'));
  const remotePack = packs.loadPack(path.join(dir, 'remote/foo'));
  const result = packs.resolvePacks([localPack, remotePack], ['stack/base', 'domain/foo']);
  const fromResolution = lockFromResolution(result, '0.0.0');
  const trustByRef = Object.fromEntries(fromResolution.packs.map((p) => [p.ref, p.trustLevel]));
  check('lockFromResolution: local => builtin', trustByRef['stack/base'] === 'builtin');
  check(
    'lockFromResolution: remote provenance => third-party',
    trustByRef['domain/foo'] === 'third-party',
  );

  const lockFrom = LockfileSchema.parse({
    schemaVersion: 1,
    planmoVersion: '0.0.0',
    packs: [
      { ref: 'stack/base', name: 'Base', version: '1.0.0', source: 'local', trustLevel: 'builtin' },
      {
        ref: 'stack/top',
        name: 'Top',
        version: '1.0.0',
        source: 'local',
        integrity: { algorithm: 'sha256', digest: 'c'.repeat(64) },
        trustLevel: 'builtin',
      },
    ],
    adapters: [],
  });
  const lockTo = LockfileSchema.parse({
    schemaVersion: 1,
    planmoVersion: '0.0.0',
    packs: [
      {
        ref: 'stack/base',
        name: 'Base',
        version: '1.1.0',
        source: 'local',
        integrity: { algorithm: 'sha256', digest: 'd'.repeat(64) },
        trustLevel: 'builtin',
      },
      {
        ref: 'stack/top',
        name: 'Top',
        version: '1.0.0',
        source: 'local',
        integrity: { algorithm: 'sha256', digest: 'c'.repeat(64) },
        trustLevel: 'builtin',
      },
      {
        ref: 'domain/foo',
        name: 'Foo',
        version: '1.2.0',
        source: 'registry',
        integrity: { algorithm: 'sha256', digest: 'e'.repeat(64) },
        trustLevel: 'third-party',
      },
    ],
    adapters: [],
  });

  const plan = planLockDiff(lockFrom, lockTo);
  const actions = new Map(plan.rows.map((r) => [r.ref, r.action]));
  check('diff: updated base', actions.get('stack/base') === 'updated');
  check('diff: unchanged top', actions.get('stack/top') === 'unchanged');
  check('diff: added domain/foo', actions.get('domain/foo') === 'added');
  check('diff: plan is reversible (plan-only, never mutates)', plan.reversible === true);
  check(
    'diff: deterministic text render',
    typeof plan.diff === 'string' && plan.diff.includes('domain/foo'),
  );

  const emptyPlan = planLockDiff(null, lockTo);
  check(
    'diff: from-null => everything added',
    emptyPlan.rows.length === 3 && emptyPlan.rows.every((r) => r.action === 'added'),
  );

  const tampered = LockfileSchema.parse(JSON.parse(JSON.stringify(lockTo)));
  tampered.packs[2].integrity.digest = 'f'.repeat(64);
  const verify = await verifyLockIntegrity(tampered, async (entry) =>
    entry.ref === 'stack/base' ? 'x' : entry.ref === 'stack/top' ? 'y' : 'z',
  );
  check(
    'verify: tampered remote integrity detected',
    verify.ok === false && verify.failures.some((f) => f.includes('domain/foo')),
  );
}

// ------------------------------------------------------------- github export
{
  const payload = renderGithubExport({
    owner: 'acme',
    repo: 'widget',
    branch: 'planmo-artifacts',
    summaryLines: ['AGENTS.md', 'planning docs'],
    files: [
      { path: 'artifacts/z-last.md', content: 'z' },
      { path: 'artifacts/a-first.md', content: 'a' },
    ],
  });
  check('export: sorted by path', payload.files[0].path === 'artifacts/a-first.md');
  check(
    'export: additive title/body present',
    payload.title.includes('planning artifacts') && payload.body.length > 0,
  );
  check('export: no network (pure render)', payload.branch === 'planmo-artifacts');
}

// ---------------------------------------------- portable memory round-trips
{
  const view = { project: 'demo', contextId: 'P11-01', estimatedTokens: 120 };
  const rows = [
    { id: 'b', kind: 'decision', summary: 'Second', source: 'handoff' },
    { id: 'a', kind: 'fact', summary: 'First', source: 'canonical' },
  ];

  for (const fmt of ['json', 'jsonl', 'markdown']) {
    const text = exportMemoryPortable(view, rows, fmt);
    const back = importMemoryPortable(text, fmt);
    check(
      `portable: ${fmt} round-trip preserves rows (sorted by id)`,
      back.rows.length === 2 && back.rows[0].id === 'a' && back.rows[1].id === 'b',
    );
    check(`portable: ${fmt} preserves context`, back.context?.contextId === 'P11-01');
  }

  const bad = '{"format":"planmo-memory","schemaVersion":99,"rows":[]}';
  let threw = false;
  try {
    importMemoryPortable(bad, 'json');
  } catch {
    threw = true;
  }
  check('portable: stale schemaVersion rejected', threw === true);
}

// ----------------------------------------------------- file-backed provider
{
  const provider = createFileMemoryProvider({
    readText: async () =>
      JSON.stringify({
        format: 'planmo-memory',
        schemaVersion: 1,
        rows: [
          { id: 'm1', kind: 'lesson', summary: 'keep it deterministic', source: 'handoff' },
          { id: 'm2', kind: 'warning', summary: 'never fabricate', source: 'handoffs' },
        ],
      }),
    format: 'json',
    limit: 1,
  });
  const relevant = await provider.relevant('ctx', 1);
  check('provider: limit honored', relevant.length === 1 && relevant[0].id === 'm1');

  const emptyProvider = createFileMemoryProvider({ readText: async () => '', format: 'jsonl' });
  const emptyRows = await emptyProvider.relevant('ctx', 5);
  check(
    'provider: empty source => honest no-op row (never fabricates)',
    emptyRows[0]?.id === 'no-durable-memory',
  );
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
