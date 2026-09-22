/**
 * P10-06 — repository context map engine (CHG-001, Worker A).
 *
 * A compact structural digest of a scanned repository: entry points, shallow
 * top-level directory stats, config-file conventions and manifest scripts.
 * Pure + deterministic: it derives everything from the frozen inputs
 * ({@link ScanReport} + {@link DetectionReport}) — no filesystem, no time,
 * no randomness. All output arrays are sorted (paths asc, then strings) and
 * deduplicated.
 *
 * Evidence convention (contract between context-map and stack-detector):
 * the stack detector reports manifest values as DET-001 (manifest
 * dependency/field) / DET-002 (manifest scripts) evidence with `source ===
 * 'manifest'` and `match` strings of the form `<field>.<key>` or a bare
 * `<field>`:
 * - entry points: DET-001 evidence whose match is one of `main`, `bin`,
 *   `exports`, or starts with `bin.` / `exports.` contributes the descriptor
 *   `<evidence.path>#<match>` (e.g. `package.json#main`,
 *   `packages/x/package.json#bin.cli`). Dependency matches
 *   (`dependencies.*` / `devDependencies.*` / ...) are never entry points.
 * - scripts: DET-002 evidence whose match starts with `scripts.` contributes
 *   { path: <evidence.path>, name: <key> }.
 *
 * CTX-001+ warning codes (ADR-0024):
 * - CTX-001: a `.env*` file (other than `*.example`) is present in the scan —
 *   potential secrets risk surface;
 * - CTX-002: no `package.json` manifest was found in the scan;
 * - CTX-003: no entry points were discovered.
 * Scan warnings pass through, formatted `SCN-xxx <path>: <message>`.
 */
import type {
  ContextMapEngine,
  DetectionEvidence,
  DetectionReport,
  RepositoryContextMap,
  ScanReport,
} from '../contracts.js';

/** Entry-point manifest fields the detector signals (contract above). */
const MANIFEST_ENTRY_FIELDS = new Set<string>(['main', 'bin', 'exports']);

/** Root-dir README names, in preference order. */
const README_NAMES: readonly string[] = ['README.md', 'README', 'README.txt'];

/** Lexicographic comparator (code-point order — locale-independent). */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function depthOf(path: string): number {
  return path === '' ? 0 : path.split('/').length;
}

function parentOf(path: string): string | null {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? null : path.slice(0, idx);
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

function flatEvidence(detection: DetectionReport): readonly DetectionEvidence[] {
  const out: DetectionEvidence[] = [];
  for (const stack of detection.stacks) {
    for (const evidence of stack.evidence) out.push(evidence);
  }
  return out;
}

function manifestEntryFields(evidence: DetectionEvidence): string | null {
  if (evidence.source !== 'manifest' || evidence.code !== 'DET-001') return null;
  const field = evidence.match;
  if (MANIFEST_ENTRY_FIELDS.has(field)) return field;
  if (field.startsWith('bin.') || field.startsWith('exports.')) return field;
  return null;
}

function scriptOf(evidence: DetectionEvidence): string | null {
  if (evidence.source !== 'manifest' || evidence.code !== 'DET-002') return null;
  if (!evidence.match.startsWith('scripts.')) return null;
  const name = evidence.match.slice('scripts.'.length);
  return name === '' ? null : name;
}

export function contextMapEngine(): ContextMapEngine {
  const map = async (
    scan: ScanReport,
    detection: DetectionReport,
  ): Promise<RepositoryContextMap> => {
    const filesByPath = new Set<string>();
    const dirsByPath = new Set<string>();
    for (const entry of scan.entries) {
      if (entry.type === 'file') filesByPath.add(entry.path);
      if (entry.type === 'dir') dirsByPath.add(entry.path);
    }

    // --- entry points -------------------------------------------------------
    const entryPoints = new Set<string>();
    for (const readme of README_NAMES) {
      if (filesByPath.has(readme)) {
        entryPoints.add(readme);
        break;
      }
    }
    if (dirsByPath.has('src')) entryPoints.add('src/');
    for (const evidence of flatEvidence(detection)) {
      const field = manifestEntryFields(evidence);
      if (field !== null) entryPoints.add(`${evidence.path}#${field}`);
    }

    // --- topLevel (dirs at depth 1..2 with direct child counts) -------------
    const topLevel = new Map<string, { path: string; files: number; dirs: number }>();
    for (const entry of scan.entries) {
      if (entry.type !== 'dir') continue;
      const depth = depthOf(entry.path);
      if (depth >= 1 && depth <= 2) {
        topLevel.set(entry.path, { path: entry.path, files: 0, dirs: 0 });
      }
    }
    for (const entry of scan.entries) {
      if (entry.type !== 'file' && entry.type !== 'dir') continue;
      const parent = parentOf(entry.path);
      if (parent === null) continue; // root itself is not a listed dir
      const bucket = topLevel.get(parent);
      if (bucket === undefined) continue;
      if (entry.type === 'file') bucket.files += 1;
      else bucket.dirs += 1;
    }

    // --- configFiles by naming convention -----------------------------------
    const configFiles: string[] = [];
    for (const path of filesByPath) {
      const base = basename(path);
      if (base.startsWith('.env')) {
        configFiles.push(path);
        continue;
      }
      if (base.includes('.config.')) {
        configFiles.push(path);
        continue;
      }
      if (/^tsconfig.*\.json$/.test(base)) {
        configFiles.push(path);
        continue;
      }
    }

    // --- scripts from manifest evidence -------------------------------------
    const scriptKey = (path: string, name: string): string => `${path}\u0000${name}`;
    const scripts = new Map<string, { path: string; name: string }>();
    for (const evidence of flatEvidence(detection)) {
      const name = scriptOf(evidence);
      if (name === null) continue;
      scripts.set(scriptKey(evidence.path, name), { path: evidence.path, name });
    }

    // --- warnings: scan passthrough + CTX codes ------------------------------
    const warnings = new Set<string>();
    for (const warning of scan.warnings) {
      warnings.add(`${warning.code} ${warning.path}: ${warning.message}`);
    }
    for (const path of filesByPath) {
      const base = basename(path);
      if (base.startsWith('.env') && !base.endsWith('.example')) {
        warnings.add(
          `CTX-001 ${path}: .env file present with content (potential secrets — only *.example is expected in a scanned repo)`,
        );
      }
    }
    if (filesByPath.size > 0) {
      let manifestCount = 0;
      for (const path of filesByPath) {
        if (basename(path) === 'package.json') manifestCount += 1;
      }
      if (manifestCount === 0) {
        warnings.add('CTX-002 (root): no package.json manifest found in scan');
      }
    }
    if (entryPoints.size === 0) {
      warnings.add('CTX-003 (root): no entry points discovered');
    }

    return {
      root: scan.root,
      entryPoints: [...entryPoints].sort(compareStrings),
      topLevel: [...topLevel.values()].sort((a, b) => compareStrings(a.path, b.path)),
      configFiles: [...configFiles].sort(compareStrings),
      scripts: [...scripts.values()].sort(
        (a, b) => compareStrings(a.path, b.path) || compareStrings(a.name, b.name),
      ),
      warnings: [...warnings].sort(compareStrings),
    };
  };

  return {
    name: 'context-map',
    map,
  };
}
