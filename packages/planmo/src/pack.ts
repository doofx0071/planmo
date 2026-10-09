import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ProjectNotFoundError, readStatus, writeManaged, type WorkspaceStatus } from '@planmo/core';
import { LockfileSchema, type LockfileDocument } from '@planmo/schema';
import {
  classifyTrust,
  formatTrust,
  loadPack,
  lockFromResolution,
  planLockDiff,
  resolveCatalog,
  resolvePacks,
  type CatalogEntry,
  type CatalogFetcher,
  type CatalogSource,
  type LoadedPack,
  type TrustInput,
} from '@planmo/packs';
import { WorkspaceNotFoundError } from './workspace-error.js';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/**
 * `planmo pack` — inspect the pack catalog and reconcile `.planmo/lock.yml`.
 *
 * Thin adapter over `@planmo/packs`, the same shape as `validate` over
 * `@planmo/trace` and `next` over `@planmo/workflow`: it discovers the catalog
 * through the injected-fetcher catalog engine, hands the resolved set to the
 * resolution engine, and lets the lockfile engine own the pinned document.
 * No catalog, resolution, or locking logic lives here.
 *
 * HONEST SCOPE — there is no remote registry and no bundled pack catalog in the
 * CLI. The ONLY catalog source this command can use is a local directory of
 * `pack.yml` files (`--source <dir>`, the engine's `local-dir` source kind),
 * read through a filesystem fetcher. Nothing is downloaded and no network call
 * is made. `generate` already resolves the project's refs against an EMPTY
 * catalog for the same reason; with no `--source`, this command says so loudly
 * instead of pretending a catalog exists.
 */

/** The PlanMo-owned lock document this command reads and writes. */
export const LOCK_PATH = '.planmo/lock.yml';

/** Emitted verbatim whenever no catalog source is configured. */
export const NO_SOURCE_NOTE =
  'No pack catalog source is configured. `planmo pack` resolves packs only from a ' +
  'local directory of pack.yml files (--source <dir>); it never fetches from a ' +
  'remote registry.';

export interface PackOptions {
  root: string;
  /** The CLI's own version, recorded in the lockfile it writes. */
  planmoVersion: string;
  /**
   * Local directory of packs to use as the catalog (`local-dir` source).
   * Omitted => no catalog, and requested refs cannot resolve.
   */
  source?: string;
  /** Compute + report the plan without writing `.planmo/lock.yml`. */
  dryRun?: boolean;
}

/** One pack the catalog can resolve, with its classified trust. */
export interface PackCatalogEntry {
  ref: string;
  version: string;
  sourceId: string;
  sourceKind: string;
  /** `formatTrust` summary, e.g. `local (no review): ...`. */
  trust: string;
  requiresReview: boolean;
}

/** One row of the lockfile diff, mirroring `InstallDiffRow`. */
export interface PackLockRow {
  ref: string;
  action: 'added' | 'removed' | 'updated' | 'unchanged';
}

/** Why a changed lockfile was NOT written (null when written or nothing changed). */
export type PackWriteSkip = 'dry-run' | 'no-source' | 'resolution-not-ok';

export interface PackOutcome {
  root: string;
  /** The catalog source actually used, or null when none is configured. */
  source: { kind: 'local-dir'; url: string } | null;
  /** True when NO catalog source is configured — the honest gap, stated loudly. */
  noSource: boolean;
  /** Every pack the catalog resolves, in deterministic order (empty with no source). */
  catalog: PackCatalogEntry[];
  /** Refs requested by `.planmo/project.yml`, in declared order. */
  requested: string[];
  /** Resolution of the requested refs against the catalog. */
  resolution: {
    ok: boolean;
    /** Resolved refs in dependency-first order. */
    order: string[];
    diagnostics: { code: string; refs: string[]; message: string }[];
  };
  /** What this resolution would do to `.planmo/lock.yml`. */
  lockDiff: { diff: string; changed: boolean; rows: PackLockRow[] };
  /** Relative paths written this run (empty when nothing was written). */
  written: string[];
  /** Why the lockfile was not written; null when written or when it is up to date. */
  skipped: PackWriteSkip | null;
  /** The report as terminal text, ready to print. */
  text: string;
}

/** Read a file, or return undefined when it is absent (a valid state). */
async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * List pack refs under a directory: every directory that directly contains a
 * `pack.yml`, named by its path relative to the source root (e.g. `stack/nextjs`).
 * This is the `local-dir` listing convention the catalog engine documents.
 */
async function listPackRefs(dir: string, prefix = ''): Promise<string[]> {
  const refs: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const child = prefix.length > 0 ? `${prefix}/${entry.name}` : entry.name;
      refs.push(...(await listPackRefs(join(dir, entry.name), child)));
    } else if (entry.isFile() && entry.name === 'pack.yml') {
      refs.push(prefix);
    }
  }
  return refs;
}

/** Filesystem `CatalogFetcher` for a `local-dir` source. No network. */
function fsFetcher(): CatalogFetcher {
  return {
    async listRefs(url: string): Promise<readonly string[]> {
      return (await listPackRefs(url)).sort();
    },
    async fetchText(url: string): Promise<string> {
      return readFile(url, 'utf8');
    },
  };
}

/** Map a catalog source kind to the trust classifier's input vocabulary. */
function trustInputFor(entry: CatalogEntry): TrustInput {
  const source: TrustInput['source'] =
    entry.sourceKind === 'local-dir' ? 'local' : entry.sourceKind;
  return {
    source,
    ...(entry.provenance !== undefined ? { provenance: entry.provenance } : {}),
  };
}

/**
 * Discover + validate the catalog of a local-dir source.
 * Discovery and trust come from the catalog engine (`resolveCatalog`); pack
 * content validation stays with the loader (`loadPack`), so executable
 * constructs are rejected exactly as elsewhere in the system.
 */
async function loadCatalog(
  source: string,
): Promise<{ entries: CatalogEntry[]; packs: LoadedPack[] }> {
  const src: CatalogSource = {
    id: 'local',
    kind: 'local-dir',
    url: source,
    declaredTrust: 'local',
  };
  let entries: readonly CatalogEntry[];
  try {
    entries = await resolveCatalog([src], fsFetcher());
  } catch (err) {
    throw new Error(
      `pack source "${source}" is not a readable directory of packs: ${(err as Error).message}`,
    );
  }
  const packs = entries.map((entry) => loadPack(join(source, entry.ref)));
  return { entries: [...entries], packs };
}

/** Read and validate an existing lockfile, or null when there is none. */
async function readLock(root: string): Promise<LockfileDocument | null> {
  const raw = await readIfPresent(join(root, LOCK_PATH));
  if (raw === undefined) return null;
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`${LOCK_PATH} is not valid YAML: ${(err as Error).message}`);
  }
  const result = LockfileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.path.join('.') || '(root)').join(', ');
    throw new Error(`${LOCK_PATH} failed schema validation (${issues})`);
  }
  return result.data;
}

export async function packReport(opts: PackOptions): Promise<PackOutcome> {
  // A missing workspace is one error everywhere in the CLI, whether the
  // `.planmo/` marker is absent or project.yml is unreadable/invalid.
  let status: WorkspaceStatus;
  try {
    status = await readStatus({ root: opts.root });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      throw new WorkspaceNotFoundError(opts.root);
    }
    throw err;
  }
  if (status.project === null) {
    throw new WorkspaceNotFoundError(opts.root);
  }

  const requested = [...(status.project.packs ?? [])];

  // Catalog: the engine's local-dir source, or nothing at all. Never a guess.
  const catalog: PackCatalogEntry[] = [];
  let packs: LoadedPack[] = [];
  if (opts.source !== undefined) {
    const loaded = await loadCatalog(opts.source);
    packs = loaded.packs;
    for (const entry of loaded.entries) {
      const classification = classifyTrust(trustInputFor(entry));
      catalog.push({
        ref: entry.ref,
        version: entry.version,
        sourceId: entry.sourceId,
        sourceKind: entry.sourceKind,
        trust: formatTrust(classification),
        requiresReview: classification.requiresReview,
      });
    }
  }

  // Resolution + the lock this resolution implies. With no catalog, requested
  // refs surface as `unknown-ref` diagnostics — never silent success.
  const resolution = resolvePacks(packs, requested);
  const nextLock = lockFromResolution(resolution, opts.planmoVersion);
  const currentLock = await readLock(status.root);

  const plan = planLockDiff(currentLock, nextLock);
  const changed = plan.diff.length > 0;
  const rows: PackLockRow[] = plan.rows.map((row) => ({ ref: row.ref, action: row.action }));

  // Write policy: only a lock derived from a configured catalog with a clean
  // resolution is trustworthy. Anything else is reported, never written.
  const written: string[] = [];
  let skipped: PackWriteSkip | null = null;
  if (changed) {
    if (opts.source === undefined) {
      skipped = 'no-source';
    } else if (!resolution.ok) {
      skipped = 'resolution-not-ok';
    } else if (opts.dryRun) {
      skipped = 'dry-run';
    } else {
      const result = await writeManaged(
        status.root,
        [{ path: LOCK_PATH, content: stringifyYaml(nextLock) }],
        { allowOverwrite: true },
      );
      written.push(...result.written);
    }
  }

  const outcome: PackOutcome = {
    root: status.root,
    source: opts.source !== undefined ? { kind: 'local-dir', url: opts.source } : null,
    noSource: opts.source === undefined,
    catalog,
    requested,
    resolution: {
      ok: resolution.ok,
      order: [...resolution.order],
      diagnostics: resolution.diagnostics.map((d) => ({
        code: d.code,
        refs: [...d.refs],
        message: d.message,
      })),
    },
    lockDiff: { diff: plan.diff, changed, rows },
    written,
    skipped,
    text: '',
  };
  outcome.text = renderPackReport(outcome);
  return outcome;
}

/** Render a pack report as plain text. No colour, no width assumptions. */
export function renderPackReport(outcome: PackOutcome): string {
  const lines: string[] = ['Pack catalog'];

  if (outcome.source === null) {
    lines.push(`  ${NO_SOURCE_NOTE}`);
  } else {
    lines.push(`  source  ${outcome.source.url}  (${outcome.source.kind})`);
    if (outcome.catalog.length === 0) {
      lines.push('  (no packs found)');
    }
    for (const entry of outcome.catalog) {
      lines.push(`  ${entry.ref}  ${entry.version}  ${entry.trust}`);
    }
  }

  lines.push(
    '',
    outcome.requested.length > 0
      ? `Requested by .planmo/project.yml: ${outcome.requested.join(', ')}`
      : 'Requested by .planmo/project.yml: (none)',
    '',
    'Resolution',
  );

  if (outcome.resolution.ok) {
    const count = outcome.resolution.order.length;
    const order = outcome.resolution.order.join(', ');
    lines.push(`  OK — ${count} pack(s)${count > 0 ? `, dependency order: ${order}` : ''}`);
  } else {
    lines.push('  FAILED');
    for (const d of outcome.resolution.diagnostics) {
      lines.push(`    ${d.code}: ${d.message}`);
    }
  }

  lines.push('', `Lockfile ${LOCK_PATH}`);
  if (!outcome.lockDiff.changed) {
    lines.push('  up to date');
  } else {
    for (const line of outcome.lockDiff.diff.split('\n')) lines.push(`  ${line}`);
    if (outcome.skipped === 'dry-run') lines.push('  (dry run — not written)');
    else if (outcome.skipped === 'no-source')
      lines.push('  (not written: no catalog source configured)');
    else if (outcome.skipped === 'resolution-not-ok')
      lines.push('  (not written: resolution has diagnostics)');
  }
  for (const path of outcome.written) lines.push(`  wrote ${path}`);

  return lines.join('\n');
}
