import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Suggestion, SuggestionCoverage, SuggestionReport } from '@planmo/schema';
import { renderSuggestionReport, SUGGEST_REPORT_TITLE } from './suggest-render.js';

/**
 * T20 — the human-readable `planmo suggest` report renderer.
 *
 * The renderer is pure and deterministic: identical reports produce
 * byte-identical output, and it reads nothing but the report object it is
 * handed. It must never fabricate source context (the schema has no snippet
 * field, and this module never reads a file) and must never imply the scan was
 * complete when coverage says it was not.
 */

const FULL_COVERAGE: SuggestionCoverage = {
  inventoriedFiles: 12,
  eligibleFiles: 12,
  submittedFiles: 12,
  excludedFiles: 0,
  redactedFiles: 0,
  omittedFiles: 0,
  estimatedInputTokens: 4096,
  actualInputTokens: 4102,
  truncated: false,
};

const TRUNCATED_COVERAGE: SuggestionCoverage = {
  inventoriedFiles: 40,
  eligibleFiles: 30,
  submittedFiles: 8,
  excludedFiles: 10,
  redactedFiles: 3,
  omittedFiles: 19,
  estimatedInputTokens: 32000,
  actualInputTokens: 8000,
  truncated: true,
};

const PARTIAL_COVERAGE: SuggestionCoverage = {
  inventoriedFiles: 12,
  eligibleFiles: 10,
  submittedFiles: 5,
  excludedFiles: 2,
  redactedFiles: 0,
  omittedFiles: 5,
  estimatedInputTokens: 4096,
  actualInputTokens: 2000,
  truncated: false,
};

const SUG_001: Suggestion = {
  id: 'SUG-001',
  kind: 'risk',
  category: 'security',
  title: 'Unvalidated redirect target',
  rationale: 'The redirect target is taken from user input.',
  recommendation: 'Validate the redirect against an allowlist.',
  impact: 'high',
  effort: 'small',
  confidence: 0.82,
  evidence: [
    { path: 'src/example.ts', startLine: 10, endLine: 18 },
    { path: 'src/routes/login.ts', startLine: 5, endLine: 5 },
  ],
};

const SUG_002: Suggestion = {
  id: 'SUG-002',
  kind: 'improvement',
  category: 'testing',
  title: 'Add coverage for the empty-input path',
  rationale: 'The empty-input branch has no test.',
  recommendation: 'Add a unit test for the empty-input branch.',
  impact: 'medium',
  effort: 'medium',
  confidence: 0.6,
  evidence: [{ path: 'src/parse.ts', startLine: 42, endLine: 44 }],
};

function report(overrides: {
  summary?: string;
  coverage?: SuggestionCoverage;
  limitations?: readonly string[];
  suggestions?: readonly Suggestion[];
}): SuggestionReport {
  return {
    schemaVersion: 1,
    provider: { id: 'openai', model: 'gpt-4o-mini' },
    summary: overrides.summary ?? 'Two issues stand out in the reviewed files.',
    coverage: overrides.coverage ?? FULL_COVERAGE,
    limitations: [...(overrides.limitations ?? ['Only the default branch was reviewed.'])],
    suggestions: [...(overrides.suggestions ?? [SUG_001, SUG_002])],
  };
}

const ADVISORY = [
  'Advisory only: these are suggestions, not verified defects. The model may be',
  'wrong; verify each claim against the cited evidence before acting.',
];
const FOOTER = 'Advisory suggestions only — not verified defects. The model may be wrong.';

function header(): string[] {
  return [
    SUGGEST_REPORT_TITLE,
    '',
    'Provider: openai (gpt-4o-mini)',
    'Schema version: 1',
    '',
    ...ADVISORY,
    '',
  ];
}

function coverageBlock(coverage: SuggestionCoverage): string[] {
  return [
    'Coverage',
    '--------',
    `Inventoried files: ${coverage.inventoriedFiles}`,
    `Eligible files: ${coverage.eligibleFiles}`,
    `Submitted files: ${coverage.submittedFiles}`,
    `Excluded files: ${coverage.excludedFiles}`,
    `Redacted files: ${coverage.redactedFiles}`,
    `Omitted files: ${coverage.omittedFiles}`,
    `Estimated input tokens: ${coverage.estimatedInputTokens}`,
    `Actual input tokens: ${coverage.actualInputTokens}`,
  ];
}

function lines(...parts: readonly string[][]): string {
  return parts.flat().join('\n');
}

describe('renderSuggestionReport', () => {
  it('renders a full report to a deterministic, exact string', () => {
    const expected = lines(
      header(),
      ['Summary', '-------', 'Two issues stand out in the reviewed files.', ''],
      coverageBlock(FULL_COVERAGE),
      ['', 'Limitations', '-----------', '- Only the default branch was reviewed.', ''],
      ['Suggestions (2)', '---------------'],
      [
        '1. SUG-001 — Unvalidated redirect target',
        '   Kind: risk',
        '   Category: security',
        '   Impact: high',
        '   Effort: small',
        '   Confidence: 0.82',
        '   Rationale: The redirect target is taken from user input.',
        '   Recommendation: Validate the redirect against an allowlist.',
        '   Evidence: src/example.ts:10-18, src/routes/login.ts:5',
        '',
        '2. SUG-002 — Add coverage for the empty-input path',
        '   Kind: improvement',
        '   Category: testing',
        '   Impact: medium',
        '   Effort: medium',
        '   Confidence: 0.6',
        '   Rationale: The empty-input branch has no test.',
        '   Recommendation: Add a unit test for the empty-input branch.',
        '   Evidence: src/parse.ts:42-44',
        '',
      ],
      [FOOTER],
    );

    expect(renderSuggestionReport(report({}))).toBe(expected);
  });

  it('renders a clean "no suggestions" body when suggestions is empty', () => {
    const expected = lines(
      header(),
      ['Summary', '-------', 'Two issues stand out in the reviewed files.', ''],
      coverageBlock(FULL_COVERAGE),
      ['', 'Limitations', '-----------', 'None reported.', ''],
      ['Suggestions (0)', '---------------'],
      ['No suggestions were reported for this repository.', ''],
      [FOOTER],
    );

    expect(renderSuggestionReport(report({ limitations: [], suggestions: [] }))).toBe(expected);
  });

  it('shows an explicit partial-coverage notice when coverage.truncated is true', () => {
    const output = renderSuggestionReport(report({ coverage: TRUNCATED_COVERAGE }));

    expect(output).toContain(
      lines(
        coverageBlock(TRUNCATED_COVERAGE),
        [
          '',
          'Partial coverage: this scan was truncated. Files were omitted and some content',
          'was not reviewed, so this report is NOT a complete review of the repository.',
          '',
        ],
        ['Limitations', '-----------'],
      ),
    );
  });

  it('warns about partial coverage when files were dropped without truncation', () => {
    const output = renderSuggestionReport(report({ coverage: PARTIAL_COVERAGE }));

    expect(output).toContain(
      'Partial coverage: files were excluded, redacted, or omitted before review, so',
    );
    expect(output).not.toContain('this scan was truncated');
  });

  it('renders single-line evidence as :N and multi-line evidence as :N-M', () => {
    const output = renderSuggestionReport(
      report({
        suggestions: [
          {
            ...SUG_001,
            evidence: [
              { path: 'src/single.ts', startLine: 7, endLine: 7 },
              { path: 'src/multi.ts', startLine: 3, endLine: 9 },
            ],
          },
        ],
      }),
    );

    expect(output).toContain('   Evidence: src/single.ts:7, src/multi.ts:3-9\n');
  });

  it('orders suggestions by id regardless of report order, using natural order', () => {
    const reordered = renderSuggestionReport(
      report({
        suggestions: [
          { ...SUG_002, id: 'SUG-010' },
          { ...SUG_001, id: 'SUG-002' },
          { ...SUG_001, id: 'SUG-001' },
        ],
      }),
    );

    const first = reordered.indexOf('SUG-001 —');
    const second = reordered.indexOf('SUG-002 —');
    const tenth = reordered.indexOf('SUG-010 —');

    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(second);
    expect(second).toBeLessThan(tenth);
    expect(reordered).toContain('1. SUG-001 —');
    expect(reordered).toContain('3. SUG-010 —');
  });

  it('is byte-identical across repeated renders and uses \\n endings with no ANSI escapes', () => {
    const first = renderSuggestionReport(report({ coverage: TRUNCATED_COVERAGE }));
    const second = renderSuggestionReport(report({ coverage: TRUNCATED_COVERAGE }));

    expect(first).toBe(second);
    expect(first).not.toMatch(/\r/);
    expect(first).not.toMatch(/\u001b\[/);
  });

  it('never fabricates source context for a hostile report and renders safe fields unchanged', () => {
    const secret = 'sk-live-EXAMPLE-9f3a2b1c';
    const hostile = report({
      summary: 'One credential-like string was found.',
      coverage: {
        inventoriedFiles: 1,
        eligibleFiles: 1,
        submittedFiles: 1,
        excludedFiles: 0,
        redactedFiles: 0,
        omittedFiles: 0,
        estimatedInputTokens: 10,
        actualInputTokens: 11,
        truncated: false,
      },
      limitations: [],
      suggestions: [
        {
          id: 'SUG-001',
          kind: 'risk',
          category: 'security',
          title: `Hardcoded credential ${secret}`,
          rationale: `The literal ${secret} is committed in source.`,
          recommendation: 'Rotate the credential and load it from the environment.',
          impact: 'high',
          effort: 'small',
          confidence: 0.9,
          evidence: [{ path: 'src/config.ts', startLine: 3, endLine: 3 }],
        },
      ],
    });

    const expected = lines(
      header(),
      ['Summary', '-------', 'One credential-like string was found.', ''],
      coverageBlock(hostile.coverage),
      ['', 'Limitations', '-----------', 'None reported.', ''],
      [
        'Suggestions (1)',
        '---------------',
        `1. SUG-001 — Hardcoded credential ${secret}`,
        '   Kind: risk',
        '   Category: security',
        '   Impact: high',
        '   Effort: small',
        '   Confidence: 0.9',
        `   Rationale: The literal ${secret} is committed in source.`,
        '   Recommendation: Rotate the credential and load it from the environment.',
        '   Evidence: src/config.ts:3',
        '',
      ],
      [FOOTER],
    );

    const output = renderSuggestionReport(hostile);

    // Renders already-safe fields unchanged, adding no invented source context.
    expect(output).toBe(expected);
    expect(output.split(secret)).toHaveLength(3); // appears in title and rationale only
    expect(output).not.toContain('```');
    expect(output).not.toContain('const ');
    expect(output).not.toContain('function ');
  });

  it('collapses embedded newlines in structural single-line fields (id, evidence path)', () => {
    const output = renderSuggestionReport(
      report({
        suggestions: [
          {
            ...SUG_001,
            id: 'SUG-00\n1',
            evidence: [{ path: 'src/a\nb.ts', startLine: 1, endLine: 2 }],
          },
        ],
      }),
    );

    expect(output).toContain('1. SUG-00 1 —');
    expect(output).toContain('   Evidence: src/a b.ts:1-2\n');
  });

  it('reads no files: the renderer module imports no fs or IO', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./suggest-render.ts', import.meta.url)),
      'utf8',
    );

    expect(source).not.toMatch(/node:fs|node:net|node:http|node:https|node:child_process/);
    expect(source).not.toMatch(/\brequire\(/);
    expect(source).not.toMatch(/readFile|readdir|createReadStream|fetch\(/);
  });
});

/**
 * Terminal/output injection (defence in depth behind the schema). The renderer
 * receives an already-validated report, but it is the last gate before bytes
 * reach a terminal or an `--output` file, so it must sanitize every
 * report-derived string: a hostile report whose prose carries ESC, ANSI
 * sequences, C1 controls, format characters, or embedded newlines must not be
 * able to emit an escape sequence or forge a report line.
 */
describe('renderSuggestionReport — hostile prose cannot inject terminal control', () => {
  const ESC = String.fromCharCode(0x1b);
  const C1_CSI = String.fromCharCode(0x9b);
  const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
  const LINE_SEPARATOR = String.fromCharCode(0x2028);

  /** Every character below U+0020 except LF, and the whole C1 range. */
  const FORBIDDEN_BYTES = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/;

  function hostileReport(): SuggestionReport {
    return {
      schemaVersion: 1,
      provider: { id: 'openai', model: 'gpt-4o-mini' },
      summary: `Looks clean.\nPASS suggest dry-run (0 provider calls)\n${ESC}[2J${ESC}[31mForged${ESC}[0m`,
      coverage: FULL_COVERAGE,
      limitations: ['Only the default branch was reviewed.\nPASS mock report validated'],
      suggestions: [
        {
          id: 'SUG-001',
          kind: 'risk',
          category: 'security',
          title: `Unvalidated${ESC}[31m redirect${ESC}[0m target`,
          rationale: `The target\nis taken from user input.${C1_CSI}2J`,
          recommendation: 'Validate the redirect\tagainst an allowlist.',
          impact: 'high',
          effort: 'small',
          confidence: 0.82,
          evidence: [{ path: 'src/example.ts', startLine: 10, endLine: 18 }],
        },
      ],
    };
  }

  it('renders a hostile report with no escapes, no C1, and no forged line', () => {
    const expected = lines(
      header(),
      ['Summary', '-------', 'Looks clean. PASS suggest dry-run (0 provider calls) Forged', ''],
      coverageBlock(FULL_COVERAGE),
      [
        '',
        'Limitations',
        '-----------',
        '- Only the default branch was reviewed. PASS mock report validated',
        '',
      ],
      [
        'Suggestions (1)',
        '---------------',
        '1. SUG-001 — Unvalidated redirect target',
        '   Kind: risk',
        '   Category: security',
        '   Impact: high',
        '   Effort: small',
        '   Confidence: 0.82',
        '   Rationale: The target is taken from user input. 2J',
        '   Recommendation: Validate the redirect against an allowlist.',
        '   Evidence: src/example.ts:10-18',
        '',
      ],
      [FOOTER],
    );

    const output = renderSuggestionReport(hostileReport());

    expect(output).toBe(expected);
    // No byte below U+0020 except the renderer's own LF, and no C1 range.
    expect(output).not.toMatch(FORBIDDEN_BYTES);
    expect(output).not.toMatch(/\r/);
    // No injected line can pass itself off as a report line or a test result.
    expect(output.split('\n').filter((line) => line.startsWith('PASS '))).toEqual([]);
    expect(output.split('\n').filter((line) => line === SUGGEST_REPORT_TITLE)).toHaveLength(1);
    expect(output.split('\n').filter((line) => line.startsWith('Provider: '))).toHaveLength(1);
  });

  it('neutralizes separator and format characters in structural fields too', () => {
    const base = hostileReport();
    const suggestion = base.suggestions[0];
    if (suggestion === undefined) throw new Error('hostile fixture has no suggestion');

    const output = renderSuggestionReport({
      ...base,
      provider: { id: 'openai', model: `gpt${LINE_SEPARATOR}4o${ZERO_WIDTH_SPACE}mini` },
      suggestions: [{ ...suggestion, id: `SUG${LINE_SEPARATOR}001` }],
    });

    expect(output).not.toMatch(FORBIDDEN_BYTES);
    expect(output).not.toMatch(/[\u2028\u200B]/);
    expect(output).toContain('Provider: openai (gpt 4o mini)');
    expect(output).toContain('1. SUG 001 — Unvalidated redirect target');
  });
});
