import type {
  DiagnosticReport,
  QualityEngine,
  QualityFile,
  QualityFinding,
  QualityInput,
} from './contracts.js';
import { countsOf, sortDiagnostics } from './contracts.js';

/**
 * Quality engine (P09-06, CHG-001 REQ-QLT).
 *
 * Evidence-backed findings, NEVER a vanity score
 * (docs/13-standards-quality/quality-engine.md). The scanner may attach
 * optional markers on top of the frozen QualityFile contract
 * (duplicateOf / sideEffects); they are read when present and otherwise
 * produce no diagnostics.
 *
 * Findings (deterministic, stable codes):
 * - QLT-001 info    file exceeds 400 lines of code (excessive size);
 * - QLT-002 warning max nesting depth exceeds 6 (excessive nesting);
 * - QLT-003 warning file carries a duplication marker -> "duplicates <other>";
 * - QLT-004 error   file has no accompanying test file (missing test coverage);
 * - QLT-005 info    public API doc coverage below 50% (low API doc coverage);
 * - QLT-006 warning file performs side effects on import.
 *
 * PURE: no filesystem, no time, no randomness; identical input -> identical
 * output. Files are visited in path order so same-code findings stay stable.
 */

/** Optional scan markers attached beyond the frozen QualityFile contract. */
export type QualityFileScan = QualityFile & {
  /** Scanner marker: this file is a copy of another source file. */
  readonly duplicateOf?: string;
  /** Scanner marker: importing the module performs side effects. */
  readonly sideEffects?: boolean;
};

/** Lines-of-code threshold for QLT-001 (docs: file/function size). */
export const SIZE_LIMIT = 400;
/** Max nesting-depth threshold for QLT-002 (docs: nesting metric). */
export const NESTING_LIMIT = 6;
/** Minimum documented-export share before QLT-005 fires. */
export const DOC_COVERAGE_FLOOR = 0.5;

function finding(
  severity: QualityFinding['severity'],
  code: string,
  category: string,
  target: string,
  message: string,
  evidence: string,
  remediation: string,
): QualityFinding {
  return { severity, code, category, target, message, evidence, remediation };
}

export function qualityEngine(): QualityEngine {
  return {
    analyze(input: QualityInput): DiagnosticReport {
      const out: QualityFinding[] = [];
      const files: readonly QualityFileScan[] = [...input.files].sort((a, b) =>
        a.path.localeCompare(b.path),
      );

      for (const file of files) {
        // QLT-001 — excessive file size.
        if (file.loc > SIZE_LIMIT) {
          out.push(
            finding(
              'info',
              'QLT-001',
              'excessive responsibility',
              file.path,
              `${file.path} has excessive size`,
              `${file.loc} lines exceeds the ${SIZE_LIMIT}-line threshold`,
              `split ${file.path} into cohesive modules that stay under ${SIZE_LIMIT} lines`,
            ),
          );
        }

        // QLT-002 — excessive nesting.
        if (file.maxNesting > NESTING_LIMIT) {
          out.push(
            finding(
              'warning',
              'QLT-002',
              'complexity/nesting',
              file.path,
              `${file.path} has excessive nesting`,
              `max nesting depth ${file.maxNesting} exceeds the ${NESTING_LIMIT}-level threshold`,
              `extract nested branches in ${file.path} into helpers to stay within ${NESTING_LIMIT} levels`,
            ),
          );
        }

        // QLT-003 — duplication marker.
        if (file.duplicateOf !== undefined) {
          out.push(
            finding(
              'warning',
              'QLT-003',
              'duplication',
              file.path,
              `${file.path} duplicates ${file.duplicateOf}`,
              `scanner marked ${file.path} as a copy of ${file.duplicateOf}`,
              `extract the shared logic into one module and import it from both files`,
            ),
          );
        }

        // QLT-004 — missing test coverage.
        if (!file.hasTest) {
          out.push(
            finding(
              'error',
              'QLT-004',
              'missing tests',
              file.path,
              `${file.path} has missing test coverage`,
              `no test file was found alongside ${file.path}`,
              `add a test file covering ${file.path}'s public behavior`,
            ),
          );
        }

        // QLT-005 — low public API doc coverage.
        if (
          file.exportsCount > 0 &&
          file.documentedExports / file.exportsCount < DOC_COVERAGE_FLOOR
        ) {
          const pct = Math.round((file.documentedExports / file.exportsCount) * 100);
          out.push(
            finding(
              'info',
              'QLT-005',
              'public API documentation gap',
              file.path,
              `${file.path} has low API doc coverage`,
              `only ${file.documentedExports} of ${file.exportsCount} public exports are documented (${pct}%)`,
              `document the undocumented public exports of ${file.path} to reach ${Math.round(DOC_COVERAGE_FLOOR * 100)}% coverage`,
            ),
          );
        }

        // QLT-006 — hidden side effects.
        if (file.sideEffects === true) {
          out.push(
            finding(
              'warning',
              'QLT-006',
              'hidden side effects',
              file.path,
              `${file.path} has side effects on import`,
              `importing ${file.path} executes code beyond declarations`,
              `guard the side effects in ${file.path} behind an explicit init() call or a lazily invoked entry point`,
            ),
          );
        }
      }

      const diagnostics = sortDiagnostics(out);
      return { diagnostics, counts: countsOf(diagnostics) };
    },
  };
}
