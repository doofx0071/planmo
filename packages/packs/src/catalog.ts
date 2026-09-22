import { SemVerString } from '@planmo/schema';
import type { PackProvenance, TrustLevel } from '@planmo/schema';
import { parse as parseYaml } from 'yaml';
import type { CatalogEntry, CatalogFetcher, CatalogSource } from './phase11-contracts.js';
import { packIntegrity } from './loader.js';
import { compareSemVer } from './resolve.js';

/**
 * Catalog / source abstraction (P11-02).
 *
 * Declarative pack sources (local-dir / registry / git) resolved into
 * CatalogEntry list through an INJECTED fetcher — this module never touches
 * I/O itself. Determinism: identical sources + fetcher => byte-identical
 * entries, sorted by (sourceId, ref, version, raw).
 *
 * URL convention (documented contract for fetcher implementations):
 * - local-dir: `listRefs(url)` lists pack refs under the directory, each
 *   entry loaded from `<url>/<ref>/pack.yml`.
 * - registry:  `listRefs(url)` lists pack refs of the registry index, each
 *   entry loaded from `<url>/<ref>/pack.yml`.
 * - git:       `source.ref` (branch/tag/commit) is pinned into the base —
 *   `listRefs(<url>/<source.ref>)`; each entry loaded from
 *   `<url>/<source.ref>/<packRef>/pack.yml`. When no `ref` is declared, the
 *   git URL is used as-is (same listing semantics as registry).
 *
 * Integrity: sha256 of the raw pack.yml is computed for EVERY remote entry
 * and is never optional for registry/git. Local-dir entries may omit it.
 */

/** Resolve declared sources into entries (integrity verified per remote entry). */
export async function resolveCatalog(
  sources: readonly CatalogSource[],
  fetcher: CatalogFetcher,
): Promise<readonly CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  for (const source of sources) {
    const base = fetchBase(source);
    const refs = await fetcher.listRefs(base);
    for (const ref of refs) {
      if (ref.length === 0) {
        continue;
      }
      const packUrl = joinUrl(base, ref, 'pack.yml');
      const raw = await fetcher.fetchText(packUrl);
      const version = readPackVersion(raw, source.id, ref);
      if (source.kind === 'registry' || source.kind === 'git') {
        const integritySha256 = packIntegrity(raw);
        entries.push({
          sourceId: source.id,
          sourceKind: source.kind,
          ref,
          version,
          integritySha256,
          provenance: remoteProvenance(source.kind, packUrl, integritySha256, source.declaredTrust),
          raw,
        });
      } else {
        entries.push({
          sourceId: source.id,
          sourceKind: source.kind,
          ref,
          version,
          provenance: localProvenance(packUrl, source.declaredTrust),
          raw,
        });
      }
    }
  }
  return [...entries].sort(entryOrder);
}

/**
 * Deterministic selection: pinned version > highest valid version.
 * Returns null when the ref is unknown or the pinned version is absent.
 */
export function pickCatalogEntry(
  entries: readonly CatalogEntry[],
  ref: string,
  version?: string,
): CatalogEntry | null {
  const matches = entries.filter((e) => e.ref === ref);
  if (matches.length === 0) {
    return null;
  }
  if (version !== undefined) {
    const exact = matches.filter((e) => e.version === version);
    if (exact.length === 0) {
      return null;
    }
    return [...exact].sort(entryOrder)[0] ?? null;
  }
  const valid = matches.filter((e) => SemVerString.safeParse(e.version).success);
  if (valid.length === 0) {
    return null;
  }
  return (
    [...valid].sort((a, b) => {
      const byVersion = compareSemVer(b.version, a.version); // highest first
      return byVersion !== 0 ? byVersion : entryOrder(a, b);
    })[0] ?? null
  );
}

// ---------------------------------------------------------------- internals

function fetchBase(source: CatalogSource): string {
  const url = stripTrailingSlash(source.url);
  if (source.kind === 'git' && source.ref !== undefined && source.ref.length > 0) {
    return `${url}/${source.ref}`;
  }
  return url;
}

function stripTrailingSlash(url: string): string {
  return url.length > 1 && url.endsWith('/') ? url.slice(0, -1) : url;
}

function joinUrl(base: string, ...segments: string[]): string {
  return [base, ...segments].join('/');
}

function readPackVersion(raw: string, sourceId: string, ref: string): string {
  const parsed: unknown = parseYaml(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`catalog entry ${sourceId}/${ref}: pack.yml is not a YAML map`);
  }
  const version = (parsed as Record<string, unknown>)['version'];
  if (typeof version !== 'string' || !SemVerString.safeParse(version).success) {
    throw new Error(
      `catalog entry ${sourceId}/${ref}: missing or invalid version (expected SemVer string)`,
    );
  }
  return version;
}

function remoteProvenance(
  kind: 'registry' | 'git',
  url: string,
  digest: string,
  declaredTrust: TrustLevel,
): PackProvenance {
  return {
    source: kind,
    url,
    integrity: { algorithm: 'sha256', digest },
    trustLevel: declaredTrust,
  };
}

function localProvenance(url: string, declaredTrust: TrustLevel): PackProvenance {
  return {
    source: 'local',
    url,
    trustLevel: declaredTrust,
  };
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Total deterministic order over catalog entries. */
function entryOrder(a: CatalogEntry, b: CatalogEntry): number {
  return (
    compareStrings(a.sourceId, b.sourceId) ||
    compareStrings(a.ref, b.ref) ||
    compareStrings(a.version, b.version) ||
    compareStrings(a.raw, b.raw)
  );
}
