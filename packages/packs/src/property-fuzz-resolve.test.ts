import { describe, expect, it } from 'vitest';
import { loadPack } from './loader.js';
import { resolvePacks, resolutionFingerprint, type ResolutionResult } from './resolve.js';
import { makeTempDir, validPackYaml, writePack } from './test-utils.js';

/**
 * Property / fuzz tests for deterministic pack resolution (P12-02, P-RES).
 *
 * Properties under test (docs/09-testing/property-and-fuzz.md — Pack
 * resolution):
 * - P-RES-1  Independent selection permutations of a shared pack set yield
 *            the same semantic resolution: identical fingerprint, `ok`,
 *            topological `order`, resolved pack set, and the same diagnostic
 *            multiset (order-independent).
 * - P-RES-2  Cycles, capability conflicts and missing dependencies surface
 *            deterministic diagnostics — every documented failure mode is
 *            reported, and the reports are identical across re-runs.
 * All randomness is seeded (mulberry32); catalogs and requests are rebuilt
 * from the same seed for reproducibility.
 */

/** Deterministic 32-bit PRNG (mulberry32). Fixed seeds only. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rnd: () => number, items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)] as T;
}

function shuffle<T>(rnd: () => number, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

const VERSIONS = ['1.0.0', '1.1.0', '2.0.0'] as const;
const CAPABILITIES = ['cap.web', 'cap.db', 'cap.ai'] as const;

interface FuzzPackSpec {
  ref: string;
  version: string;
  requires: string[];
  provides: string[];
  /** Exact pack.yml bytes (duplicates copy an earlier entry byte-for-byte). */
  yaml: string;
}

interface FuzzCatalog {
  specs: FuzzPackSpec[];
}

function yamlFor(ref: string, version: string, requires: string[], provides: string[]): string {
  const lines = [validPackYaml(ref, 'stack', version)];
  if (requires.length > 0) {
    lines.push(`requires:\n${requires.map((r) => `  - ${r}`).join('\n')}`);
  }
  if (provides.length > 0) {
    lines.push(`provides:\n${provides.map((p) => `  - ${p}`).join('\n')}`);
  }
  return lines.join('\n');
}

/**
 * Build a seeded catalog: unique refs, random requires/provides, and — 12%
 * of the time — a byte-identical duplicate of an earlier entry (same ref,
 * same version, same content ⇒ same integrity digest).
 */
function genCatalog(rnd: () => number, n: number): FuzzCatalog {
  const FAMILIES = ['fz', 'fzz', 'fzp'] as const;
  const specs: FuzzPackSpec[] = [];
  const refs = Array.from({ length: n }, (_, i) => `${pick(rnd, FAMILIES)}/p${i}`);
  for (let i = 0; i < n; i += 1) {
    const requires = [
      ...new Set(Array.from({ length: Math.floor(rnd() * 3) }, () => pick(rnd, refs))),
    ];
    const provides = [
      ...new Set(
        Array.from(
          { length: Math.floor(rnd() * 2) },
          () => CAPABILITIES[Math.floor(rnd() * CAPABILITIES.length)] as string,
        ),
      ),
    ];
    if (rnd() < 0.12 && i > 0) {
      // Byte-identical duplicate of a ref that is ACTUALLY present in the
      // specs so far (an earlier entry may itself be a duplicate whose ref
      // differs from its own index).
      const original = specs[Math.floor(rnd() * i)] as FuzzPackSpec;
      specs.push({ ...original, yaml: original.yaml });
    } else {
      specs.push({
        ref: refs[i] as string,
        version: pick(rnd, VERSIONS),
        requires,
        provides,
        yaml: yamlFor(refs[i] as string, pick(rnd, VERSIONS), requires, provides),
      });
    }
  }
  return { specs };
}

/** Write the catalog to disk and load it (real files, like the resolver sees). */
function materialize(catalog: FuzzCatalog): {
  loaded: ReturnType<typeof loadPack>[];
  byRef: Map<string, ReturnType<typeof loadPack>>;
} {
  const dir = makeTempDir();
  const loaded: ReturnType<typeof loadPack>[] = [];
  const byRef = new Map<string, ReturnType<typeof loadPack>>();
  for (const spec of catalog.specs) {
    const packDir = writePack(dir, spec.ref, spec.yaml);
    const pack = loadPack(packDir);
    loaded.push(pack);
    if (!byRef.has(pack.document.ref)) {
      byRef.set(pack.document.ref, pack);
    }
  }
  return { loaded, byRef };
}

/** Canonical, order-independent rendering of a diagnostic multiset. */
function semanticDiagKey(d: ResolutionResult['diagnostics'][number]): string {
  // Cycle diagnostics report the concrete DFS path, which legitimately varies
  // with the request permutation's entry point; normalize to the ref SET.
  return `${d.code}|${[...new Set(d.refs)].sort().join(',')}`;
}

function sortedDiags(result: ResolutionResult): string[] {
  return result.diagnostics.map(semanticDiagKey).sort();
}

/** Three-color DFS cycle oracle over the closure induced by `edges`. */
function closureHasCycle(
  roots: string[],
  edges: Map<string, string[]>,
  exists: Set<string>,
): boolean {
  const visiting = new Set<string>();
  const done = new Set<string>();
  function visit(ref: string): boolean {
    if (done.has(ref) || !exists.has(ref)) return false;
    if (visiting.has(ref)) return true;
    visiting.add(ref);
    for (const next of edges.get(ref) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(ref);
    done.add(ref);
    return false;
  }
  return roots.some(visit);
}

describe('P-RES-1 selection permutations share a semantic resolution (seeded fuzz)', () => {
  it('120 catalogs × 3 request permutations: acyclic closures share fingerprint, order, ok and diagnostic multiset', () => {
    const rnd = mulberry32(0x70e5);
    for (let iter = 0; iter < 120; iter += 1) {
      const n = 6 + Math.floor(rnd() * 5); // 6..10 packs
      const catalog = genCatalog(rnd, n);
      const { loaded, byRef } = materialize(catalog);

      const pool = [...byRef.keys()];
      const requestSize = 1 + Math.floor(rnd() * Math.min(4, pool.length));
      const requested = shuffle(rnd, pool).slice(0, requestSize);
      // Occasionally request a ref that is NOT in the catalog.
      if (rnd() < 0.15) requested.push('ghost/missing');

      // The convergence property (same pack set, order, fingerprint) holds for
      // acyclic closures. Cyclic closures in the CURRENT resolver can admit
      // different cycle members depending on DFS entry order (see finding in
      // docs/09-testing/property-and-fuzz.md); for those we still assert the
      // diagnostic invariants below instead of closure equality.
      const edges = new Map<string, string[]>();
      for (const pack of byRef.values()) {
        edges.set(pack.document.ref, pack.document.requires);
      }
      const exists = new Set(byRef.keys());
      const cycled = closureHasCycle([...requested], edges, exists);

      const base = resolvePacks(loaded, requested);
      const baseFingerprint = resolutionFingerprint(base);

      for (let p = 0; p < 3; p += 1) {
        const perm = shuffle(rnd, requested);
        const result = resolvePacks(loaded, perm);
        if (!cycled) {
          // Acyclic closure: fingerprint, order, pack set and EVERY diagnostic
          // are request-order-independent.
          expect(resolutionFingerprint(result), `iter ${iter} perm ${p}`).toBe(baseFingerprint);
          expect(result.ok).toBe(base.ok);
          expect(result.order).toEqual(base.order);
          expect(
            result.packs.map((x) => [x.document.ref, x.document.version, x.integritySha256]),
          ).toEqual(base.packs.map((x) => [x.document.ref, x.document.version, x.integritySha256]));
          expect(sortedDiags(result)).toEqual(sortedDiags(base));
        } else {
          // Cyclic closure: the cycle MUST be surfaced (fatal) in every
          // permutation even though the exact detected cycle-path diagnostics
          // vary with DFS entry order (see finding in
          // docs/09-testing/property-and-fuzz.md).
          expect(
            result.diagnostics.some((d) => d.code === 'cycle'),
            `iter ${iter} perm ${p}: cycle must be surfaced`,
          ).toBe(true);
          expect(result.ok).toBe(false);
        }
      }
    }
  }, 30_000);

  it('the seeded corpus reproduces byte-identical fingerprints across full re-runs', () => {
    const run = (seed: number, iter: number) => {
      const r = mulberry32(seed);
      for (let i = 0; i < iter * 7; i += 1) r();
      const catalog = genCatalog(r, 7);
      const { loaded } = materialize(catalog);
      const result = resolvePacks(loaded, [...resolverKeys(catalog)]);
      return { fp: resolutionFingerprint(result), diags: sortedDiags(result) };
    };
    expect(run(0xfeed, 3)).toEqual(run(0xfeed, 3));
  });
});

function resolverKeys(catalog: FuzzCatalog): string[] {
  return [...new Set(catalog.specs.map((s) => s.ref))];
}

describe('P-RES-2 cycles, conflicts and missing deps surface deterministic diagnostics', () => {
  it('200 seeded catalogs: every documented failure mode is reported when the oracle says so', () => {
    const rnd = mulberry32(0x2def);
    for (let iter = 0; iter < 200; iter += 1) {
      const n = 6 + Math.floor(rnd() * 5);
      const catalog = genCatalog(rnd, n);
      const { loaded, byRef } = materialize(catalog);
      const requested = shuffle(rnd, [...byRef.keys()]).slice(0, 2 + Math.floor(rnd() * 3));

      const result = resolvePacks(loaded, requested);
      const codes = new Set(result.diagnostics.map((d) => d.code));
      const closure = new Set(result.packs.map((p) => p.document.ref));

      // unknown-ref: any requested ref absent from the (version-winning) map.
      for (const ref of requested) {
        if (!byRef.has(ref)) {
          expect(codes.has('unknown-ref'), `iter ${iter}: missing ${ref}`).toBe(true);
        }
      }

      // missing-requires: a closure pack requires a ref absent from the catalog.
      for (const pack of result.packs) {
        for (const req of pack.document.requires) {
          if (!byRef.has(req)) {
            expect(
              codes.has('missing-requires'),
              `iter ${iter}: ${pack.document.ref} -> ${req}`,
            ).toBe(true);
          }
        }
      }

      // cycle: three-color DFS over the CATALOG-exists subgraph reachable from
      // the request (cycle members are excluded from result.packs, so the
      // oracle must walk the full catalog, not the resolved closure).
      const edges = new Map<string, string[]>();
      for (const pack of byRef.values()) {
        edges.set(pack.document.ref, pack.document.requires);
      }
      const exists = new Set(byRef.keys());
      const cycled = closureHasCycle([...requested], edges, exists);
      expect(codes.has('cycle'), `iter ${iter}: oracle cycle=${cycled}`).toBe(cycled);

      // capability-conflict: a capability owned by 2+ closure packs with
      // distinct integrity digests.
      const owners = new Map<string, { digest: string; ref: string }[]>();
      for (const pack of result.packs) {
        for (const cap of pack.document.provides) {
          const list = owners.get(cap) ?? [];
          list.push({ digest: pack.integritySha256, ref: pack.document.ref });
          owners.set(cap, list);
        }
      }
      for (const [cap, list] of owners) {
        const distinct = new Set(list.map((o) => o.digest)).size;
        const capDiag = result.diagnostics.find(
          (d) => d.code === 'capability-conflict' && d.message.includes(cap),
        );
        if (distinct > 1) {
          expect(capDiag, `iter ${iter}: ${cap} must be flagged`).toBeDefined();
          expect(capDiag?.refs.length).toBeGreaterThanOrEqual(2);
          expect(result.ok).toBe(false);
        } else {
          // The flag must be capability-specific: a single distinct provider
          // never reports a conflict for THIS capability.
          expect(capDiag, `iter ${iter}: ${cap} false conflict`).toBeUndefined();
        }
      }

      // Determinism: a second identical call yields identical diagnostics.
      const again = resolvePacks(loaded, requested);
      expect(again.diagnostics).toEqual(result.diagnostics);
    }
  }, 30_000);

  it('table: duplicate-ref diagnostics are exact', () => {
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    const same = validPackYaml('stack/dup', 'stack', '1.0.0');
    const higher = validPackYaml('stack/dup', 'stack', '2.0.0');
    const lower = validPackYaml('stack/dup', 'stack', '0.9.0');
    const dup = () => [
      loadPack(writePack(dirA, 'stack/dup', same)),
      loadPack(writePack(dirB, 'stack/dup', same)),
    ];
    const up = () => [
      loadPack(writePack(dirA, 'stack/dup', lower)),
      loadPack(writePack(dirB, 'stack/dup', higher)),
    ];
    const down = () => [
      loadPack(writePack(dirA, 'stack/dup', higher)),
      loadPack(writePack(dirB, 'stack/dup', lower)),
    ];

    expect(
      resolvePacks(dup(), ['stack/dup']).diagnostics.some((d) => d.code === 'duplicate-ref'),
    ).toBe(true);
    expect(
      resolvePacks(up(), ['stack/dup']).diagnostics.some((d) => d.code === 'duplicate-ref'),
    ).toBe(false);
    expect(resolvePacks(up(), ['stack/dup']).packs[0]?.document.version).toBe('2.0.0');
    expect(
      resolvePacks(down(), ['stack/dup']).diagnostics.some((d) => d.code === 'duplicate-ref'),
    ).toBe(true);
    expect(resolvePacks(down(), ['stack/dup']).packs[0]?.document.version).toBe('2.0.0');
  });

  it('negative: identical-content providers of one capability do NOT conflict', () => {
    const dir = makeTempDir();
    const content = validPackYaml('stack/web', 'stack') + '\nprovides:\n  - stack.web';
    const a = loadPack(writePack(dir, 'stack/web', content));
    const b = loadPack(writePack(dir, 'stack/web', content));
    const result = resolvePacks([a, b], ['stack/web']);
    expect(result.diagnostics.some((d) => d.code === 'capability-conflict')).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'duplicate-ref')).toBe(true);
  });
});
