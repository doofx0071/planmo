import { describe, expect, it } from 'vitest';

import type { FileReader, VirtualTree } from '../contracts.js';
import type { ConstructorReaderOptions } from '../scan/virtual-reader.js';
import { constructorReader } from '../scan/virtual-reader.js';
import {
  estimateSuggestionTokens,
  SUGGESTION_CONTEXT_DEFAULTS,
  suggestionContextEngine,
} from './suggestion-context.js';
import type { SuggestionContextOptions, SuggestionContextResult } from './suggestion-context.js';

/** Build suggestion context from a virtual tree (root = tree root). */
function build(
  tree: VirtualTree,
  options?: SuggestionContextOptions,
  readerOptions?: ConstructorReaderOptions,
): Promise<SuggestionContextResult> {
  return suggestionContextEngine().build('', constructorReader(tree, readerOptions), options);
}

/** Wrap a reader so every readFile path is recorded (still a ConstructorReader). */
function recordingReader(inner: FileReader): { reader: FileReader; reads: string[] } {
  const reads: string[] = [];
  const reader: FileReader = {
    readDir: (path) => inner.readDir(path),
    readFile: (path) => {
      reads.push(path);
      return inner.readFile(path);
    },
    stat: (path) => inner.stat(path),
    exists: (path) => inner.exists(path),
  };
  return { reader, reads };
}

function repeat(char: string, length: number): string {
  return char.repeat(length);
}

// ---------------------------------------------------------------------------
// Token estimate + defaults
// ---------------------------------------------------------------------------

describe('estimateSuggestionTokens', () => {
  it('uses the documented deterministic ceil(UTF-16 length / 4) estimate', () => {
    expect(estimateSuggestionTokens('')).toBe(0);
    expect(estimateSuggestionTokens('abcd')).toBe(1);
    expect(estimateSuggestionTokens('abcde')).toBe(2);
  });

  it('exposes the default budgets (32k per run, 8k per request)', () => {
    expect(SUGGESTION_CONTEXT_DEFAULTS).toEqual({ maxRunTokens: 32_000, maxRequestTokens: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Inventory, default excludes, ordering, determinism
// ---------------------------------------------------------------------------

describe('suggestionContextEngine.build — inventory and excludes', () => {
  const tree: VirtualTree = {
    'README.md': '# hi\n',
    '.hidden.ts': 'export const h = 3;\n',
    src: null,
    'src/index.ts': 'export const x = 1;\n',
    'src/lib': null,
    'src/lib/util.ts': 'export const u = 2;\n',
    node_modules: null,
    'node_modules/dep': null,
    'node_modules/dep/index.js': 'module.exports = 1;\n',
  };

  it('inventories every scanned file and applies DEFAULT_EXCLUDES', async () => {
    const result = await build(tree);
    expect(result.coverage.totalFiles).toBe(4);
    expect(result.coverage.included).toBe(4);
    expect(result.files.map((file) => file.path)).toEqual([
      '.hidden.ts',
      'README.md',
      'src/index.ts',
      'src/lib/util.ts',
    ]);
    const allPaths = [...result.files.map((f) => f.path), ...result.skipped.map((s) => s.path)];
    expect(allPaths.some((path) => path.startsWith('node_modules'))).toBe(false);
  });

  it('sorts files and batches by POSIX path and is deterministic for identical input', async () => {
    const first = await build(tree);
    const second = await build(tree);
    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    const paths = first.files.map((file) => file.path);
    expect([...paths].sort()).toEqual(paths);
  });

  it('returns a frozen, serializable result (no functions)', async () => {
    const result = await build(tree);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.batches)).toBe(true);
    expect(Object.isFrozen(result.coverage)).toBe(true);
    expect(Object.isFrozen(result.files[0])).toBe(true);
    for (const value of Object.values(result)) {
      expect(typeof value).not.toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// Symlink escape handling
// ---------------------------------------------------------------------------

describe('suggestionContextEngine.build — symlink escape', () => {
  it('never reads a symlink and never follows an escaping target', async () => {
    const tree: VirtualTree = { src: null, 'src/index.ts': 'export const x = 1;\n' };
    const reader = constructorReader(tree, {
      symlinks: new Map([
        ['escape', '/etc/passwd'],
        ['inside', 'src/index.ts'],
      ]),
    });
    const result = await suggestionContextEngine().build('', reader);
    expect(result.coverage.totalFiles).toBe(1);
    expect(result.files.map((file) => file.path)).toEqual(['src/index.ts']);
    // Neither the escaping nor the in-root symlink is a readable file.
    const skippedPaths = result.skipped.map((entry) => entry.path);
    expect(skippedPaths).not.toContain('escape');
    expect(skippedPaths).not.toContain('inside');
  });
});

// ---------------------------------------------------------------------------
// Binary + oversize skip with reasons
// ---------------------------------------------------------------------------

describe('suggestionContextEngine.build — skip reasons', () => {
  it('records binary and oversize files as skipped with explicit reasons', async () => {
    const tree: VirtualTree = {
      'bin.dat': 'abc\0def',
      'big.ts': repeat('x', 200),
      'ok.ts': 'export const ok = 1;\n',
    };
    const result = await build(tree, { scan: { maxFileBytes: 64 } }, { detectBinary: true });

    expect(result.coverage.totalFiles).toBe(3);
    expect(result.coverage.included).toBe(1);
    expect(result.coverage.skippedByReason.binary).toBe(1);
    expect(result.coverage.skippedByReason.oversize).toBe(1);
    expect(result.skipped).toEqual([
      { path: 'big.ts', reason: 'oversize', detail: expect.any(String) },
      { path: 'bin.dat', reason: 'binary', detail: expect.any(String) },
    ]);
    expect(result.files.map((file) => file.path)).toEqual(['ok.ts']);
  });
});

// ---------------------------------------------------------------------------
// Per-file redaction
// ---------------------------------------------------------------------------

describe('suggestionContextEngine.build — redaction', () => {
  it('redacts secrets before they enter a batch and reports per-file counts', async () => {
    const secret = 'supersecretvalue';
    const tree: VirtualTree = {
      'config.ts': `const API_KEY = "${secret}";\nexport const keep = 1;\n`,
      'plain.ts': 'export const plain = 1;\n',
    };
    const result = await build(tree);

    const config = result.files.find((file) => file.path === 'config.ts');
    expect(config).toBeDefined();
    expect(config?.content).not.toContain(secret);
    expect(config?.content).toContain('[REDACTED]');
    expect(config?.redactionCount).toBeGreaterThanOrEqual(1);

    const plain = result.files.find((file) => file.path === 'plain.ts');
    expect(plain?.redactionCount).toBe(0);

    expect(result.coverage.redactionCount).toBeGreaterThanOrEqual(1);
    for (const batch of result.batches) {
      for (const file of batch.files) expect(file.content).not.toContain(secret);
    }
  });
});

// ---------------------------------------------------------------------------
// Reuse of the context layer engines
// ---------------------------------------------------------------------------

describe('suggestionContextEngine.build — context-layer reuse', () => {
  it('derives symbols, lexical markers and a context map from the same files', async () => {
    const result = await build({
      'README.md': '# hi\n',
      'package.json': JSON.stringify({ name: 'x', bin: { x: 'cli.js' } }),
      src: null,
      'src/index.ts': "import { util } from './lib/util.js';\nexport const x = 1; // TODO tidy\n",
      'src/lib': null,
      'src/lib/util.ts': 'export const util = 2;\n',
    });

    expect(
      result.symbols.some((symbol) => symbol.kind === 'import' && symbol.file === 'src/index.ts'),
    ).toBe(true);
    const lexical = result.lexical.find((entry) => entry.file === 'src/index.ts');
    expect(lexical?.markers).toContain('TODO');
    expect(result.contextMap.entryPoints).toContain('src/');
    // Manifest evidence flows through stack detection into the context map.
    expect(result.contextMap.entryPoints).toContain('package.json#bin');
  });
});

// ---------------------------------------------------------------------------
// Token budgeting: per-request split + per-run truncation reporting
// ---------------------------------------------------------------------------

describe('suggestionContextEngine.build — token budgeting', () => {
  function manyFiles(count: number, chars: number): VirtualTree {
    const tree: VirtualTree = {};
    for (let index = 0; index < count; index += 1) {
      tree[`f${String(index).padStart(3, '0')}.ts`] = repeat('x', chars);
    }
    return tree;
  }

  it('splits batches at the 8k per-request budget', async () => {
    const result = await build(manyFiles(10, 4000), { maxRunTokens: 100_000 });

    expect(result.coverage.included).toBe(10);
    expect(result.batches.length).toBe(2);
    for (const batch of result.batches) {
      expect(batch.estimatedTokens).toBeLessThanOrEqual(
        SUGGESTION_CONTEXT_DEFAULTS.maxRequestTokens,
      );
    }
    expect(result.batches[0]?.files.length).toBe(8);
    expect(result.batches[1]?.files.length).toBe(2);
    expect(result.coverage.batchCount).toBe(2);
  });

  it('honours a configurable per-request budget', async () => {
    const result = await build(manyFiles(4, 4000), { maxRequestTokens: 1000 });
    expect(result.batches.length).toBe(4);
    for (const batch of result.batches) expect(batch.estimatedTokens).toBeLessThanOrEqual(1000);
  });

  it('drops files past the 32k run budget and reports truncation (never silent)', async () => {
    const result = await build(manyFiles(40, 4000));

    expect(result.coverage.included).toBe(32);
    expect(result.coverage.droppedByBudget).toBe(8);
    expect(result.coverage.skippedByReason.budget).toBe(8);
    expect(result.coverage.truncated).toBe(true);
    expect(result.coverage.totalFiles).toBe(40);
    expect(result.skipped.filter((entry) => entry.reason === 'budget')).toHaveLength(8);
    // No file is ever both included and skipped.
    const included = new Set(result.files.map((file) => file.path));
    for (const entry of result.skipped) expect(included.has(entry.path)).toBe(false);
  });

  it('truncates a single file that exceeds the per-request budget and flags it', async () => {
    const result = await build({ 'huge.ts': repeat('y', 40_000) });
    expect(result.batches.length).toBe(1);
    const file = result.files[0];
    expect(file?.truncated).toBe(true);
    expect(file?.estimatedTokens).toBe(SUGGESTION_CONTEXT_DEFAULTS.maxRequestTokens);
    expect(result.coverage.truncatedFiles).toBe(1);
    expect(result.coverage.truncated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Security: excluded paths are never read
// ---------------------------------------------------------------------------

describe('suggestionContextEngine.build — excluded paths are never read', () => {
  it('skips .env by path only, without ever reading its content', async () => {
    const tree: VirtualTree = {
      '.env': 'DATABASE_URL=postgres://user:pw@host/db\n',
      '.env.example': 'DATABASE_URL=postgres://localhost/dev\n',
      src: null,
      'src/index.ts': 'export const x = 1;\n',
    };
    // A reader that THROWS if the excluded path is ever read.
    const inner = constructorReader(tree, { failures: { readFile: ['.env'] } });
    const { reader, reads } = recordingReader(inner);

    const result = await suggestionContextEngine().build('', reader);

    const env = result.skipped.find((entry) => entry.path === '.env');
    // 'excluded' (not 'unreadable') proves the reader was never asked for it.
    expect(env?.reason).toBe('excluded');
    expect(reads).not.toContain('.env');
    expect(result.files.map((file) => file.path)).toContain('.env.example');
    expect(result.files.map((file) => file.path)).toContain('src/index.ts');
  });
});
