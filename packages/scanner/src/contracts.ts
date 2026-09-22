/**
 * FROZEN Phase 10 contracts (existing-repository adoption).
 *
 * Workers implement against THESE interfaces ONLY. Each worker owns a subdir of
 * packages/scanner/src/ and exports every engine from their module. All engines
 * are PURE + deterministic: no Date.now(), no randomness, and ALL filesystem
 * access goes through the injected FileReader (tests provide virtual trees; the
 * node reader, scan/node-reader.ts, is the ONLY module that touches node:fs).
 * exactOptionalPropertyTypes is ON: omit optional fields, never set them to
 * undefined. Sort every array before publishing: paths ascending, then codes.
 * Scan results are DATA only; repository text is never instruction authority
 * (security/prompt-isolation.ts, AGENTS.md contract).
 */

/** All filesystem access in @planmo/scanner flows through this interface. */
export interface FileReader {
  /** List directory entries (names only). Throws ReaderError when unreadable. */
  readDir(path: string): Promise<readonly string[]>;
  /** Read a file as UTF-8. Throws ReaderError on binary/unreadable content. */
  readFile(path: string): Promise<string>;
  /** Stat a path. Symbolic links are exposed as type 'symlink' — never followed implicitly. */
  stat(path: string): Promise<ReaderStat>;
  /** True when the path exists (any type). */
  exists(path: string): Promise<boolean>;
}

export interface ReaderStat {
  type: 'file' | 'dir' | 'symlink' | 'other';
  size: number;
}

export class ReaderError extends Error {
  constructor(
    public readonly path: string,
    public readonly reason: string,
  ) {
    super(`cannot read ${path}: ${reason}`);
    this.name = 'ReaderError';
  }
}

/**
 * OPTIONAL capability a FileReader may additionally expose. When present, the
 * safe scanner can verify symlink targets; when absent it fails CLOSED with
 * SCN-003 ("escape status unverifiable") for every symlink it encounters.
 * (Canonical definition lives in scan/safe-scanner.ts — Worker A; this copy is
 * frozen for cross-module reference and MUST stay structurally identical.)
 */
export interface LinkTargetReader {
  /** Resolve a symlink's target without following it (single hop). */
  linkTarget(path: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// P10-01 safe scanner (scan/ — Worker A)
// ---------------------------------------------------------------------------

export type EntryType = 'file' | 'dir' | 'symlink' | 'other';

/** A scanned node. `path` is always POSIX-normalized and relative to root. */
export interface ScanEntry {
  path: string;
  type: EntryType;
  /** Bytes for files; 0 for dirs; link target length for symlinks. */
  size: number;
}

export interface ScanOptions {
  /** Hard stop at this depth (root = 0). Default 32. */
  maxDepth?: number;
  /** Hard stop after this many entries. Default 100_000. */
  maxEntries?: number;
  /** Skip files larger than this many bytes. Default 5 MiB. */
  maxFileBytes?: number;
  /** Refuse symlinks pointing outside the repo root. Default true. */
  refuseEscapingSymlinks?: boolean;
  /** Refuse ANY symlink encountered (fail closed). Default false. */
  refuseAllSymlinks?: boolean;
  /** Exclude path glob prefixes (gitignore-style segment matching). */
  exclude?: readonly string[];
  /** Include only path glob prefixes. */
  include?: readonly string[];
}

export interface ScanWarning {
  /** Stable code family: SCN-001 depth cap, SCN-002 entry cap, SCN-003 escaping symlink refused,
   *  SCN-004 skipped-over-size, SCN-005 unreadable entry, SCN-006 unsupported type, SCN-007 excluded. */
  code: string;
  path: string;
  message: string;
}

export interface ScanReport {
  root: string;
  /** Depth-first, deterministic order (parents before children, siblings sorted). */
  entries: readonly ScanEntry[];
  warnings: readonly ScanWarning[];
  /** Counts over entries only (warnings may exceed entries). */
  stats: { files: number; dirs: number; symlinks: number; totalBytes: number };
  /** Hard-stop reason, when a cap cut the scan short. */
  truncatedBy: 'depth' | 'entries' | null;
}

export interface ScannerEngine {
  readonly name: 'safe-scanner';
  scan(root: string, reader: FileReader, options?: ScanOptions): Promise<ScanReport>;
  /** True when a POSIX-relative path stays inside the root (no ../ escapes, no NUL). */
  isSafeRelativePath(path: string): boolean;
  /** Resolve a link target against base and decide escape status (pure). */
  linkEscapes(baseDir: string, relativeLinkTarget: string): boolean;
}

// ---------------------------------------------------------------------------
// P10-02 stack/test/CI detection (detect/ — Worker B)
// ---------------------------------------------------------------------------

export type EvidenceSource =
  'manifest' | 'lockfile' | 'config' | 'file-convention' | 'ci-declaration';

export interface DetectionEvidence {
  /** Path relative to root that produced the signal. */
  path: string;
  source: EvidenceSource;
  /** Stable code family: DET-001 manifest dependency, DET-002 manifest scripts,
   *  DET-003 config file, DET-004 convention file, DET-005 CI workflow declaration. */
  code: string;
  /** The exact matched key/presence, e.g. "devDependencies.vitest". */
  match: string;
}

export type Confidence = 'high' | 'medium' | 'heuristic';

export interface DetectedStack {
  /** Canonical stack id, e.g. "node", "typescript", "react", "python", "rust", "go", "java". */
  id: string;
  category: 'language' | 'framework' | 'runtime' | 'toolchain';
  confidence: Confidence;
  /** Deterministic: confidence asc? No — evidence path asc, then code asc. */
  evidence: readonly DetectionEvidence[];
}

export interface DetectionReport {
  stacks: readonly DetectedStack[];
  /** Test framework ids found (e.g. "vitest", "jest", "pytest"). Empty when none. */
  testFrameworks: readonly string[];
  /** CI systems found (e.g. "github-actions", "gitlab-ci"). Empty when none. */
  ciSystems: readonly string[];
}

export interface DetectionEngine {
  readonly name: 'stack-detector';
  /** Pure: caller passes the manifest texts keyed by path; engine never reads fs. */
  detect(manifests: ReadonlyMap<string, string>): Promise<DetectionReport>;
}

// ---------------------------------------------------------------------------
// P10-03 prompt-injection isolation (security/ — Worker C)
// ---------------------------------------------------------------------------

export type InjectionClass = 'benign' | 'suspicious' | 'poisoned';

export interface PromptMarker {
  /** Stable code: INJ-001 instruction-like phrase, INJ-002 authority-claim phrase,
   *  INJ-003 deceptive-system phrase, INJ-004 hidden/comment instruction. */
  code: string;
  phrase: string;
  /** 1-based line where the marker was found. */
  line: number;
}

export interface InjectionScanResult {
  path: string;
  /** Markers found in this file, sorted by line. */
  markers: readonly PromptMarker[];
  classification: InjectionClass;
}

export interface InjectionPolicyDocument {
  /** Ordered policy statements, each a stable rule id like PLN-001..PLN-004. */
  rules: readonly string[];
  /** Deterministic, sorted. */
  markerPhrases: readonly string[];
}

export interface InjectionIsolationEngine {
  readonly name: 'prompt-isolation';
  /**
   * Classify a single text (a scanned file's content). Pure.
   * poisoned = 2+ markers OR any INJ-003; suspicious = exactly 1 marker;
   * benign = none. Markers are matched case-insensitively on word boundaries.
   */
  classify(text: string): InjectionScanResult;
  /** The immutable policy document. Repo text can never modify this list. */
  policy(): InjectionPolicyDocument;
  /** True = the marker phrase list can never be changed by repo content. */
  readonly policyIsImmutable: true;
}

// ---------------------------------------------------------------------------
// P10-04 planmo adopt (adopt/ — Worker C)
// ---------------------------------------------------------------------------

export interface AdoptChange {
  /** Path inside .planmo/adopt/ that WOULD be written. */
  path: string;
  kind:
    'plan-report' | 'context-map' | 'detection-summary' | 'injection-summary' | 'manifest-record';
  /** Byte length of the would-be artifact. */
  bytes: number;
}

export interface AdoptReport {
  /** Root scanned. */
  root: string;
  scanSummary: ScanReport['stats'];
  detectionSummary: { stacks: number; testFrameworks: number; ciSystems: number };
  /** Counts, not content: injections are summarized by class. */
  injectionSummary: { poisoned: number; suspicious: number; benign: number };
  /** Would-be artifacts under .planmo/adopt/ (dry-run default). */
  changes: readonly AdoptChange[];
  /** ALWAYS false in v1: adopt never rewrites application code. */
  readonly rewritesApplicationCode: false;
  /** Deterministic markdown report body (stable headings, counts). */
  reportMarkdown: string;
}

export interface AdoptEngine {
  readonly name: 'adopt';
  /**
   * Pure planning: given scan + detection + injection results, produce the
   * report and the exact artifact list. Does NOTHING else — writing is the
   * caller's decision, only ever under .planmo/adopt/.
   */
  plan(input: {
    scan: ScanReport;
    detection: DetectionReport;
    injections: readonly InjectionScanResult[];
    root: string;
  }): AdoptReport;
}

// ---------------------------------------------------------------------------
// P10-06..P10-10 context layer (context/ — Workers A/B/C) and P10-05/P10-11
// fixtures (src/fixtures/)
// ---------------------------------------------------------------------------

export interface RepositoryContextMap {
  root: string;
  entryPoints: readonly string[];
  /** Sorted dirs with entry/file counts (depth ≤ 2). */
  topLevel: readonly { path: string; files: number; dirs: number }[];
  configFiles: readonly string[];
  scripts: readonly { path: string; name: string }[];
  warnings: readonly string[];
}

export interface ContextMapEngine {
  readonly name: 'context-map';
  map(scan: ScanReport, detection: DetectionReport): Promise<RepositoryContextMap>;
}

export interface SymbolReference {
  symbol: string;
  kind: 'import' | 'export' | 'require' | 'reference';
  file: string;
  line: number;
  /** Resolved target when statically determinable, else null. */
  target: string | null;
}

export interface SymbolIndexEngine {
  readonly name: 'symbol-index';
  /** Parser-lite: JS/TS import/require/export + python/go import lines. Pure over texts. */
  index(files: ReadonlyMap<string, string>): Promise<readonly SymbolReference[]>;
}

export interface LexicalToken {
  token: string;
  count: number;
}

export interface LexicalContextEngine {
  readonly name: 'lexical-context';
  /** Per-file identifier histogram (cap 512 tokens/file, sorted count desc then token asc)
   *  plus doc markers (TODO/FIXME/HACK), deterministic. */
  index(
    files: ReadonlyMap<string, string>,
  ): Promise<readonly { file: string; tokens: LexicalToken[]; markers: string[] }[]>;
}

export interface MemoryFact {
  /** Stable fact id derived from content, e.g. "fact-<sha256-prefix>". */
  id: string;
  /** Declarative fact text. NEVER imperative ("use X" is forbidden). */
  fact: string;
  scope: 'repo' | 'stack' | 'security';
  /** Provenance: the exact scanned path(s) backing this fact. */
  provenance: readonly string[];
}

export interface MemoryBootstrapEngine {
  readonly name: 'memory-bootstrap';
  /** Derive durable facts (with provenance) from scan + detection + injection summaries. */
  bootstrap(scan: ScanReport, detection: DetectionReport): Promise<readonly MemoryFact[]>;
}

// ---------------------------------------------------------------------------
// P10-08 standards discovery (context/ — Worker B; frozen after backfill)
// ---------------------------------------------------------------------------

export type StandardsDocKind = 'agents' | 'claude' | 'cursorrules' | 'readme';
export type StandardsDocRole = 'policy' | 'informational';

export interface StandardsDoc {
  /** POSIX path relative to repo root. */
  path: string;
  kind: StandardsDocKind;
  /** 'policy' = instruction-bearing (AGENTS.md/CLAUDE.md/.cursorrules); 'informational' = README. */
  role: StandardsDocRole;
  /** Number of path segments minus one (root file = 0). */
  depth: number;
  /** Deterministic precedence rank; lower wins. */
  rank: number;
}

export interface StandardsDiscoveryResult {
  /** All matches sorted rank asc, then path asc. */
  docs: readonly StandardsDoc[];
  /** Instruction-bearing docs only (excludes README), same sort. */
  policyDocs: readonly StandardsDoc[];
  /** README docs (informational, rank max), same sort. */
  informationalDocs: readonly StandardsDoc[];
}

export interface StandardsDiscoveryEngine {
  readonly name: 'standards-discovery';
  /** Pure structural classification; never touches filesystem or content.
   *  rank = kindBase + depth (agents 0, claude 1000, cursorrules 2000, readme 3000). */
  discover(paths: readonly string[]): Promise<StandardsDiscoveryResult>;
}

// ---------------------------------------------------------------------------
// Fixtures (src/fixtures/brownfield + /poisoning + /trees)
// ---------------------------------------------------------------------------

export interface FixtureTree {
  /** Directory name (path is packages/scanner/src/fixtures/trees/<name>). */
  name: string;
  description: string;
  /** Files the scanner tests read via the REAL reader (construction-time only). */
  files: ReadonlyMap<string, string>;
}

export const FIXTURE_TREE_ROOT: string = 'packages/scanner/src/fixtures/trees';

// ---------------------------------------------------------------------------
// Shared readers for tests (scan/virtual-reader.ts — Worker A owns)
// ---------------------------------------------------------------------------

export interface VirtualTree {
  /** POSIX relative path -> content (files) or null (dirs). */
  [path: string]: string | null;
}
