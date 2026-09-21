/**
 * P10-01 — safe repository scanner (Worker A).
 *
 * Walks an untrusted repository through an injected {@link FileReader} and
 * produces a deterministic {@link ScanReport}. The scanner NEVER reads file
 * contents (detection/injection engines do that separately via the same
 * reader); it only lists directories and stats entries.
 *
 * Determinism guarantees:
 * - traversal is depth-first, parents before children, siblings sorted by
 *   name ascending (lexicographic code-point order — locale-independent);
 * - every warning carries a frozen SCN code; warnings are published sorted by
 *   (path asc, then code asc);
 * - no Date.now(), no randomness, no filesystem access outside `reader`.
 *
 * Caps (defaults per contracts.ts) are hard stops:
 * - maxDepth (default 32): entries deeper than the cap are never scanned;
 *   each pruned directory emits one SCN-001 warning and `truncatedBy` is
 *   set to 'depth' when any pruning happened;
 * - maxEntries (default 100_000): the scan hard-stops once the cap is
 *   reached, emitting exactly one SCN-002 warning;
 * - maxFileBytes (default 5 MiB): oversized FILES are skipped with SCN-004
 *   and do not count toward stats (dirs are never size-checked).
 *
 * Symlink policy (fail-closed):
 * - refuseAllSymlinks: every symlink is refused (SCN-003);
 * - refuseEscapingSymlinks (default true): symlinks whose target resolves
 *   outside the repository root are refused (SCN-003). Escape analysis
 *   requires the reader to expose the optional {@link LinkTargetReader}
 *   capability (readlink). When the target cannot be obtained — no
 *   capability, or the read fails — the symlink is refused (SCN-003)
 *   because it cannot be proven safe. Symlinks are NEVER followed for
 *   traversal: a symlinked dir is a leaf node.
 *
 * include/exclude are literal segment prefixes ("gitignore-style segment
 * matching", no wildcards): a prefix `src` matches `src` and everything under
 * `src/`; trailing slashes are ignored; empty prefixes are ignored. `exclude`
 * skips the entry WITH a SCN-007 warning; a non-matching `include` filter
 * skips silently (it is a narrowing filter, not a policy warning).
 *
 * `isSafeRelativePath` additionally rejects backslashes: on Windows they are
 * separators, so accepting them would make the "relative" check meaningless;
 * rejecting them is the cross-platform fail-closed choice.
 */
import type {
  FileReader,
  ReaderStat,
  ScanEntry,
  ScanOptions,
  ScanReport,
  ScannerEngine,
  ScanWarning,
} from '../contracts.js';
import { ReaderError } from '../contracts.js';

/** Contract defaults, exported for tests and callers. */
export const SCAN_DEFAULTS = {
  maxDepth: 32,
  maxEntries: 100_000,
  maxFileBytes: 5 * 1024 * 1024,
} as const;

/** Frozen warning codes (contracts.ts / ADR-0024). */
export const SCAN_WARNING_CODES = {
  DEPTH_CAP: 'SCN-001',
  ENTRY_CAP: 'SCN-002',
  ESCAPING_SYMLINK: 'SCN-003',
  SKIPPED_OVER_SIZE: 'SCN-004',
  UNREADABLE: 'SCN-005',
  UNSUPPORTED_TYPE: 'SCN-006',
  EXCLUDED: 'SCN-007',
} as const;

/**
 * Optional reader capability: resolve a symlink's target without following it.
 * `safe-scanner` uses this to apply escape checks; `node-reader` and
 * `constructor-reader` implement it. A reader without this capability causes
 * symlinks to be refused when refuseEscapingSymlinks is on (cannot prove safe).
 */
export interface LinkTargetReader {
  linkTarget(path: string): Promise<string>;
}

interface ResolvedScanOptions {
  maxDepth: number;
  maxEntries: number;
  maxFileBytes: number;
  refuseEscapingSymlinks: boolean;
  refuseAllSymlinks: boolean;
  exclude: readonly string[];
  include: readonly string[] | undefined;
}

function resolveOptions(options?: ScanOptions): ResolvedScanOptions {
  return {
    maxDepth: options?.maxDepth ?? SCAN_DEFAULTS.maxDepth,
    maxEntries: options?.maxEntries ?? SCAN_DEFAULTS.maxEntries,
    maxFileBytes: options?.maxFileBytes ?? SCAN_DEFAULTS.maxFileBytes,
    refuseEscapingSymlinks: options?.refuseEscapingSymlinks ?? true,
    refuseAllSymlinks: options?.refuseAllSymlinks ?? false,
    exclude: options?.exclude ?? [],
    include: options?.include,
  };
}

/** Strip trailing slashes from a root path ('' stays ''). */
function normalizeRoot(root: string): string {
  return root.replace(/\/+$/, '');
}

/** POSIX join of a relative path onto a root ('' + rel = rel). */
function readerPathFor(root: string, rel: string): string {
  if (rel === '') return root;
  return root === '' ? rel : `${root}/${rel}`;
}

/** Lexicographic comparator (code-point order — locale-independent). */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareWarnings(a: ScanWarning, b: ScanWarning): number {
  return compareStrings(a.path, b.path) || compareStrings(a.code, b.code);
}

/** True when every non-empty prefix matched as a literal segment prefix. */
function matchesSegmentPrefix(path: string, rawPrefix: string): boolean {
  const prefix = rawPrefix.replace(/\/+$/, '');
  if (prefix === '') return false; // empty prefixes are ignored
  if (path === prefix) return true;
  return path.startsWith(`${prefix}/`);
}

function matchesAnyPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => matchesSegmentPrefix(path, prefix));
}

function readerErrorMessage(error: unknown): string {
  if (error instanceof ReaderError) return error.reason;
  if (error instanceof Error && error.message !== '') return error.message;
  return String(error);
}

/**
 * True when a POSIX-relative path stays inside the repository root.
 * Rejects: empty/'.', NUL bytes, absolute paths (leading '/', Windows drive
 * prefix), backslashes (Windows separator — fail closed), empty segments
 * ('//', trailing '/'), and '.'/'..' segments.
 */
export function isSafeRelativePath(path: string): boolean {
  if (typeof path !== 'string' || path === '' || path === '.') return false;
  if (path.includes('\0')) return false;
  if (path.startsWith('/')) return false;
  if (/^[A-Za-z]:/.test(path)) return false;
  if (path.includes('\\')) return false;
  const segments = path.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return false;
  }
  return true;
}

/**
 * Pure lexical escape analysis for a symlink target (relative or absolute)
 * against a base directory that is itself relative to the repository root.
 *
 * Returns true when the resolved target leaves the virtual root: the target
 * is absolute, contains a NUL, or its '..' segments climb above `baseDir`'s
 * depth (into the root's parent). Backslashes are normalized to '/' first so
 * Windows-created symlinks are analysed with the same math.
 *
 * `baseDir` must be a safe relative path ('' for the root itself) — the
 * scanner always passes the symlink's parent directory.
 */
export function linkEscapes(baseDir: string, relativeLinkTarget: string): boolean {
  if (relativeLinkTarget.includes('\0')) return true;
  if (/^[A-Za-z]:/.test(relativeLinkTarget)) return true;
  const normalized = relativeLinkTarget.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return true;
  const stack: string[] = baseDir === '' ? [] : baseDir.split('/').filter((s) => s !== '');
  for (const segment of normalized.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (stack.length === 0) return true; // climbed above the virtual root
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return false;
}

function parentDir(rel: string): string {
  const idx = rel.lastIndexOf('/');
  return idx === -1 ? '' : rel.slice(0, idx);
}

/**
 * The P10-01 safe scanner engine. Pure + deterministic; filesystem ONLY via
 * the injected reader.
 */
export function safeScanner(): ScannerEngine {
  const scan = async (
    root: string,
    reader: FileReader,
    options?: ScanOptions,
  ): Promise<ScanReport> => {
    const opts = resolveOptions(options);
    const rootNorm = normalizeRoot(root);
    const isExcluded = (rel: string): boolean => matchesAnyPrefix(rel, opts.exclude);
    // include filter: an entry is in scope when it matches an include prefix
    // OR is an ancestor of one (include ['src/lib'] must descend through 'src').
    // Include mismatches are pruned silently — include is a narrowing filter,
    // unlike exclude (which warns, see SCN-007).
    const inScope = (path: string): boolean => {
      if (opts.include === undefined || opts.include.length === 0) return true;
      if (matchesAnyPrefix(path, opts.include)) return true;
      return opts.include.some((prefix) => prefix.startsWith(`${path}/`));
    };

    const entries: ScanEntry[] = [];
    const warnings: ScanWarning[] = [];
    let files = 0;
    let dirs = 0;
    let symlinks = 0;
    let totalBytes = 0;
    let depthTruncated = false;
    let entriesTruncated = false;

    /** Resolve a symlink target; null when unverifiable (no capability / read failure). */
    const symlinkTargetOf = async (path: string): Promise<string | null> => {
      const withTargets = reader as Partial<LinkTargetReader>;
      if (typeof withTargets.linkTarget !== 'function') return null;
      try {
        return await withTargets.linkTarget(path);
      } catch {
        return null;
      }
    };

    /**
     * Expand directory `dir` (POSIX-relative, '' = root) at segment depth
     * `depth`. Emits entries depth-first with siblings sorted by name.
     */
    const expand = async (dir: string, depth: number): Promise<void> => {
      if (entriesTruncated) return;
      if (depth >= opts.maxDepth) {
        depthTruncated = true;
        warnings.push({
          code: SCAN_WARNING_CODES.DEPTH_CAP,
          path: dir,
          message: `depth cap reached (${opts.maxDepth}); subtree truncated`,
        });
        return;
      }
      let names: readonly string[];
      try {
        names = await reader.readDir(readerPathFor(rootNorm, dir));
      } catch (error) {
        warnings.push({
          code: SCAN_WARNING_CODES.UNREADABLE,
          path: dir,
          message: `cannot read directory: ${readerErrorMessage(error)}`,
        });
        return;
      }
      for (const name of [...names].sort(compareStrings)) {
        if (entriesTruncated) return;
        const rel = dir === '' ? name : `${dir}/${name}`;
        if (!inScope(rel)) continue; // narrowing filter: silent
        if (isExcluded(rel)) {
          warnings.push({
            code: SCAN_WARNING_CODES.EXCLUDED,
            path: rel,
            message: 'excluded by exclude prefix',
          });
          continue;
        }
        if (entries.length >= opts.maxEntries) {
          if (!entriesTruncated) {
            entriesTruncated = true;
            warnings.push({
              code: SCAN_WARNING_CODES.ENTRY_CAP,
              path: dir,
              message: `entry cap reached (${opts.maxEntries}); scan truncated`,
            });
          }
          return;
        }
        let stat: ReaderStat;
        try {
          stat = await reader.stat(readerPathFor(rootNorm, rel));
        } catch (error) {
          warnings.push({
            code: SCAN_WARNING_CODES.UNREADABLE,
            path: rel,
            message: `cannot stat entry: ${readerErrorMessage(error)}`,
          });
          continue;
        }
        switch (stat.type) {
          case 'file': {
            if (stat.size > opts.maxFileBytes) {
              warnings.push({
                code: SCAN_WARNING_CODES.SKIPPED_OVER_SIZE,
                path: rel,
                message: `file exceeds maxFileBytes (${stat.size} > ${opts.maxFileBytes}); skipped`,
              });
              continue;
            }
            entries.push({ path: rel, type: 'file', size: stat.size });
            files += 1;
            totalBytes += stat.size;
            break;
          }
          case 'dir': {
            entries.push({ path: rel, type: 'dir', size: 0 });
            dirs += 1;
            await expand(rel, depth + 1);
            break;
          }
          case 'symlink': {
            if (opts.refuseAllSymlinks) {
              warnings.push({
                code: SCAN_WARNING_CODES.ESCAPING_SYMLINK,
                path: rel,
                message: 'refused: all symlinks refused',
              });
              continue;
            }
            if (opts.refuseEscapingSymlinks) {
              const target = await symlinkTargetOf(readerPathFor(rootNorm, rel));
              if (target === null) {
                warnings.push({
                  code: SCAN_WARNING_CODES.ESCAPING_SYMLINK,
                  path: rel,
                  message: 'refused: symlink target cannot be verified',
                });
                continue;
              }
              if (linkEscapes(parentDir(rel), target)) {
                warnings.push({
                  code: SCAN_WARNING_CODES.ESCAPING_SYMLINK,
                  path: rel,
                  message: `refused: symlink target escapes repo root (${target})`,
                });
                continue;
              }
            }
            entries.push({ path: rel, type: 'symlink', size: stat.size });
            symlinks += 1;
            break;
          }
          default: {
            warnings.push({
              code: SCAN_WARNING_CODES.UNSUPPORTED_TYPE,
              path: rel,
              message: `unsupported entry type '${stat.type}'; skipped`,
            });
            break;
          }
        }
      }
    };

    await expand('', 0);

    // Entries are already in DFS order (parents before children, siblings
    // sorted) — no re-sort: a plain path sort would reorder sibling subtrees.
    return {
      root: rootNorm,
      entries,
      warnings: [...warnings].sort(compareWarnings),
      stats: { files, dirs, symlinks, totalBytes },
      truncatedBy: entriesTruncated ? 'entries' : depthTruncated ? 'depth' : null,
    };
  };

  return {
    name: 'safe-scanner',
    scan,
    isSafeRelativePath,
    linkEscapes,
  };
}