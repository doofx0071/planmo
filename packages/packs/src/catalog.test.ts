import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CatalogEntry, CatalogFetcher, CatalogSource } from './phase11-contracts.js';
import { packIntegrity } from './loader.js';
import { pickCatalogEntry, resolveCatalog } from './catalog.js';
import { makeTempDir, writePack } from './test-utils.js';

function packYaml(ref: string, version: string): string {
  return [
    'schemaVersion: 1',
    `ref: ${ref}`,
    `name: Pack ${ref}`,
    `version: ${version}`,
    'category: stack',
    `description: Catalog fixture for ${ref}.`,
    '',
  ].join('\n');
}

/** In-memory stub fetcher that records every call. */
function stubFetcher(
  refs: Record<string, readonly string[]>,
  files: Record<string, string>,
): { fetcher: CatalogFetcher; calls: { kind: 'list' | 'fetch'; url: string }[] } {
  const calls: { kind: 'list' | 'fetch'; url: string }[] = [];
  const fetcher: CatalogFetcher = {
    async listRefs(url) {
      calls.push({ kind: 'list', url });
      const result = refs[url];
      if (result === undefined) {
        throw new Error(`no index for ${url}`);
      }
      return result;
    },
    async fetchText(url) {
      calls.push({ kind: 'fetch', url });
      const body = files[url];
      if (body === undefined) {
        throw new Error(`no content for ${url}`);
      }
      return body;
    },
  };
  return { fetcher, calls };
}

/** Real-filesystem fetcher for local-dir tests (finds pack.yml files recursively). */
function dirFetcher(): CatalogFetcher {
  const findRefs = (dir: string, prefix: string[]): string[] => {
    const refs: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        refs.push(...findRefs(full, [...prefix, entry.name]));
      } else if (entry.isFile() && entry.name === 'pack.yml') {
        refs.push(prefix.join('/'));
      }
    }
    return refs;
  };
  return {
    async listRefs(url) {
      return findRefs(url, []).sort();
    },
    async fetchText(url) {
      return readFileSync(url, 'utf8');
    },
  };
}

describe('resolveCatalog (P11-02 catalog/source abstraction)', () => {
  it('resolves a local-dir source against the real filesystem, without integrity', async () => {
    const root = makeTempDir('planmo-catalog-');
    writePack(root, 'stack/nextjs', packYaml('stack/nextjs', '1.0.0'));
    writePack(root, 'design/minimal', packYaml('design/minimal', '0.4.2'));
    const sources: CatalogSource[] = [
      { id: 'local-packs', kind: 'local-dir', url: root, declaredTrust: 'local' },
    ];
    const entries = await resolveCatalog(sources, dirFetcher());

    expect(entries.map((e) => e.ref).sort()).toEqual(['design/minimal', 'stack/nextjs']);
    const nextjs = entries.find((e) => e.ref === 'stack/nextjs');
    expect(nextjs).toBeDefined();
    expect(nextjs?.sourceId).toBe('local-packs');
    expect(nextjs?.sourceKind).toBe('local-dir');
    expect(nextjs?.version).toBe('1.0.0');
    expect(nextjs?.integritySha256).toBeUndefined(); // local-dir may omit
    expect(nextjs?.provenance?.source).toBe('local');
    expect(nextjs?.raw).toContain('ref: stack/nextjs');
  });

  it('resolves a registry source, computing required sha256 integrity per entry', async () => {
    const url = 'https://registry.example/packs';
    const refs = { [url]: ['stack/nextjs', 'design/minimal'] };
    const files = {
      [`${url}/stack/nextjs/pack.yml`]: packYaml('stack/nextjs', '1.0.0'),
      [`${url}/design/minimal/pack.yml`]: packYaml('design/minimal', '0.4.2'),
    };
    const { fetcher, calls } = stubFetcher(refs, files);
    const sources: CatalogSource[] = [
      { id: 'community-registry-a', kind: 'registry', url, declaredTrust: 'third-party' },
    ];

    const entries = await resolveCatalog(sources, fetcher);

    expect(calls.filter((c) => c.kind === 'list').map((c) => c.url)).toEqual([url]);
    expect(
      calls
        .filter((c) => c.kind === 'fetch')
        .map((c) => c.url)
        .sort(),
    ).toEqual([`${url}/design/minimal/pack.yml`, `${url}/stack/nextjs/pack.yml`]);
    const nextjs = entries.find((e) => e.ref === 'stack/nextjs');
    expect(nextjs).toBeDefined();
    expect(nextjs?.integritySha256).toMatch(/^[0-9a-f]{64}$/);
    expect(nextjs?.integritySha256).toBe(packIntegrity(files[`${url}/stack/nextjs/pack.yml`]!));
    expect(nextjs?.provenance).toEqual({
      source: 'registry',
      url: `${url}/stack/nextjs/pack.yml`,
      integrity: { algorithm: 'sha256', digest: nextjs?.integritySha256 },
      trustLevel: 'third-party',
    });
  });

  it('pins the git ref into the base URL for git sources (same listing semantics as registry)', async () => {
    const base = 'https://raw.git.example/org/packrepo/v1.2.0';
    const url = 'https://raw.git.example/org/packrepo';
    const { fetcher, calls } = stubFetcher(
      { [base]: ['stack/nextjs'] },
      { [`${base}/stack/nextjs/pack.yml`]: packYaml('stack/nextjs', '1.1.0') },
    );
    const sources: CatalogSource[] = [
      { id: 'git-packs', kind: 'git', url, ref: 'v1.2.0', declaredTrust: 'third-party' },
    ];

    const entries = await resolveCatalog(sources, fetcher);

    expect(calls.map((c) => c.url)).toEqual([base, `${base}/stack/nextjs/pack.yml`]);
    expect(entries[0]?.sourceKind).toBe('git');
    expect(entries[0]?.version).toBe('1.1.0');
    expect(entries[0]?.provenance?.source).toBe('git');
    expect(entries[0]?.integritySha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses the git URL as-is when no ref is declared', async () => {
    const url = 'https://raw.git.example/org/packrepo';
    const { fetcher, calls } = stubFetcher(
      { [url]: ['stack/nextjs'] },
      { [`${url}/stack/nextjs/pack.yml`]: packYaml('stack/nextjs', '1.1.0') },
    );
    const entries = await resolveCatalog(
      [{ id: 'git-packs', kind: 'git', url, declaredTrust: 'third-party' }],
      fetcher,
    );
    expect(calls.map((c) => c.url)).toEqual([url, `${url}/stack/nextjs/pack.yml`]);
    expect(entries).toHaveLength(1);
  });

  it('ignores ref for registry sources (git-only field)', async () => {
    const url = 'https://registry.example/packs';
    const { fetcher, calls } = stubFetcher(
      { [url]: ['stack/nextjs'] },
      { [`${url}/stack/nextjs/pack.yml`]: packYaml('stack/nextjs', '1.0.0') },
    );
    await resolveCatalog(
      [{ id: 'reg', kind: 'registry', url, ref: 'not-a-git-ref', declaredTrust: 'third-party' }],
      fetcher,
    );
    expect(calls.map((c) => c.url)).toEqual([url, `${url}/stack/nextjs/pack.yml`]);
  });

  it('returns an empty catalog when sources list no refs', async () => {
    const url = 'https://registry.example/empty';
    const { fetcher } = stubFetcher({ [url]: [] }, {});
    const entries = await resolveCatalog(
      [{ id: 'empty-registry', kind: 'registry', url, declaredTrust: 'third-party' }],
      fetcher,
    );
    expect(entries).toEqual([]);
  });

  it('deterministically sorts entries by (sourceId, ref, version, raw)', async () => {
    const urlA = 'https://registry.example/a';
    const urlB = 'https://registry.example/b';
    const { fetcher } = stubFetcher(
      { [urlA]: ['stack/nextjs', 'design/minimal'], [urlB]: ['stack/nextjs'] },
      {
        [`${urlA}/stack/nextjs/pack.yml`]: packYaml('stack/nextjs', '1.0.0'),
        [`${urlA}/design/minimal/pack.yml`]: packYaml('design/minimal', '0.4.2'),
        [`${urlB}/stack/nextjs/pack.yml`]: packYaml('stack/nextjs', '2.0.0'),
      },
    );
    const sources: CatalogSource[] = [
      { id: 'a', kind: 'registry', url: urlA, declaredTrust: 'third-party' },
      { id: 'b', kind: 'registry', url: urlB, declaredTrust: 'third-party' },
    ];
    const entries = await resolveCatalog(sources, fetcher);
    expect(entries.map((e) => `${e.sourceId}/${e.ref}@${e.version}`)).toEqual([
      'a/design/minimal@0.4.2',
      'a/stack/nextjs@1.0.0',
      'b/stack/nextjs@2.0.0',
    ]);
    const again = await resolveCatalog(sources, fetcher);
    expect(again).toEqual(entries);
  });

  it('NEGATIVE: propagates fetcher failures', async () => {
    const url = 'https://registry.example/packs';
    const { fetcher } = stubFetcher({ [url]: ['stack/nextjs'] }, {}); // no file content
    await expect(
      resolveCatalog(
        [{ id: 'failing', kind: 'registry', url, declaredTrust: 'third-party' }],
        fetcher,
      ),
    ).rejects.toThrow(/no content for/);
  });

  it('NEGATIVE: rejects a registry entry whose pack.yml is malformed YAML', async () => {
    const url = 'https://registry.example/packs';
    const { fetcher } = stubFetcher(
      { [url]: ['stack/nextjs'] },
      { [`${url}/stack/nextjs/pack.yml`]: 'not: [valid' },
    );
    await expect(
      resolveCatalog([{ id: 'bad', kind: 'registry', url, declaredTrust: 'third-party' }], fetcher),
    ).rejects.toThrow();
  });

  it('NEGATIVE: rejects a registry entry whose pack.yml is not a YAML map', async () => {
    const url = 'https://registry.example/packs';
    const { fetcher } = stubFetcher(
      { [url]: ['stack/nextjs'] },
      { [`${url}/stack/nextjs/pack.yml`]: 'just a scalar string' },
    );
    await expect(
      resolveCatalog([{ id: 'bad', kind: 'registry', url, declaredTrust: 'third-party' }], fetcher),
    ).rejects.toThrow(/pack.yml is not a YAML map/);
  });

  it('NEGATIVE: rejects an entry with a missing or non-string version', async () => {
    const url = 'https://registry.example/packs';
    const missing = `${url}/stack/nextjs/pack.yml`;
    const { fetcher } = stubFetcher(
      { [url]: ['stack/nextjs', 'design/minimal'] },
      {
        [missing]: packYaml('stack/nextjs', '1.0.0').replace('version: 1.0.0', 'version: 1'),
        [`${url}/design/minimal/pack.yml`]: packYaml('design/minimal', '0.4.2'),
      },
    );
    await expect(
      resolveCatalog(
        [{ id: 'bad-version', kind: 'registry', url, declaredTrust: 'third-party' }],
        fetcher,
      ),
    ).rejects.toThrow(/missing or invalid version/);
  });
});

describe('pickCatalogEntry (deterministic selection)', () => {
  function entry(partial: Partial<CatalogEntry> & { ref: string; version: string }): CatalogEntry {
    return {
      sourceId: 's',
      sourceKind: 'registry',
      integritySha256: 'x'.repeat(64),
      raw: 'raw',
      ...partial,
    };
  }

  it('returns null for an unknown ref and for an empty catalog', () => {
    expect(pickCatalogEntry([], 'stack/nextjs')).toBeNull();
    expect(
      pickCatalogEntry([entry({ ref: 'design/minimal', version: '1.0.0' })], 'stack/nextjs'),
    ).toBeNull();
  });

  it('picks the exact version when pinned', () => {
    const entries = [
      entry({ sourceId: 'a', ref: 'stack/nextjs', version: '1.0.0' }),
      entry({ sourceId: 'b', ref: 'stack/nextjs', version: '2.0.0' }),
    ];
    expect(pickCatalogEntry(entries, 'stack/nextjs', '1.0.0')?.sourceId).toBe('a');
    expect(pickCatalogEntry(entries, 'stack/nextjs', '1.0.0')?.version).toBe('1.0.0');
  });

  it('NEGATIVE: returns null when the pinned version is absent', () => {
    const entries = [entry({ ref: 'stack/nextjs', version: '1.0.0' })];
    expect(pickCatalogEntry(entries, 'stack/nextjs', '9.9.9')).toBeNull();
  });

  it('picks the highest valid SemVer when no version is pinned', () => {
    const entries = [
      entry({ sourceId: 'a', ref: 'stack/nextjs', version: '1.0.0' }),
      entry({ sourceId: 'b', ref: 'stack/nextjs', version: '2.4.1' }),
      entry({ sourceId: 'c', ref: 'stack/nextjs', version: '2.4.1-rc.1' }), // prerelease sorts below release
    ];
    const picked = pickCatalogEntry(entries, 'stack/nextjs');
    expect(picked?.sourceId).toBe('b');
    expect(picked?.version).toBe('2.4.1');
  });

  it('NEGATIVE: skips invalid SemVer versions instead of picking them', () => {
    const entries = [
      entry({ sourceId: 'a', ref: 'stack/nextjs', version: 'not-a-version' }),
      entry({ sourceId: 'b', ref: 'stack/nextjs', version: '0.1.0' }),
    ];
    expect(pickCatalogEntry(entries, 'stack/nextjs')?.version).toBe('0.1.0');
  });

  it('returns null when only invalid SemVer versions exist', () => {
    const entries = [entry({ ref: 'stack/nextjs', version: 'nope' })];
    expect(pickCatalogEntry(entries, 'stack/nextjs')).toBeNull();
    expect(pickCatalogEntry(entries, 'stack/nextjs', 'nope')?.version).toBe('nope'); // exact string match wins
  });

  it('NEGATIVE: duplicate refs across sources resolve deterministically (tie-break on sourceId)', () => {
    const entries = [
      entry({ sourceId: 'b-source', ref: 'stack/nextjs', version: '1.0.0', raw: 'bbb' }),
      entry({ sourceId: 'a-source', ref: 'stack/nextjs', version: '1.0.0', raw: 'aaa' }),
    ];
    const picked = pickCatalogEntry(entries, 'stack/nextjs');
    expect(picked?.sourceId).toBe('a-source');
    const pinned = pickCatalogEntry(entries, 'stack/nextjs', '1.0.0');
    expect(pinned?.sourceId).toBe('a-source');
    // Stable across repeated calls.
    expect(pickCatalogEntry(entries, 'stack/nextjs')).toEqual(picked);
  });
});
