/**
 * P12-11 — Memory index corruption & rebuild tests (CHG-001 hardening).
 *
 * Corruption/rebuild semantics over the persisted-memory paths owned by
 * @planmo/agent-bridge. Two deterministic failure semantics are proven:
 *
 *  - the VALIDATE path (importMemoryPortable): truncated/garbage/stale input
 *    throws a descriptive, deterministic Error — never crashes arbitrarily;
 *  - the DOCTOR path (createFileMemoryProvider): the same corrupt input is
 *    degraded to the standard explicit no-op rows (REQ-MEM-001) — the
 *    provider NEVER fabricates rows and NEVER crashes, and repeated reads of
 *    the same corrupt bytes yield the identical result (deterministic error
 *    state => rebuildable).
 *
 * Rebuild semantics: canonical export -> import round-trips byte-stably, and
 * replacing corrupt bytes with valid text immediately restores service.
 *
 * Pure scanner engine corruption tests live in @planmo/scanner
 * (packages/scanner/src/context/index-corruption-rebuild.test.ts) — this file
 * stays inside the agent-bridge package so the declared package boundary graph
 * (no scanner -> agent-bridge edge) is never violated.
 */

import { describe, expect, it } from 'vitest';

import {
  createFileMemoryProvider,
  exportMemoryPortable,
  importMemoryPortable,
  type MemoryRowView,
} from './index.js';

const VIEW = { project: 'acme', contextId: 'ct-1', estimatedTokens: 512 };

function row(
  id: string,
  kind: MemoryRowView['kind'],
  summary: string,
  source: string,
): MemoryRowView {
  return { id, kind, summary, source };
}

const NO_OP_ID = 'no-durable-memory';
const NO_OP_SOURCE = 'canonical-project-state';

/** Corrupt portable-memory fixtures: index/memory JSON that a crashed or
 *  truncated writer could leave behind. */
const CORRUPT_INPUTS: ReadonlyArray<{
  label: string;
  format: 'json' | 'jsonl' | 'markdown';
  text: string;
}> = Object.freeze([
  {
    label: 'truncated json document',
    format: 'json',
    text: '{"format":"planmo-memory","schemaVersion":1,"rows":',
  },
  {
    label: 'garbage binary as json',
    format: 'json',
    text: '\u0000\u0001\u0002\xff\xfe not json at all',
  },
  {
    label: 'wrong format identifier',
    format: 'json',
    text: '{"format":"planmo-other","schemaVersion":1,"rows":[]}',
  },
  {
    label: 'stale schemaVersion 2',
    format: 'json',
    text: '{"format":"planmo-memory","schemaVersion":2,"rows":[]}',
  },
  {
    label: 'rows not an array',
    format: 'json',
    text: '{"format":"planmo-memory","schemaVersion":1,"rows":{"id":"x"}}',
  },
  {
    label: 'truncated jsonl header',
    format: 'jsonl',
    text: '{"format":"planmo-memory","schemaVersion":1,"context"',
  },
  {
    label: 'truncated jsonl row',
    format: 'jsonl',
    text: '{"format":"planmo-memory","schemaVersion":1}\n{"id":"a","kind":"fact","summary":"trunc',
  },
  {
    label: 'garbage markdown line',
    format: 'markdown',
    text: '# planmo-memory (schemaVersion: 1)\n\nrandom stray line that is not a bullet',
  },
  {
    label: 'partial markdown metadata',
    format: 'markdown',
    text: '# planmo-memory (schemaVersion: 1)\n\nproject: acme\n\n- [fact] x (source: y) <!-- id: r1 -->',
  },
]);

// ---------------------------------------------------------------------------
// Validate path: importMemoryPortable throws deterministically.
// ---------------------------------------------------------------------------

describe('P12-11 validate path: corrupt memory input throws descriptive, deterministic errors', () => {
  it('rejects truncated/garbage JSON with a malformed-JSON error', () => {
    expect(() => importMemoryPortable(CORRUPT_INPUTS[0]!.text, 'json')).toThrow(/malformed JSON/);
    expect(() => importMemoryPortable(CORRUPT_INPUTS[1]!.text, 'json')).toThrow(/malformed JSON/);
  });

  it('rejects a wrong format identifier', () => {
    expect(() => importMemoryPortable(CORRUPT_INPUTS[2]!.text, 'json')).toThrow(
      /expected format "planmo-memory"/,
    );
  });

  it('rejects a stale schemaVersion', () => {
    expect(() => importMemoryPortable(CORRUPT_INPUTS[3]!.text, 'json')).toThrow(
      /unsupported schemaVersion/,
    );
  });

  it('rejects rows that are not an array', () => {
    expect(() => importMemoryPortable(CORRUPT_INPUTS[4]!.text, 'json')).toThrow(
      /rows must be an array/,
    );
  });

  it('rejects a truncated JSONL header and a truncated JSONL row line', () => {
    expect(() => importMemoryPortable(CORRUPT_INPUTS[5]!.text, 'jsonl')).toThrow(
      /malformed JSON in header line/,
    );
    expect(() => importMemoryPortable(CORRUPT_INPUTS[6]!.text, 'jsonl')).toThrow(
      /malformed JSON in row line 2/,
    );
  });

  it('rejects garbage markdown lines and partial context metadata', () => {
    expect(() => importMemoryPortable(CORRUPT_INPUTS[7]!.text, 'markdown')).toThrow(
      /unexpected line 3/,
    );
    expect(() => importMemoryPortable(CORRUPT_INPUTS[8]!.text, 'markdown')).toThrow(
      /partial context metadata/,
    );
  });

  it('every corrupt fixture has a deterministic error message (same text, same error)', () => {
    for (const fixture of CORRUPT_INPUTS) {
      const first = (() => {
        try {
          importMemoryPortable(fixture.text, fixture.format);
          return null;
        } catch (err) {
          return err instanceof Error ? err.message : String(err);
        }
      })();
      const second = (() => {
        try {
          importMemoryPortable(fixture.text, fixture.format);
          return null;
        } catch (err) {
          return err instanceof Error ? err.message : String(err);
        }
      })();
      expect(second, fixture.label).toBe(first);
      expect(first, fixture.label).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Doctor path: createFileMemoryProvider degrades without crashing/fabricating.
// ---------------------------------------------------------------------------

describe('P12-11 doctor path: corrupt memory input degrades to explicit no-op rows (REQ-MEM-001)', () => {
  it('never crashes and never fabricates: every corrupt fixture yields exactly the no-op row', async () => {
    for (const fixture of CORRUPT_INPUTS) {
      const provider = createFileMemoryProvider({
        format: fixture.format,
        readText: async () => fixture.text,
      });
      const rows = await provider.relevant('ct-1', 10);
      expect(rows, fixture.label).toHaveLength(1);
      expect(rows[0]?.id, fixture.label).toBe(NO_OP_ID);
      expect(rows[0]?.source, fixture.label).toBe(NO_OP_SOURCE);
      expect(rows[0]?.summary, fixture.label).toContain('No durable memory records');
    }
  });

  it('repeated reads of the same corrupt bytes return the identical result', async () => {
    const provider = createFileMemoryProvider({
      format: 'jsonl',
      readText: async () => CORRUPT_INPUTS[6]!.text,
    });
    const first = await provider.relevant('ct-1', 10);
    const second = await provider.relevant('ct-1', 10);
    expect(second).toEqual(first);
  });

  it('a readText rejection is an ordinary state, never a crash', async () => {
    const provider = createFileMemoryProvider({
      format: 'json',
      readText: async () => {
        throw new Error('ENOENT: memory file missing');
      },
    });
    const rows = await provider.relevant('ct-1', 10);
    expect(rows[0]?.id).toBe(NO_OP_ID);
  });

  it('empty source text yields the no-op row for every format', async () => {
    for (const format of ['json', 'jsonl', 'markdown'] as const) {
      const provider = createFileMemoryProvider({ format, readText: async () => '' });
      const rows = await provider.relevant('ct-1', 10);
      expect(rows[0]?.id, format).toBe(NO_OP_ID);
    }
  });

  it('valid rows are never fabricated and never mutated (rows are exactly the source rows)', async () => {
    const rows = [
      row('r-b', 'fact', 'beta', 'docs/b.md'),
      row('r-a', 'fact', 'alpha', 'docs/a.md'),
    ];
    const provider = createFileMemoryProvider({
      format: 'json',
      readText: async () => exportMemoryPortable(VIEW, rows, 'json'),
    });
    const served = await provider.relevant('ct-1', 10);
    expect(served).toEqual([
      { id: 'r-a', kind: 'fact', summary: 'alpha', source: 'docs/a.md' },
      { id: 'r-b', kind: 'fact', summary: 'beta', source: 'docs/b.md' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Rebuild semantics.
// ---------------------------------------------------------------------------

describe('P12-11 rebuild: canonical export-import round-trips and corrupt stores rebuild', () => {
  const rows = [
    row('r2', 'decision', 'decision two', 'docs/ADR-002.md'),
    row('r1', 'fact', 'fact one', 'docs/a.md'),
  ];

  it('export -> import reproduces the same rows for every format (rebuild from canonical bytes)', () => {
    for (const format of ['json', 'jsonl', 'markdown'] as const) {
      const text = exportMemoryPortable(VIEW, rows, format);
      const imported = importMemoryPortable(text, format);
      expect(
        imported.rows.map((r) => r.id),
        format,
      ).toEqual(['r1', 'r2']);
      expect(imported.rows, format).toEqual([
        { id: 'r1', kind: 'fact', summary: 'fact one', source: 'docs/a.md' },
        { id: 'r2', kind: 'decision', summary: 'decision two', source: 'docs/ADR-002.md' },
      ]);
    }
  });

  it('export of the same rows is byte-identical (stable rebuild output)', () => {
    const a = exportMemoryPortable(VIEW, rows, 'json');
    const b = exportMemoryPortable(VIEW, rows, 'json');
    expect(b).toBe(a);
  });

  it('a corrupt store rebuilds: replacing corrupt bytes with valid text restores service', async () => {
    const corrupt = createFileMemoryProvider({
      format: 'json',
      readText: async () => CORRUPT_INPUTS[0]!.text,
    });
    expect((await corrupt.relevant('ct-1', 10))[0]?.id).toBe(NO_OP_ID);

    const validText = exportMemoryPortable(VIEW, rows, 'json');
    const healed = createFileMemoryProvider({ format: 'json', readText: async () => validText });
    const served = await healed.relevant('ct-1', 10);
    expect(served.map((r) => r.id)).toEqual(['r1', 'r2']);
  });
});
