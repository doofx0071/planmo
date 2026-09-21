import type { ChangePackage, StandardRule } from '@planmo/schema';
import type { StateDocument } from '@planmo/schema';
import type { SessionMemoryRow } from '@planmo/workflow';

/**
 * FROZEN Phase 09 contracts (trace/validate/doctor/drift).
 *
 * All engines are PURE + deterministic, produce diagnostics with STABLE
 * codes (CI-consumable), and never mutate state (doctor/validate are
 * read-only). Every returned array sorted; time injected (never Date.now()).
 * exactOptionalPropertyTypes is ON: omit optional fields, never set them to
 * undefined.
 */

// ------------------------------------------------------------------ codes

/** Stable diagnostic codes, grouped by engine prefix. */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  /** Stable code for CI, e.g. "TRC-001". */
  code: string;
  severity: DiagnosticSeverity;
  /** Target id/path the diagnostic is about. */
  target: string;
  message: string;
  /** Optional remediation hint (must be actionable when present). */
  remediation?: string;
}

/** Sorted diagnostics (severity rank error > warning > info, then code). */
export interface DiagnosticReport {
  diagnostics: readonly Diagnostic[];
  /** Counts per severity (sorted keys). */
  counts: Record<DiagnosticSeverity, number>;
}

export const severityRank: Record<DiagnosticSeverity, number> = { error: 0, warning: 1, info: 2 };

export function sortDiagnostics(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return [...diagnostics].sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity] || a.code.localeCompare(b.code),
  );
}

export function countsOf(diagnostics: readonly Diagnostic[]): Record<DiagnosticSeverity, number> {
  return {
    error: diagnostics.filter((d) => d.severity === 'error').length,
    warning: diagnostics.filter((d) => d.severity === 'warning').length,
    info: diagnostics.filter((d) => d.severity === 'info').length,
  };
}

// --------------------------------------------------------------- trace (P09-01/04)

export interface TraceInput {
  /** Requirement ids in canonical order, e.g. ["REQ-GEN-004"]. */
  requirements: readonly string[];
  /** Tasks as {phase, id, title} rows from tasks.csv (canonical). */
  tasks: readonly TraceTask[];
  /** Decision ids, e.g. ["ADR-0022", "ACCEPTED"] rows from DECISIONS. */
  decisions: readonly string[];
  /** Tests: {name, file, task} rows (evidence). */
  tests: readonly TraceTest[];
  /**
   * Requirement → task links, e.g. "REQ-GEN-004 -> [P05-01, P05-02]".
   * Empty means "derive from requirement-owning tasks when task ids embed
   * requirement prefixes" — see ownerOf.
   */
  links: readonly TraceLink[];
}

export interface TraceTask {
  id: string;
  phase: string;
  title: string;
  status: string;
}

export interface TraceTest {
  name: string;
  file: string;
  /** Owning task id when known. */
  task?: string;
  /** Whether the test is known to pass (evidence). */
  passing: boolean;
}

export interface TraceLink {
  from: string;
  to: string;
}

/** A single node in the derived trace graph. */
export interface TraceNode {
  id: string;
  kind: 'requirement' | 'task' | 'decision' | 'test';
  /** Links this node participates in (sorted). */
  edges: readonly string[];
}

export interface TraceGraph {
  nodes: readonly TraceNode[];
  /** Orphaned requirement ids (no task link, no decision link). */
  orphans: readonly string[];
  /** Tasks with no test evidence at all. */
  untested: readonly string[];
  /** Requirements whose owning tasks are all DONE but carry no test row. */
  missingEvidence: readonly string[];
  /** Stable-code diagnostics. */
  diagnostics: readonly Diagnostic[];
}

export interface TraceGraphEngine {
  build(input: TraceInput): TraceGraph;
}

export interface TraceRenderer {
  /** Deterministic markdown/text rendering of a built graph. */
  render(graph: TraceGraph): string;
}

// ---------------------------------------------------------- validate (P09-02)

export interface ValidateInput {
  /** Required canonical document paths. */
  docs: readonly string[];
  state?: StateDocument;
  /** Parsed task ids + statuses (canonical). */
  tasks?: Readonly<Record<string, string>>;
  /** Manifest entries "path -> sha256" when available. */
  manifest?: Readonly<Record<string, string>>;
}

export interface Validator {
  /** Cross-document invariants + schema presence checks; read-only. */
  run(input: ValidateInput): DiagnosticReport;
}

// ------------------------------------------------------------ doctor (P09-03)

export interface DoctorInput {
  /** Injected environment facts (the CLI resolves these). */
  env: {
    nodeVersion: string;
    pnpmVersion?: string;
    gitAvailable: boolean;
    workingDir: string;
    /** Present canonical files. */
    files: readonly string[];
    /** Required tool files, e.g. package.json, tsconfig.base.json. */
    toolchain: readonly string[];
  };
  /** Required workspace entry points (relative paths). */
  requiredFiles?: readonly string[];
}

export interface Doctor {
  /** Environmental/project health check — never mutates state. */
  run(input: DoctorInput): DiagnosticReport;
}

// ------------------------------------------------------------ quality (P09-06)

export interface QualityInput {
  /** Per-file structural scan results (the CLI computes these). */
  files: readonly QualityFile[];
  /** Declared dependencies per package (name -> deps). */
  packages: Readonly<Record<string, readonly string[]>>;
  /** Known cycle edges (from a graph walk). */
  cycles?: readonly string[];
}

export interface QualityFile {
  path: string;
  /** Lines of code for size diagnostics. */
  loc: number;
  /** Max nesting depth (imported from scanner). */
  maxNesting: number;
  /** TODO/FIXME comment lines. */
  todos: number;
  /** Number of public exported symbols (doc-gap check). */
  exportsCount: number;
  /** Number of exported symbols with a doc comment (doc-gap check). */
  documentedExports: number;
  /** Whether the file has an accompanying test file. */
  hasTest: boolean;
}

/** Evidence-backed finding (never a vanity score). */
export interface QualityFinding extends Diagnostic {
  /** Category from quality-engine.md. */
  category: string;
  /** Remediation hint (always present for findings). */
  evidence: string;
}

export interface QualityEngine {
  /** Emits findings, not a score. Deterministic. */
  analyze(input: QualityInput): DiagnosticReport;
}

// ------------------------------------------------------ fitness (P09-07)

export interface FitnessRule {
  id: string;
  /** Machine-readable predicate: allowed dependency edges. */
  allowedEdges: Readonly<Record<string, readonly string[]>>;
  /** Declared package dependencies actually observed. */
  observedEdges?: Readonly<Record<string, readonly string[]>>;
  /** Known import cycles "a -> b -> a". */
  cycles?: readonly string[];
  /** Detected generated-file imports (import from dist/). */
  generatedImports?: readonly string[];
}

export interface FitnessViolation extends Diagnostic {
  rule: string;
  /** Dependency path, e.g. "a -> b". */
  path: string;
  /** Affected requirement/ADR, when known. */
  reference?: string;
  remediation: string;
}

export interface FitnessEngine {
  /** Machine-readable rules with rule ID, path, requirement, remediation. */
  evaluate(rules: FitnessRule): DiagnosticReport;
}

// ---------------------------------------------------- standards drift (P09-08)

export interface StandardsDriftInput {
  /** Declared applicable standards (from state/pack declares). */
  declared: readonly StandardRule[];
  /** Standards actually selected for the current context. */
  selected: readonly StandardRule[];
  /** Standards classes known to the schema. */
  knownClasses: readonly string[];
}

export interface StandardsDriftEngine {
  /** Detect drift: declared-but-unselected, selected-but-undeclared, unknown class. */
  analyze(input: StandardsDriftInput): DiagnosticReport;
}

// ------------------------------------------------------------ debt (P09-09)

export interface DebtRecord {
  id: string;
  title: string;
  status: string;
  /** Committed/open debt vs resolved. */
  targetPhase?: string;
  affectedPaths?: readonly string[];
}

export interface DebtInput {
  records: readonly DebtRecord[];
  /** Tasks currently marked DONE (to flag resolved-debt hiding). */
  doneTasks: readonly string[];
}

export interface DebtEngine {
  /** Findings for open/stale/resolved-without-evidence debt. */
  analyze(input: DebtInput): DiagnosticReport;
}

// ------------------------------------------------------- memory health (P09-10)

export interface MemoryHealthInput {
  /** Durable memory rows (from workflow consolidation). */
  rows: readonly SessionMemoryRow[];
  /** Current canonical source hashes (provenance -> hash). */
  currentHashes: Readonly<Record<string, string>>;
  /** Index entries known to exist. */
  indexEntries: readonly string[];
}

export interface MemoryHealthEngine {
  /** Stale/superseded detection + index integrity + lineage diagnostics. */
  analyze(input: MemoryHealthInput): DiagnosticReport;
}