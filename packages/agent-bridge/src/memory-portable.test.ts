import { describe, expect, it } from 'vitest';
import {
  exportMemoryPortable,
  importMemoryPortable,
  type PortableMemoryDocument,
} from './memory-portable.js';
import type { MemoryRowView } from './providers.js';

const VIEW = { project: 'acme', contextId: 'ct-1', estimatedTokens: 512 };

const ROWS: readonly MemoryRowView[] = [
  { id: 'row-b', kind: 'fact', summary: 'Second row', source: 'docs/B.md' },
  { id: 'row-a', kind: 'decision', summary: 'First row', source: 'docs/A.md' },
  { id: '', kind: 'warning', summary: 'Empty id row', source: 'docs/C.md' },
];

function jsonDocument(): PortableMemoryDocument {
  return importMemoryPortable(exportMemoryPortable(VIEW, ROWS, 'json'), 'json');
}

describe('exportMemoryPortable (P11-06)', () => {
  it('exports json as a single pretty-printed document with rows sorted by id', () => {
    const expected = `{
  "format": "planmo-memory",
  "schemaVersion": 1,
  "context": {
    "project": "acme",
    "contextId": "ct-1",
    "estimatedTokens": 512
  },
  "rows": [
    {
      "id": "",
      "kind": "warning",
      "summary": "Empty id row",
      "source": "docs/C.md"
    },
    {
      "id": "row-a",
      "kind": "decision",
      "summary": "First row",
      "source": "docs/A.md"
    },
    {
      "id": "row-b",
      "kind": "fact",
      "summary": "Second row",
      "source": "docs/B.md"
    }
  ]
}`;
    expect(exportMemoryPortable(VIEW, ROWS, 'json')).toBe(expected);
  });

  it('omits context entirely when the view is null (json)', () => {
    const text = exportMemoryPortable(null, ROWS, 'json');
    expect(text).not.toContain('"context"');
    expect(importMemoryPortable(text, 'json').context).toBeUndefined();
  });

  it('exports jsonl as a header line then one row per line, sorted', () => {
    const text = exportMemoryPortable(VIEW, ROWS, 'jsonl');
    const lines = text.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(
      '{"format":"planmo-memory","schemaVersion":1,"context":{"project":"acme","contextId":"ct-1","estimatedTokens":512}}',
    );
    expect(lines[1]).toBe(
      '{"id":"","kind":"warning","summary":"Empty id row","source":"docs/C.md"}',
    );
    expect(lines[2]).toBe(
      '{"id":"row-a","kind":"decision","summary":"First row","source":"docs/A.md"}',
    );
    expect(lines[3]).toBe(
      '{"id":"row-b","kind":"fact","summary":"Second row","source":"docs/B.md"}',
    );
  });

  it('exports jsonl without context when the view is null', () => {
    const lines = exportMemoryPortable(null, ROWS, 'jsonl').split('\n');
    expect(lines[0]).toBe('{"format":"planmo-memory","schemaVersion":1}');
  });

  it('exports markdown as a header and one bullet per row, sorted', () => {
    const text = exportMemoryPortable(VIEW, ROWS, 'markdown');
    expect(text).toBe(
      [
        '# planmo-memory (schemaVersion: 1)',
        '',
        'project: acme',
        'contextId: ct-1',
        'estimatedTokens: 512',
        '',
        '- [warning] Empty id row (source: docs/C.md) <!-- id:  -->',
        '- [decision] First row (source: docs/A.md) <!-- id: row-a -->',
        '- [fact] Second row (source: docs/B.md) <!-- id: row-b -->',
      ].join('\n'),
    );
  });

  it('replaces newlines with spaces in markdown summaries', () => {
    const rows: readonly MemoryRowView[] = [
      { id: 'nl', kind: 'fact', summary: 'line one\nline two', source: 's' },
    ];
    const text = exportMemoryPortable(VIEW, rows, 'markdown');
    expect(text).toContain('- [fact] line one line two (source: s) <!-- id: nl -->');
  });

  it('never emits timestamps and is byte-stable for identical input', () => {
    for (const format of ['json', 'jsonl', 'markdown'] as const) {
      const first = exportMemoryPortable(VIEW, ROWS, format);
      const second = exportMemoryPortable(VIEW, ROWS, format);
      expect(second).toBe(first);
      expect(first).not.toMatch(/timestamp|T\d{2}:\d{2}/i);
    }
  });

  it('does not mutate the caller rows array', () => {
    const input: readonly MemoryRowView[] = [
      { id: 'z', kind: 'fact', summary: 's', source: 'src' },
    ];
    exportMemoryPortable(VIEW, input, 'json');
    expect(input).toEqual([{ id: 'z', kind: 'fact', summary: 's', source: 'src' }]);
  });
});

describe('round-trip identity (export -> import)', () => {
  for (const format of ['json', 'jsonl', 'markdown'] as const) {
    it(`${format} round-trips a document with context`, () => {
      const text = exportMemoryPortable(VIEW, ROWS, format);
      const doc = importMemoryPortable(text, format);
      expect(exportMemoryPortable(doc.context ?? null, doc.rows, format)).toBe(text);
    });

    it(`${format} round-trips a document without context`, () => {
      const text = exportMemoryPortable(null, ROWS, format);
      const doc = importMemoryPortable(text, format);
      expect(doc.context).toBeUndefined();
      expect(exportMemoryPortable(null, doc.rows, format)).toBe(text);
    });
  }
});

describe('importMemoryPortable (P11-06)', () => {
  it('parses a valid json document', () => {
    const doc = jsonDocument();
    expect(doc.format).toBe('planmo-memory');
    expect(doc.schemaVersion).toBe(1);
    expect(doc.context).toEqual(VIEW);
    expect(doc.rows).toHaveLength(3);
  });

  it('rejects malformed json', () => {
    expect(() => importMemoryPortable('{ not json', 'json')).toThrow(/malformed JSON/);
  });

  it('rejects empty input', () => {
    expect(() => importMemoryPortable('', 'json')).toThrow(/empty/);
    expect(() => importMemoryPortable('   \n ', 'jsonl')).toThrow(/empty/);
    expect(() => importMemoryPortable('', 'markdown')).toThrow(/empty/);
  });

  it('rejects a wrong schemaVersion (stale) in json', () => {
    const stale = exportMemoryPortable(VIEW, ROWS, 'json').replace(
      '"schemaVersion": 1',
      '"schemaVersion": 2',
    );
    expect(() => importMemoryPortable(stale, 'json')).toThrow(/schemaVersion.*2.*expected 1/);
  });

  it('rejects a wrong format identifier in json', () => {
    const wrong = exportMemoryPortable(VIEW, ROWS, 'json').replace(
      '"planmo-memory"',
      '"claude-memory"',
    );
    expect(() => importMemoryPortable(wrong, 'json')).toThrow(/format "planmo-memory"/);
  });

  it('rejects rows that are not an array', () => {
    const bad = exportMemoryPortable(VIEW, ROWS, 'json').replace('"rows": [', '"rows": {');
    expect(() => importMemoryPortable(bad, 'json')).toThrow(/rows must be an array|malformed/i);
  });

  it('rejects a row with an invalid kind', () => {
    const bad = exportMemoryPortable(VIEW, ROWS, 'json').replace(
      '"kind": "warning"',
      '"kind": "poem"',
    );
    expect(() => importMemoryPortable(bad, 'json')).toThrow(/invalid kind/);
  });

  it('rejects a row with a non-string field', () => {
    const bad = exportMemoryPortable(VIEW, ROWS, 'json').replace(
      '"source": "docs/B.md"',
      '"source": 42',
    );
    expect(() => importMemoryPortable(bad, 'json')).toThrow(/string id\/kind\/summary\/source/);
  });

  it('rejects a non-object root', () => {
    expect(() => importMemoryPortable('[1,2]', 'json')).toThrow(/root must be an object/);
  });

  it('rejects a malformed context in json', () => {
    const bad = exportMemoryPortable(VIEW, ROWS, 'json').replace(
      '"estimatedTokens": 512',
      '"estimatedTokens": "big"',
    );
    expect(() => importMemoryPortable(bad, 'json')).toThrow(/context/);
  });

  it('parses a valid jsonl document (header + rows)', () => {
    const text = exportMemoryPortable(VIEW, ROWS, 'jsonl');
    const doc = importMemoryPortable(text, 'jsonl');
    expect(doc.context).toEqual(VIEW);
    expect(doc.rows.map((r) => r.id)).toEqual(['', 'row-a', 'row-b']);
  });

  it('accepts a jsonl document with only a header line (zero rows)', () => {
    const doc = importMemoryPortable('{"format":"planmo-memory","schemaVersion":1}', 'jsonl');
    expect(doc.rows).toEqual([]);
    expect(doc.context).toBeUndefined();
  });

  it('rejects malformed json in a jsonl row line', () => {
    const text = `{"format":"planmo-memory","schemaVersion":1}
{"id":"a","kind":"fact","summary":"s","source":"x"}
{ broken`;
    expect(() => importMemoryPortable(text, 'jsonl')).toThrow(/row line/);
  });

  it('rejects a wrong schemaVersion in the jsonl header', () => {
    expect(() =>
      importMemoryPortable('{"format":"planmo-memory","schemaVersion":9}', 'jsonl'),
    ).toThrow(/schemaVersion/);
  });

  it('parses a valid markdown document', () => {
    const text = exportMemoryPortable(VIEW, ROWS, 'markdown');
    const doc = importMemoryPortable(text, 'markdown');
    expect(doc.format).toBe('planmo-memory');
    expect(doc.schemaVersion).toBe(1);
    expect(doc.context).toEqual(VIEW);
    expect(doc.rows).toEqual([...ROWS].sort((a, b) => a.id.localeCompare(b.id)));
  });

  it('rejects a wrong markdown header', () => {
    const text = exportMemoryPortable(VIEW, ROWS, 'markdown').replace(
      '# planmo-memory (schemaVersion: 1)',
      '# planmo-memory (schemaVersion: 2)',
    );
    expect(() => importMemoryPortable(text, 'markdown')).toThrow(/expected header/);
  });

  it('rejects an unexpected line in markdown', () => {
    const text = exportMemoryPortable(VIEW, ROWS, 'markdown') + '\n## Notes';
    expect(() => importMemoryPortable(text, 'markdown')).toThrow(/unexpected line/);
  });

  it('rejects partial context metadata in markdown', () => {
    const text =
      '# planmo-memory (schemaVersion: 1)\n\nproject: acme\n\n- [fact] s (source: x) <!-- id: a -->';
    expect(() => importMemoryPortable(text, 'markdown')).toThrow(/partial context metadata/);
  });

  it('rejects an invalid kind in a markdown bullet', () => {
    const text = '# planmo-memory (schemaVersion: 1)\n\n- [poem] s (source: x) <!-- id: a -->';
    expect(() => importMemoryPortable(text, 'markdown')).toThrow(/invalid kind/);
  });

  it('defaults the row id to empty string when a markdown bullet has no id comment', () => {
    const text = '# planmo-memory (schemaVersion: 1)\n\n- [fact] s (source: x)';
    const doc = importMemoryPortable(text, 'markdown');
    expect(doc.rows).toEqual([{ id: '', kind: 'fact', summary: 's', source: 'x' }]);
  });
});
