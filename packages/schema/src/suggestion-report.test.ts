import { describe, expect, it } from 'vitest';
import * as schemaModule from './index.js';

/**
 * T16 — versioned, evidence-backed `planmo suggest` report contract.
 *
 * These tests freeze the *contract*, not the implementation: the enum lists
 * and the report shape are written out here explicitly so a schema change
 * that silently widens or narrows the domain fails loudly.
 */

type ParseResult = { success: boolean; data?: unknown; error?: unknown };
type ParseSchema = { safeParse(value: unknown): ParseResult };

type LooseObject = Record<string, unknown>;
type LooseEvidence = Record<string, unknown>;
type LooseSuggestion = Record<string, unknown> & { evidence: LooseEvidence[] };
interface LooseReport {
  schemaVersion: unknown;
  provider: LooseObject;
  summary: unknown;
  coverage: LooseObject;
  limitations: unknown;
  suggestions: LooseSuggestion[];
  [key: string]: unknown;
}

/** Canonical contract (plan line 104 + task 16). */
const KINDS = ['observation', 'risk', 'improvement', 'feature-idea'] as const;
const CATEGORIES = [
  'product',
  'architecture',
  'frontend',
  'backend',
  'data',
  'design',
  'accessibility',
  'security',
  'reliability',
  'performance',
  'testing',
  'documentation',
  'developer-experience',
] as const;
const IMPACTS = ['low', 'medium', 'high'] as const;
const EFFORTS = ['small', 'medium', 'large'] as const;

const BACKSLASH = String.fromCharCode(92);
const NUL = String.fromCharCode(0);
const BIDI_OVERRIDE = String.fromCharCode(0x202e);

function reportSchema(): ParseSchema {
  const schema = Reflect.get(schemaModule, 'SuggestionReportSchema') as ParseSchema | undefined;
  expect(schema, 'SuggestionReportSchema must be exported from @planmo/schema').toBeDefined();
  if (schema === undefined) throw new Error('SuggestionReportSchema is not exported');
  return schema;
}

function exportedEnum(name: string): readonly string[] {
  const values = Reflect.get(schemaModule, name) as readonly string[] | undefined;
  expect(values, `${name} must be exported from @planmo/schema`).toBeDefined();
  if (values === undefined) throw new Error(`${name} is not exported`);
  return values;
}

function omitKey<T extends LooseObject>(object: T, key: string): T {
  const copy: LooseObject = { ...object };
  delete copy[key];
  return copy as T;
}

function validReport(): LooseReport {
  return {
    schemaVersion: 1,
    provider: { id: 'openai', model: 'gpt-4.1' },
    summary: 'A short, evidence-based overview of the repository.',
    coverage: {
      inventoriedFiles: 120,
      eligibleFiles: 90,
      submittedFiles: 80,
      excludedFiles: 20,
      redactedFiles: 3,
      omittedFiles: 10,
      estimatedInputTokens: 30000,
      actualInputTokens: 27500,
      truncated: false,
    },
    limitations: ['Only files inside the configured token budget were submitted.'],
    suggestions: [
      {
        id: 'SUG-001',
        kind: 'risk',
        category: 'security',
        title: 'Environment secrets are read at module load',
        rationale: 'Reading process.env at import time spreads configuration state across modules.',
        recommendation: 'Move environment reads into a single validated configuration module.',
        impact: 'high',
        effort: 'small',
        confidence: 0.82,
        evidence: [{ path: 'src/example.ts', startLine: 10, endLine: 18 }],
      },
    ],
  };
}

function firstSuggestion(report: LooseReport): LooseSuggestion {
  const suggestion = report.suggestions[0];
  if (suggestion === undefined) throw new Error('test fixture has no suggestion');
  return suggestion;
}

function firstEvidence(suggestion: LooseSuggestion): LooseEvidence {
  const evidence = suggestion.evidence[0];
  if (evidence === undefined) throw new Error('test fixture has no evidence');
  return evidence;
}

function withReport(transform: (report: LooseReport) => LooseReport): LooseReport {
  return transform(validReport());
}

function withSuggestion(transform: (suggestion: LooseSuggestion) => LooseSuggestion): LooseReport {
  return withReport((report) => {
    report.suggestions = [transform(firstSuggestion(report))];
    return report;
  });
}

function withEvidence(transform: (evidence: LooseEvidence) => LooseEvidence): LooseReport {
  return withSuggestion((suggestion) => {
    suggestion.evidence = [transform(firstEvidence(suggestion))];
    return suggestion;
  });
}

function parseSuccess(report: LooseReport): boolean {
  return reportSchema().safeParse(report).success;
}

/** The exact example from the plan (docs/PLAN-ai-setup-and-codebase-suggestions.md lines 68-102). */
const PLAN_EXAMPLE_JSON = `{
  "schemaVersion": 1,
  "provider": { "id": "openai", "model": "<selected-model-id>" },
  "summary": "<short, evidence-based overview>",
  "coverage": {
    "inventoriedFiles": 0,
    "eligibleFiles": 0,
    "submittedFiles": 0,
    "excludedFiles": 0,
    "redactedFiles": 0,
    "omittedFiles": 0,
    "estimatedInputTokens": 0,
    "actualInputTokens": 0,
    "truncated": false
  },
  "limitations": [],
  "suggestions": [
    {
      "id": "SUG-001",
      "kind": "risk",
      "category": "security",
      "title": "<specific, non-alarmist title>",
      "rationale": "<why the evidence matters>",
      "recommendation": "<specific next step, not an automatic patch>",
      "impact": "high",
      "effort": "small",
      "confidence": 0.82,
      "evidence": [
        { "path": "src/example.ts", "startLine": 10, "endLine": 18 }
      ]
    }
  ]
}`;

describe('suggestion report enums', () => {
  it('exports the frozen kind, category, impact, and effort lists', () => {
    expect(exportedEnum('SUGGESTION_KINDS')).toEqual([...KINDS]);
    expect(exportedEnum('SUGGESTION_CATEGORIES')).toEqual([...CATEGORIES]);
    expect(exportedEnum('SUGGESTION_IMPACTS')).toEqual([...IMPACTS]);
    expect(exportedEnum('SUGGESTION_EFFORTS')).toEqual([...EFFORTS]);
  });
});

describe('SuggestionReportSchema — valid reports', () => {
  it('accepts a fully-populated report and is round-trip stable', () => {
    const result = reportSchema().safeParse(validReport());

    expect(result.success).toBe(true);
    expect(result.data).toEqual(validReport());
  });

  it("accepts the plan's example shape after JSON.parse", () => {
    expect(reportSchema().safeParse(JSON.parse(PLAN_EXAMPLE_JSON)).success).toBe(true);
  });

  it.each([...KINDS])('accepts kind %s', (kind) => {
    const report = withSuggestion((suggestion) => {
      suggestion.kind = kind;
      return suggestion;
    });

    expect(parseSuccess(report)).toBe(true);
  });

  it.each([...CATEGORIES])('accepts category %s', (category) => {
    const report = withSuggestion((suggestion) => {
      suggestion.category = category;
      return suggestion;
    });

    expect(parseSuccess(report)).toBe(true);
  });

  it.each([...IMPACTS])('accepts impact %s', (impact) => {
    const report = withSuggestion((suggestion) => {
      suggestion.impact = impact;
      return suggestion;
    });

    expect(parseSuccess(report)).toBe(true);
  });

  it.each([...EFFORTS])('accepts effort %s', (effort) => {
    const report = withSuggestion((suggestion) => {
      suggestion.effort = effort;
      return suggestion;
    });

    expect(parseSuccess(report)).toBe(true);
  });

  it('accepts confidence at both closed-interval boundaries', () => {
    expect(
      parseSuccess(
        withSuggestion((suggestion) => {
          suggestion.confidence = 0;
          return suggestion;
        }),
      ),
    ).toBe(true);
    expect(
      parseSuccess(
        withSuggestion((suggestion) => {
          suggestion.confidence = 1;
          return suggestion;
        }),
      ),
    ).toBe(true);
  });

  it('accepts nested and single-segment relative POSIX paths', () => {
    expect(
      parseSuccess(
        withEvidence((evidence) => {
          evidence.path = 'packages/schema/src/index.ts';
          return evidence;
        }),
      ),
    ).toBe(true);
    expect(
      parseSuccess(
        withEvidence((evidence) => {
          evidence.path = 'README.md';
          return evidence;
        }),
      ),
    ).toBe(true);
  });

  it('accepts an empty suggestions array (a clean scan may find nothing)', () => {
    const report = withReport((value) => {
      value.suggestions = [];
      return value;
    });

    expect(parseSuccess(report)).toBe(true);
  });

  it('accepts a single-line evidence range (startLine === endLine)', () => {
    expect(
      parseSuccess(
        withEvidence((evidence) => {
          evidence.startLine = 7;
          evidence.endLine = 7;
          return evidence;
        }),
      ),
    ).toBe(true);
  });
});

describe('SuggestionReportSchema — unknown fields are rejected (strict, no snippet smuggling)', () => {
  const cases: Array<[string, (report: LooseReport) => LooseReport]> = [
    [
      'root',
      (report) => {
        report.extra = true;
        return report;
      },
    ],
    [
      'provider',
      (report) => {
        report.provider.extra = 'x';
        return report;
      },
    ],
    [
      'coverage',
      (report) => {
        report.coverage.extra = 1;
        return report;
      },
    ],
    [
      'suggestion',
      (report) =>
        withSuggestion((suggestion) => {
          suggestion.extra = 'x';
          return suggestion;
        }),
    ],
    [
      'evidence',
      (report) =>
        withEvidence((evidence) => {
          evidence.extra = 'x';
          return evidence;
        }),
    ],
    [
      'quoted snippet',
      (report) =>
        withSuggestion((suggestion) => {
          suggestion.snippet = 'const secret = "x";';
          return suggestion;
        }),
    ],
    [
      'raw code',
      (report) =>
        withSuggestion((suggestion) => {
          suggestion.code = 'const secret = "x";';
          return suggestion;
        }),
    ],
    [
      'evidence snippet',
      (report) =>
        withEvidence((evidence) => {
          evidence.snippet = 'const secret = "x";';
          return evidence;
        }),
    ],
  ];

  it.each(cases)('rejects an unknown %s field', (_label, transform) => {
    expect(parseSuccess(transform(validReport()))).toBe(false);
  });
});

describe('SuggestionReportSchema — versioning', () => {
  const versions: unknown[] = [0, 2, '1', null, undefined];

  it.each(versions)('rejects schemaVersion %s', (version) => {
    const report = withReport((value) => {
      value.schemaVersion = version;
      return value;
    });

    expect(parseSuccess(report)).toBe(false);
  });
});

describe('SuggestionReportSchema — provider, summary, and limitations', () => {
  const cases: Array<[string, (report: LooseReport) => LooseReport]> = [
    [
      'empty provider id',
      (report) => {
        report.provider.id = '';
        return report;
      },
    ],
    [
      'blank provider id',
      (report) => {
        report.provider.id = '   ';
        return report;
      },
    ],
    [
      'missing provider model',
      (report) => {
        report.provider = omitKey(report.provider, 'model');
        return report;
      },
    ],
    [
      'empty summary',
      (report) => {
        report.summary = '';
        return report;
      },
    ],
    [
      'non-string summary',
      (report) => {
        report.summary = 42;
        return report;
      },
    ],
    [
      'limitations not an array',
      (report) => {
        report.limitations = 'none';
        return report;
      },
    ],
    [
      'empty limitation entry',
      (report) => {
        report.limitations = [''];
        return report;
      },
    ],
    ['missing coverage block', (report) => omitKey(report, 'coverage')],
    [
      'suggestions not an array',
      (report) => {
        report.suggestions = {} as unknown as LooseSuggestion[];
        return report;
      },
    ],
  ];

  it.each(cases)('rejects %s', (_label, transform) => {
    expect(parseSuccess(transform(validReport()))).toBe(false);
  });
});

describe('SuggestionReportSchema — coverage counters', () => {
  const cases: Array<[string, (report: LooseReport) => LooseReport]> = [
    [
      'negative inventoriedFiles',
      (report) => {
        report.coverage.inventoriedFiles = -1;
        return report;
      },
    ],
    [
      'fractional submittedFiles',
      (report) => {
        report.coverage.submittedFiles = 1.5;
        return report;
      },
    ],
    [
      'NaN estimatedInputTokens',
      (report) => {
        report.coverage.estimatedInputTokens = Number.NaN;
        return report;
      },
    ],
    [
      'infinite actualInputTokens',
      (report) => {
        report.coverage.actualInputTokens = Number.POSITIVE_INFINITY;
        return report;
      },
    ],
    [
      'string excludedFiles',
      (report) => {
        report.coverage.excludedFiles = '20';
        return report;
      },
    ],
    [
      'missing omittedFiles',
      (report) => {
        report.coverage = omitKey(report.coverage, 'omittedFiles');
        return report;
      },
    ],
    [
      'non-boolean truncated',
      (report) => {
        report.coverage.truncated = 'false';
        return report;
      },
    ],
  ];

  it.each(cases)('rejects %s', (_label, transform) => {
    expect(parseSuccess(transform(validReport()))).toBe(false);
  });
});

describe('SuggestionReportSchema — evidence path safety', () => {
  const cases: Array<[string, string]> = [
    ['absolute POSIX path', '/etc/passwd'],
    ['Windows drive path', 'C:/Users/x/secret.ts'],
    ['Windows drive backslash path', `C:${BACKSLASH}Users${BACKSLASH}x${BACKSLASH}secret.ts`],
    ['backslash separator', `src${BACKSLASH}example.ts`],
    ['empty path segment', 'src//example.ts'],
    ['trailing slash', 'src/'],
    ['leading ./ segment', './src/example.ts'],
    ['parent traversal', '../secret.ts'],
    ['embedded traversal', 'src/../secret.ts'],
    ['current-dir segment', 'src/./example.ts'],
    ['NUL control character', `src/${NUL}example.ts`],
    ['bidi format character', `src/${BIDI_OVERRIDE}evil.ts`],
    ['empty string', ''],
    ['blank string', '   '],
  ];

  it.each(cases)('rejects %s', (_label, path) => {
    expect(
      parseSuccess(
        withEvidence((evidence) => {
          evidence.path = path;
          return evidence;
        }),
      ),
    ).toBe(false);
  });

  it('rejects a missing or non-string evidence path', () => {
    expect(parseSuccess(withEvidence((evidence) => omitKey(evidence, 'path')))).toBe(false);
    expect(
      parseSuccess(
        withEvidence((evidence) => {
          evidence.path = 42;
          return evidence;
        }),
      ),
    ).toBe(false);
  });
});

describe('SuggestionReportSchema — evidence line ranges', () => {
  const cases: Array<[string, (evidence: LooseEvidence) => LooseEvidence]> = [
    [
      'startLine below 1',
      (evidence) => {
        evidence.startLine = 0;
        return evidence;
      },
    ],
    [
      'negative startLine',
      (evidence) => {
        evidence.startLine = -3;
        return evidence;
      },
    ],
    [
      'endLine before startLine',
      (evidence) => {
        evidence.endLine = 5;
        return evidence;
      },
    ],
    [
      'fractional startLine',
      (evidence) => {
        evidence.startLine = 1.5;
        return evidence;
      },
    ],
    [
      'string endLine',
      (evidence) => {
        evidence.endLine = '18';
        return evidence;
      },
    ],
    ['missing endLine', (evidence) => omitKey(evidence, 'endLine')],
  ];

  it.each(cases)('rejects %s', (_label, transform) => {
    expect(parseSuccess(withEvidence(transform))).toBe(false);
  });
});

describe('SuggestionReportSchema — confidence bounds', () => {
  const values = [
    -0.01,
    1.01,
    2,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];

  it.each(values)('rejects confidence %s', (confidence) => {
    expect(
      parseSuccess(
        withSuggestion((suggestion) => {
          suggestion.confidence = confidence;
          return suggestion;
        }),
      ),
    ).toBe(false);
  });

  it('rejects a non-numeric confidence', () => {
    expect(
      parseSuccess(
        withSuggestion((suggestion) => {
          suggestion.confidence = '0.5';
          return suggestion;
        }),
      ),
    ).toBe(false);
  });
});

describe('SuggestionReportSchema — suggestion shape', () => {
  it('rejects a suggestion with no evidence entries', () => {
    const report = withSuggestion((suggestion) => {
      suggestion.evidence = [];
      return suggestion;
    });

    expect(parseSuccess(report)).toBe(false);
  });

  it('rejects a suggestion missing its evidence field', () => {
    expect(parseSuccess(withSuggestion((suggestion) => omitKey(suggestion, 'evidence')))).toBe(
      false,
    );
  });

  const cases: Array<[string, (suggestion: LooseSuggestion) => LooseSuggestion]> = [
    [
      'unknown kind',
      (suggestion) => {
        suggestion.kind = 'audit';
        return suggestion;
      },
    ],
    [
      'unknown category',
      (suggestion) => {
        suggestion.category = 'legal';
        return suggestion;
      },
    ],
    [
      'unknown impact',
      (suggestion) => {
        suggestion.impact = 'critical';
        return suggestion;
      },
    ],
    [
      'unknown effort',
      (suggestion) => {
        suggestion.effort = 'huge';
        return suggestion;
      },
    ],
    [
      'empty id',
      (suggestion) => {
        suggestion.id = '';
        return suggestion;
      },
    ],
    [
      'empty title',
      (suggestion) => {
        suggestion.title = '';
        return suggestion;
      },
    ],
    [
      'empty rationale',
      (suggestion) => {
        suggestion.rationale = '';
        return suggestion;
      },
    ],
    [
      'empty recommendation',
      (suggestion) => {
        suggestion.recommendation = '';
        return suggestion;
      },
    ],
  ];

  it.each(cases)('rejects a suggestion with %s', (_label, transform) => {
    expect(parseSuccess(withSuggestion(transform))).toBe(false);
  });
});
