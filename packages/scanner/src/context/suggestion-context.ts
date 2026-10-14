/**
 * T15 — deterministic repository context batches for consent-gated suggestions.
 *
 * Builds the bounded, redacted repository context a future `planmo suggest`
 * uploads for AI review. The repository is UNTRUSTED input: this engine is
 * read-only (never writes, never executes package scripts) and every filesystem
 * access flows through the injected {@link FileReader}.
 *
 * Composition (reuses the existing context layer):
 * - {@link safeScanner} produces the path inventory + size/symlink signals;
 * - {@link isSuggestionExcludedPath} gates every path BEFORE any content read,
 *   so an excluded path (`.env`, `.npmrc`, credentials, private keys) is
 *   reported by path only and its content is never read;
 * - {@link redactSuggestionContent} redacts each file before it enters a batch;
 * - {@link contextMapEngine}, {@link symbolIndex} and {@link lexicalContext}
 *   add a structural/symbol/lexical digest derived from the same files.
 *
 * Token estimate (documented, deterministic): `estimateSuggestionTokens` is
 * `ceil(utf16Length / 4)` — a stable approximation, NOT a real tokenizer. The
 * budget is applied to redacted content (what actually ships).
 *
 * Determinism: files are processed sorted by POSIX path; every derived array is
 * sorted; identical input yields an identical (deep-frozen, serializable)
 * result. Nothing is dropped silently — skipped files carry a reason and the
 * coverage block reports truncation.
 */
import type {
  DetectionReport,
  FileReader,
  LexicalToken,
  RepositoryContextMap,
  ScanEntry,
  ScanOptions,
  ScanReport,
  SymbolReference,
} from '../contracts.js';
import { DEFAULT_EXCLUDES, ReaderError } from '../contracts.js';
import { safeScanner } from '../scan/safe-scanner.js';
import { stackDetector } from '../detect/stack-detector.js';
import { contextMapEngine } from './context-map.js';
import { symbolIndex } from './symbol-index.js';
import { lexicalContext } from './lexical-context.js';
import { isSuggestionExcludedPath, redactSuggestionContent } from '../security/suggest-policy.js';

/** Default estimated input-token budgets (AI-setup Plan T15). */
export const SUGGESTION_CONTEXT_DEFAULTS = {
  maxRunTokens: 32_000,
  maxRequestTokens: 8_000,
} as const;

/** Every reason a scanned file can fail to enter a batch. */
export const SUGGESTION_SKIP_REASONS = [
  'excluded',
  'binary',
  'oversize',
  'unreadable',
  'budget',
] as const;

export type SuggestionSkipReason = (typeof SUGGESTION_SKIP_REASONS)[number];

/** Per-file lexical digest (mirrors {@link lexicalContext} output). */
export interface SuggestionLexicalEntry {
  file: string;
  tokens: LexicalToken[];
  markers: string[];
}

/** One redacted file that entered a batch. */
export interface SuggestionContextFile {
  path: string;
  /** Redacted content (never the raw secret-bearing text). */
  content: string;
  estimatedTokens: number;
  /** Redactions applied to this file's content. */
  redactionCount: number;
  /** True when the content was cut to fit the per-request budget. */
  truncated: boolean;
}

/** A single upload-sized batch of redacted files. */
export interface SuggestionBatch {
  index: number;
  files: readonly SuggestionContextFile[];
  estimatedTokens: number;
}

/** A file that did not enter a batch, with the reason it was skipped. */
export interface SuggestionSkippedFile {
  path: string;
  reason: SuggestionSkipReason;
  detail: string;
}

/** Explicit coverage: nothing is ever dropped silently. */
export interface SuggestionContextCoverage {
  /** Complete file inventory discovered by the scan. */
  totalFiles: number;
  /** Files whose content entered a batch. */
  included: number;
  skippedByReason: Readonly<Record<SuggestionSkipReason, number>>;
  /** Files that were readable candidates but fell past the run budget. */
  droppedByBudget: number;
  /** Files whose content was truncated to fit a single request. */
  truncatedFiles: number;
  /** Total redactions applied to included content. */
  redactionCount: number;
  batchCount: number;
  /** True when the scan itself stopped at a cap. */
  scanTruncated: boolean;
  /** True when anything was truncated or dropped by budget. */
  truncated: boolean;
}

export interface SuggestionContextResult {
  root: string;
  batches: readonly SuggestionBatch[];
  /** Every included file, sorted by path (flattened view of `batches`). */
  files: readonly SuggestionContextFile[];
  skipped: readonly SuggestionSkippedFile[];
  coverage: SuggestionContextCoverage;
  contextMap: RepositoryContextMap;
  symbols: readonly SymbolReference[];
  lexical: readonly SuggestionLexicalEntry[];
  maxRunTokens: number;
  maxRequestTokens: number;
}

export interface SuggestionContextOptions {
  /** Per-run estimated input-token budget. Default 32_000. */
  maxRunTokens?: number;
  /** Per-request (per-batch) estimated input-token budget. Default 8_000. */
  maxRequestTokens?: number;
  /** Scan overrides; `exclude` defaults to {@link DEFAULT_EXCLUDES}. */
  scan?: ScanOptions;
}

export interface SuggestionContextEngine {
  readonly name: 'suggestion-context';
  build(
    root: string,
    reader: FileReader,
    options?: SuggestionContextOptions,
  ): Promise<SuggestionContextResult>;
}

/** Manifest/lockfile basenames whose text feeds stack detection (mirrors pipeline.ts). */
const MANIFEST_BASENAMES: ReadonlySet<string> = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
  'Cargo.toml',
  'Cargo.lock',
  'go.mod',
  'go.sum',
  'pyproject.toml',
  'requirements.txt',
  'Pipfile',
  'Pipfile.lock',
  'poetry.lock',
  'composer.json',
  'composer.lock',
  'Gemfile',
  'Gemfile.lock',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
]);

/**
 * Estimated input tokens for a text. Deterministic approximation:
 * `ceil(utf16Length / 4)` — roughly four UTF-16 code units per token. It is not
 * a real tokenizer, but it is stable across runs and platforms.
 */
export function estimateSuggestionTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/** Lexicographic comparator (code-point order — locale-independent). */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** POSIX join of a relative path onto a root ('' + rel = rel; matches the scanner). */
function readerPathFor(root: string, rel: string): string {
  if (rel === '') return root;
  return root === '' ? rel : `${root}/${rel}`;
}

function basenameOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

function errorMessage(error: unknown): string {
  if (error instanceof ReaderError) return error.reason;
  if (error instanceof Error && error.message !== '') return error.message;
  return String(error);
}

/** Recursively freeze a plain (acyclic) value so callers cannot mutate results. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * Build deterministic, redacted, token-budgeted repository context batches.
 * Read-only: uses only the injected reader, never executes scripts, never writes.
 */
async function build(
  root: string,
  reader: FileReader,
  options?: SuggestionContextOptions,
): Promise<SuggestionContextResult> {
  const maxRunTokens = options?.maxRunTokens ?? SUGGESTION_CONTEXT_DEFAULTS.maxRunTokens;
  const maxRequestTokens =
    options?.maxRequestTokens ?? SUGGESTION_CONTEXT_DEFAULTS.maxRequestTokens;

  const scan: ScanReport = await safeScanner().scan(root, reader, {
    exclude: DEFAULT_EXCLUDES,
    ...(options?.scan ?? {}),
  });

  // Oversize files are skipped by the scanner (SCN-004); keep them in the
  // inventory so they are reported rather than silently missing.
  const oversizeWarnings = scan.warnings.filter((warning) => warning.code === 'SCN-004');
  const orderedFiles: ScanEntry[] = scan.entries
    .filter((entry) => entry.type === 'file')
    .sort((a, b) => compareStrings(a.path, b.path));

  const skipped: SuggestionSkippedFile[] = [];
  for (const warning of oversizeWarnings) {
    skipped.push({ path: warning.path, reason: 'oversize', detail: warning.message });
  }

  const batches: SuggestionBatch[] = [];
  const includedContent = new Map<string, string>();
  let currentFiles: SuggestionContextFile[] = [];
  let currentTokens = 0;
  let runTokens = 0;
  let droppedByBudget = 0;
  let truncatedFiles = 0;
  let redactionCount = 0;

  const flushBatch = (): void => {
    if (currentFiles.length === 0) return;
    batches.push({ index: batches.length, files: currentFiles, estimatedTokens: currentTokens });
    currentFiles = [];
    currentTokens = 0;
  };

  for (const entry of orderedFiles) {
    // Policy gate FIRST: an excluded path is never read.
    if (isSuggestionExcludedPath(entry.path)) {
      skipped.push({
        path: entry.path,
        reason: 'excluded',
        detail: 'excluded by suggestion policy (content never read)',
      });
      continue;
    }

    let raw: string;
    try {
      raw = await reader.readFile(readerPathFor(root, entry.path));
    } catch (error) {
      const reason = errorMessage(error);
      skipped.push({
        path: entry.path,
        reason: reason.toLowerCase().includes('binary') ? 'binary' : 'unreadable',
        detail: reason,
      });
      continue;
    }

    // Defensive: readers that do not self-detect NUL bytes still fail closed.
    if (raw.includes('\0')) {
      skipped.push({ path: entry.path, reason: 'binary', detail: 'binary-content' });
      continue;
    }

    const redacted = redactSuggestionContent(raw);
    let content = redacted.content;
    let estimatedTokens = estimateSuggestionTokens(content);
    let truncated = false;
    if (estimatedTokens > maxRequestTokens) {
      content = content.slice(0, maxRequestTokens * 4);
      estimatedTokens = estimateSuggestionTokens(content);
      truncated = true;
      truncatedFiles += 1;
    }

    if (runTokens + estimatedTokens > maxRunTokens) {
      skipped.push({
        path: entry.path,
        reason: 'budget',
        detail: 'dropped: run token budget exhausted',
      });
      droppedByBudget += 1;
      continue;
    }

    if (currentTokens + estimatedTokens > maxRequestTokens && currentFiles.length > 0) {
      flushBatch();
    }
    currentFiles.push({
      path: entry.path,
      content,
      estimatedTokens,
      redactionCount: redacted.redactionCount,
      truncated,
    });
    currentTokens += estimatedTokens;
    runTokens += estimatedTokens;
    redactionCount += redacted.redactionCount;
    includedContent.set(entry.path, content);
  }
  flushBatch();

  skipped.sort((a, b) => compareStrings(a.path, b.path) || compareStrings(a.reason, b.reason));

  // Context-layer digests over the same (redacted) included files, keyed sorted.
  const indexInput = new Map<string, string>();
  for (const path of [...includedContent.keys()].sort(compareStrings)) {
    indexInput.set(path, includedContent.get(path) as string);
  }
  const symbols = await symbolIndex.index(indexInput);
  const lexical = await lexicalContext.index(indexInput);

  // Stack detection feeds the structural context map (manifests only, path-gated).
  const manifests = new Map<string, string>();
  for (const entry of orderedFiles) {
    if (!MANIFEST_BASENAMES.has(basenameOf(entry.path))) continue;
    if (isSuggestionExcludedPath(entry.path)) continue;
    try {
      manifests.set(entry.path, await reader.readFile(readerPathFor(root, entry.path)));
    } catch {
      // An unreadable manifest simply contributes no evidence.
    }
  }
  const detection: DetectionReport = await stackDetector.detect(manifests);
  const contextMap = await contextMapEngine().map(scan, detection);

  const skippedByReason: Record<SuggestionSkipReason, number> = {
    excluded: 0,
    binary: 0,
    oversize: 0,
    unreadable: 0,
    budget: 0,
  };
  for (const entry of skipped) skippedByReason[entry.reason] += 1;

  const included = includedContent.size;
  const scanTruncated = scan.truncatedBy !== null;

  return deepFreeze({
    root: scan.root,
    batches,
    files: batches.flatMap((batch) => batch.files),
    skipped,
    coverage: {
      totalFiles: orderedFiles.length + oversizeWarnings.length,
      included,
      skippedByReason,
      droppedByBudget,
      truncatedFiles,
      redactionCount,
      batchCount: batches.length,
      scanTruncated,
      truncated: droppedByBudget > 0 || truncatedFiles > 0 || scanTruncated,
    },
    contextMap,
    symbols,
    lexical,
    maxRunTokens,
    maxRequestTokens,
  });
}

/** The T15 suggestion-context engine (mirrors the neighbouring engine factories). */
export function suggestionContextEngine(): SuggestionContextEngine {
  return { name: 'suggestion-context', build };
}
