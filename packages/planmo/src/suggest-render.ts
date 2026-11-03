/**
 * Human-readable renderer for `planmo suggest` reports (AI-setup Plan T20).
 *
 * `planmo suggest` returns an advisory, evidence-backed report (see
 * `@planmo/schema` `SuggestionReportSchema`). This module is the single place
 * that turns an already-validated `SuggestionReport` into the plain text a user
 * reads on stdout. It is pure and deterministic: identical reports produce
 * byte-identical output, and it reads nothing but the report object it is
 * handed — no `fs`, no network, no scanner import.
 *
 * Contract:
 * - Output is a plain `\n`-joined string with no colour or ANSI escapes and no
 *   trailing newline; the caller decides how to print it.
 * - Ordering: suggestions are rendered ascending by `id` using a deterministic
 *   natural-order comparison (digit runs compare numerically), so `SUG-2`
 *   precedes `SUG-10` and zero-padded ids (`SUG-001`..`SUG-010`) keep their
 *   report order. The sort is stable, so equal ids retain report order. This is
 *   the documented, tested rule — the report's own order is not trusted.
 * - Advisory framing: the output is labelled as suggestions, not verified
 *   defects, and states the model may be wrong.
 * - No raw source or secrets are ever rendered: the report schema has no
 *   snippet field and this module never reads a file to add one. Every
 *   report-derived string (prose, ids, provider id/model, evidence paths,
 *   limitation lines) is sanitized before it is emitted: ANSI escape sequences
 *   are stripped, and tabs, CR, LF, any other control character, format
 *   character, or line/paragraph separator is collapsed to a single space. The
 *   rendered output therefore contains no character below U+0020 except the
 *   `\n` line breaks this renderer emits itself, and no character in
 *   U+007F-U+009F — so a hostile report cannot emit terminal escapes or forge a
 *   report line. This is defence in depth: the schema (`ProseText`) already
 *   rejects such prose.
 * - Coverage is reported honestly: a partial-coverage notice is shown whenever
 *   the scan was truncated or files were excluded, redacted, or omitted.
 *
 * `exactOptionalPropertyTypes` is ON and `noUncheckedIndexedAccess` is ON.
 */

import type {
  Suggestion,
  SuggestionCoverage,
  SuggestionEvidence,
  SuggestionReport,
} from '@planmo/schema';

/** Fixed report heading (the report contract has no title field of its own). */
export const SUGGEST_REPORT_TITLE = 'PlanMo codebase suggestions';

/** Matches runs of digits and runs of non-digits, for natural-order ids. */
const ID_CHUNKS = /\d+|\D+/g;

/**
 * A complete ANSI escape sequence: CSI (`ESC [ … final`), OSC (`ESC ] … BEL` or
 * `ESC \`), or a two-character Fe escape (`ESC @`-`ESC _`). Stripped outright so
 * a `ESC[2J` clear-screen cannot reach the terminal.
 */
const ANSI_ESCAPE_SEQUENCE =
  /\u001B\[[0-?]*[ -/]*[@-~]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\u001B[@-Z\\-_]/g;

/**
 * Any run of characters that must not survive into the rendered output: C0
 * controls (including tab, CR, and LF), the C1 range, Unicode format characters
 * (`Cf`, e.g. zero-width and bidi controls), and the line/paragraph separators
 * (`Zl`/`Zp`). Collapsed to a single space.
 */
const CONTROL_OR_FORMAT_RUN = /[\u0000-\u001F\u007F-\u009F\p{Cf}\p{Zl}\p{Zp}]+/gu;

/**
 * Sanitize one report-derived string for terminal output.
 *
 * Strips ANSI escape sequences, then collapses tabs, CR, LF, any remaining
 * control character, format character, or line/paragraph separator to a single
 * space. The result is a single line with no escape bytes, so a hostile report
 * cannot forge a report line or drive the terminal.
 */
function sanitizeText(value: string): string {
  return value.replace(ANSI_ESCAPE_SEQUENCE, '').replace(CONTROL_OR_FORMAT_RUN, ' ');
}

/** Section underline that matches the header length. */
function underline(header: string): string {
  return '-'.repeat(header.length);
}

/** A section header plus its underline. */
function section(header: string): [string, string] {
  return [header, underline(header)];
}

/** Render one evidence reference as `path:start-end`, or `path:start` if single. */
function formatEvidence(evidence: SuggestionEvidence): string {
  const path = sanitizeText(evidence.path);
  return evidence.startLine === evidence.endLine
    ? `${path}:${evidence.startLine}`
    : `${path}:${evidence.startLine}-${evidence.endLine}`;
}

/**
 * Deterministic natural-order comparison of two suggestion ids. Digit runs are
 * compared as numbers (so `SUG-2` < `SUG-10`); other runs compare by code unit.
 * Equal numeric runs of different width order the shorter first (`2` < `02`).
 */
function compareSuggestionIds(a: string, b: string): number {
  const left = a.match(ID_CHUNKS) ?? [a];
  const right = b.match(ID_CHUNKS) ?? [b];
  const shared = Math.min(left.length, right.length);

  for (let i = 0; i < shared; i += 1) {
    const l = left[i] as string;
    const r = right[i] as string;
    const lNumeric = /^\d/.test(l);
    const rNumeric = /^\d/.test(r);

    if (lNumeric && rNumeric) {
      const difference = Number(l) - Number(r);
      if (difference !== 0) return difference < 0 ? -1 : 1;
      if (l.length !== r.length) return l.length < r.length ? -1 : 1;
    } else if (l !== r) {
      return l < r ? -1 : 1;
    }
  }

  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  return 0;
}

/**
 * The partial-coverage notice, or an empty array when coverage is complete.
 *
 * A truncated scan always gets the explicit notice. A non-truncated scan that
 * still dropped files (excluded, redacted, or omitted) gets a milder notice, so
 * the report never implies the scan was complete when it was not.
 */
function partialCoverageNotice(coverage: SuggestionCoverage): string[] {
  if (coverage.truncated) {
    return [
      'Partial coverage: this scan was truncated. Files were omitted and some content',
      'was not reviewed, so this report is NOT a complete review of the repository.',
    ];
  }
  if (coverage.excludedFiles > 0 || coverage.redactedFiles > 0 || coverage.omittedFiles > 0) {
    return [
      'Partial coverage: files were excluded, redacted, or omitted before review, so',
      'this report does not cover the entire repository.',
    ];
  }
  return [];
}

/** Render one suggestion (1-based position) as its own block of lines. */
function renderSuggestion(suggestion: Suggestion, position: number): string[] {
  return [
    `${position}. ${sanitizeText(suggestion.id)} — ${sanitizeText(suggestion.title)}`,
    `   Kind: ${suggestion.kind}`,
    `   Category: ${suggestion.category}`,
    `   Impact: ${suggestion.impact}`,
    `   Effort: ${suggestion.effort}`,
    `   Confidence: ${suggestion.confidence}`,
    `   Rationale: ${sanitizeText(suggestion.rationale)}`,
    `   Recommendation: ${sanitizeText(suggestion.recommendation)}`,
    `   Evidence: ${suggestion.evidence.map(formatEvidence).join(', ')}`,
  ];
}

/**
 * Render a validated suggestion report to plain text. Pure and deterministic:
 * the same report always yields the same string.
 */
export function renderSuggestionReport(report: SuggestionReport): string {
  const lines: string[] = [];

  lines.push(SUGGEST_REPORT_TITLE, '');
  lines.push(
    `Provider: ${sanitizeText(report.provider.id)} (${sanitizeText(report.provider.model)})`,
  );
  lines.push(`Schema version: ${report.schemaVersion}`);
  lines.push('');
  lines.push(
    'Advisory only: these are suggestions, not verified defects. The model may be',
    'wrong; verify each claim against the cited evidence before acting.',
  );
  lines.push('');

  lines.push(...section('Summary'));
  lines.push(sanitizeText(report.summary));
  lines.push('');

  lines.push(...section('Coverage'));
  const coverage = report.coverage;
  lines.push(`Inventoried files: ${coverage.inventoriedFiles}`);
  lines.push(`Eligible files: ${coverage.eligibleFiles}`);
  lines.push(`Submitted files: ${coverage.submittedFiles}`);
  lines.push(`Excluded files: ${coverage.excludedFiles}`);
  lines.push(`Redacted files: ${coverage.redactedFiles}`);
  lines.push(`Omitted files: ${coverage.omittedFiles}`);
  lines.push(`Estimated input tokens: ${coverage.estimatedInputTokens}`);
  lines.push(`Actual input tokens: ${coverage.actualInputTokens}`);
  const notice = partialCoverageNotice(coverage);
  if (notice.length > 0) {
    lines.push('', ...notice);
  }
  lines.push('');

  lines.push(...section('Limitations'));
  if (report.limitations.length === 0) {
    lines.push('None reported.');
  } else {
    for (const limitation of report.limitations) {
      lines.push(`- ${sanitizeText(limitation)}`);
    }
  }
  lines.push('');

  const ordered = [...report.suggestions].sort((a, b) => compareSuggestionIds(a.id, b.id));
  lines.push(...section(`Suggestions (${ordered.length})`));
  if (ordered.length === 0) {
    lines.push('No suggestions were reported for this repository.');
  } else {
    ordered.forEach((suggestion, index) => {
      if (index > 0) lines.push('');
      lines.push(...renderSuggestion(suggestion, index + 1));
    });
  }
  lines.push('');

  lines.push('Advisory suggestions only — not verified defects. The model may be wrong.');

  return lines.join('\n');
}
