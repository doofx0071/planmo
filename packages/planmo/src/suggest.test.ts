import { describe, expect, it } from 'vitest';

import { ProviderError, type ModelProvider, type ProviderErrorKind } from '@planmo/ai';
import { constructorReader } from '@planmo/scanner';
import type { FileReader, VirtualTree } from '@planmo/scanner';

import { runSuggest } from './suggest.js';

/**
 * T18 — suggestion orchestration and evidence verification.
 *
 * The orchestration composes the T15 context engine, the T17 prompt builder, a
 * `ModelProvider` in text mode, and the T16 `SuggestionReportSchema`. These tests
 * drive every seam with an in-memory repository and an injected provider, so the
 * whole path is offline, deterministic, and filesystem-free.
 */

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

/**
 * A tiny virtual repo. Line counts are load-bearing:
 *   README.md     -> 3 lines
 *   src/index.ts  -> 3 lines
 *   src/util.ts   -> 3 lines
 *   assets/logo.bin -> skipped (binary: contains a NUL byte), so it stays in the
 *                      inventory but is never submitted.
 */
const TREE: VirtualTree = {
  'README.md': '# Demo\nsecond line\nthird line\n',
  'assets/logo.bin': 'PNG\0binarydata',
  src: null,
  'src/index.ts': 'export const x = 1;\nexport const y = 2;\nexport const z = 3;\n',
  'src/util.ts': 'export function util() {\n  return 42;\n}\n',
};

/** The 4 files the scan inventories; 3 are included, 1 is skipped as binary. */
const INVENTORIED_FILES = 4;
const INCLUDED_FILES = 3;

interface RecordedProvider {
  provider: ModelProvider;
  calls: number;
  lastPrompt: string | null;
  lastSystem: string | null;
}

/** A provider that returns fixed text and records how it was called. */
function textProvider(text: string): RecordedProvider {
  const state: RecordedProvider = {
    calls: 0,
    lastPrompt: null,
    lastSystem: null,
    provider: {
      id: 'mock',
      model: 'mock-1',
      capabilities: { structuredOutput: false, streaming: false, toolCalling: false },
      async generate(request) {
        state.calls += 1;
        state.lastPrompt = request.prompt;
        state.lastSystem = request.system ?? null;
        return {
          text,
          usage: { inputTokens: request.prompt.length, outputTokens: text.length },
          model: 'mock-1',
          providerId: 'mock',
          simulated: true,
        };
      },
    },
  };
  return state;
}

/** A provider that always fails with the given `ProviderError` kind. */
function failingProvider(kind: ProviderErrorKind): RecordedProvider {
  const state: RecordedProvider = {
    calls: 0,
    lastPrompt: null,
    lastSystem: null,
    provider: {
      id: 'mock',
      model: 'mock-1',
      capabilities: { structuredOutput: false, streaming: false, toolCalling: false },
      async generate() {
        state.calls += 1;
        throw new ProviderError(kind, `simulated ${kind} failure`);
      },
    },
  };
  return state;
}

function readerFor(tree: VirtualTree): FileReader {
  return constructorReader(tree);
}

/** One schema-valid suggestion, overridable per test. */
function suggestion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'SUG-001',
    kind: 'observation',
    category: 'testing',
    title: 'The demo module has no tests',
    rationale: 'src/index.ts exports three constants but nothing exercises them.',
    recommendation: 'Add a unit test that asserts the exported constants.',
    impact: 'low',
    effort: 'small',
    confidence: 0.8,
    evidence: [{ path: 'src/index.ts', startLine: 1, endLine: 3 }],
    ...overrides,
  };
}

/**
 * A report the model might return. Its `provider` and `coverage` are deliberately
 * WRONG: PlanMo supplies the authoritative values (the T17 system prompt says so),
 * so `runSuggest` must overwrite them.
 */
function reportJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    provider: { id: 'model-claimed', model: 'model-claimed-model' },
    summary: 'A tiny demo repository with one source module.',
    coverage: {
      inventoriedFiles: 999,
      eligibleFiles: 999,
      submittedFiles: 999,
      excludedFiles: 999,
      redactedFiles: 999,
      omittedFiles: 999,
      estimatedInputTokens: 999,
      actualInputTokens: 999,
      truncated: true,
    },
    limitations: [],
    suggestions: [suggestion()],
    ...overrides,
  });
}

/** Run the orchestration against the standard tree with a fixed response text. */
function run(text: string) {
  const recorded = textProvider(text);
  return runSuggest({ provider: recorded.provider, reader: readerFor(TREE) }).then((result) => ({
    result,
    recorded,
  }));
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('runSuggest — a valid report', () => {
  it('returns the validated report and reports a valid outcome', async () => {
    const { result } = await run(reportJson());
    expect(result.ok).toBe(true);
    expect(result.validation).toBe('valid');
    expect(result.diagnostics).toEqual([]);
    expect(result.report).not.toBeNull();
    expect(result.report?.suggestions).toHaveLength(1);
    expect(result.report?.suggestions[0]?.id).toBe('SUG-001');
    expect(result.raw).toBe(reportJson());
  });

  it('calls the provider once in text mode with the bounded prompt', async () => {
    const { recorded } = await run(reportJson());
    expect(recorded.calls).toBe(1);
    expect(recorded.lastSystem).toContain('untrusted');
    expect(recorded.lastSystem).toContain('advisory');
    expect(recorded.lastPrompt).toContain('src/index.ts');
  });

  it('supplies the authoritative provider identity, not the model claim', async () => {
    const { result } = await run(reportJson());
    expect(result.provider).toEqual({ id: 'mock', model: 'mock-1' });
    expect(result.report?.provider).toEqual({ id: 'mock', model: 'mock-1' });
  });

  it('supplies the authoritative coverage, not the model claim', async () => {
    const { result } = await run(reportJson());
    expect(result.report?.coverage.inventoriedFiles).toBe(INVENTORIED_FILES);
    expect(result.report?.coverage.submittedFiles).toBe(INCLUDED_FILES);
    expect(result.report?.coverage.actualInputTokens).toBe(result.usage.inputTokens);
  });
});

// ---------------------------------------------------------------------------
// Fail-closed parsing and schema
// ---------------------------------------------------------------------------

describe('runSuggest — fail closed', () => {
  it('rejects malformed JSON with a diagnostic and no report', async () => {
    const { result } = await run('not json at all');
    expect(result.ok).toBe(false);
    expect(result.report).toBeNull();
    expect(result.validation).toBe('malformed-json');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('SUG-101');
  });

  it('rejects an unknown field (strict schema)', async () => {
    const { result } = await run(reportJson({ smuggled: true }));
    expect(result.ok).toBe(false);
    expect(result.report).toBeNull();
    expect(result.validation).toBe('schema-invalid');
    expect(result.diagnostics[0]?.code).toBe('SUG-102');
  });

  it('rejects confidence outside [0, 1]', async () => {
    const { result } = await run(reportJson({ suggestions: [suggestion({ confidence: 1.5 })] }));
    expect(result.ok).toBe(false);
    expect(result.report).toBeNull();
    expect(result.validation).toBe('schema-invalid');
    expect(result.diagnostics.some((d) => d.code === 'SUG-102')).toBe(true);
  });

  it('rejects a suggestion with no evidence', async () => {
    const { result } = await run(reportJson({ suggestions: [suggestion({ evidence: [] })] }));
    expect(result.ok).toBe(false);
    expect(result.report).toBeNull();
    expect(result.validation).toBe('schema-invalid');
  });
});

// ---------------------------------------------------------------------------
// Evidence verification against the scanned inventory
// ---------------------------------------------------------------------------

describe('runSuggest — evidence verification', () => {
  it('rejects an evidence path that is not in the scanned inventory', async () => {
    const { result } = await run(
      reportJson({
        suggestions: [
          suggestion({ evidence: [{ path: 'src/ghost.ts', startLine: 1, endLine: 1 }] }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.report).toBeNull();
    expect(result.validation).toBe('evidence-invalid');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('SUG-103');
    expect(result.diagnostics[0]?.path).toBe('src/ghost.ts');
  });

  it('rejects a line range beyond the real file length', async () => {
    // src/index.ts is 3 lines; 10 is not.
    const { result } = await run(
      reportJson({
        suggestions: [
          suggestion({ evidence: [{ path: 'src/index.ts', startLine: 2, endLine: 10 }] }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.report).toBeNull();
    expect(result.validation).toBe('evidence-invalid');
    expect(result.diagnostics[0]?.code).toBe('SUG-105');
    expect(result.diagnostics[0]?.path).toBe('src/index.ts');
    expect(result.diagnostics[0]?.endLine).toBe(10);
    expect(result.diagnostics[0]?.message).toContain('3 line');
  });

  it('rejects evidence citing a file that was not submitted for review', async () => {
    // assets/logo.bin is in the inventory but skipped (binary), so it can never
    // have been read by the model.
    const { result } = await run(
      reportJson({
        suggestions: [
          suggestion({ evidence: [{ path: 'assets/logo.bin', startLine: 1, endLine: 1 }] }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.report).toBeNull();
    expect(result.validation).toBe('evidence-invalid');
    expect(result.diagnostics[0]?.code).toBe('SUG-104');
    expect(result.diagnostics[0]?.path).toBe('assets/logo.bin');
    expect(result.diagnostics[0]?.message).toContain('binary');
  });

  it('accepts a line range that fits exactly at the file end', async () => {
    const { result } = await run(
      reportJson({
        suggestions: [suggestion({ evidence: [{ path: 'README.md', startLine: 3, endLine: 3 }] })],
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.validation).toBe('valid');
  });
});

// ---------------------------------------------------------------------------
// Provider failures write nothing
// ---------------------------------------------------------------------------

describe('runSuggest — provider failures', () => {
  it.each<ProviderErrorKind>(['timeout', 'auth', 'rate-limit', 'aborted'])(
    'returns a failure result for a %s error and writes nothing',
    async (kind) => {
      const tree: VirtualTree = { ...TREE };
      const before = JSON.stringify(tree);
      const recorded = failingProvider(kind);
      const reader = readerFor(tree);

      const result = await runSuggest({ provider: recorded.provider, reader });

      expect(result.ok).toBe(false);
      expect(result.report).toBeNull();
      expect(result.validation).toBe('provider-error');
      expect(result.raw).toBe('');
      expect(recorded.calls).toBe(1);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.code).toBe('SUG-100');
      expect(result.diagnostics[0]?.message).toContain(kind);
      // Nothing was written anywhere: the virtual repo is untouched and no
      // `.planmo` workspace was created.
      expect(JSON.stringify(tree)).toBe(before);
      await expect(reader.exists('.planmo')).resolves.toBe(false);
      expect(result.coverage.totalFiles).toBe(INVENTORIED_FILES);
    },
  );
});

// ---------------------------------------------------------------------------
// Coverage and determinism
// ---------------------------------------------------------------------------

describe('runSuggest — coverage and determinism', () => {
  it('reports the scanner coverage that matches the virtual repo', async () => {
    const { result } = await run(reportJson());
    expect(result.coverage.totalFiles).toBe(INVENTORIED_FILES);
    expect(result.coverage.included).toBe(INCLUDED_FILES);
    expect(result.coverage.skippedByReason.binary).toBe(1);
    expect(result.coverage.skippedByReason.excluded).toBe(0);
    expect(result.coverage.batchCount).toBe(1);
    expect(result.coverage.truncated).toBe(false);
  });

  it('is deterministic for identical input', async () => {
    const first = await run(reportJson());
    const second = await run(reportJson());
    expect(first.result).toEqual(second.result);
  });
});
