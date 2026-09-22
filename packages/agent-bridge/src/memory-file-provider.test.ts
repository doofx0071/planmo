import { describe, expect, it } from 'vitest';
import { exportMemoryPortable } from './memory-portable.js';
import { createFileMemoryProvider } from './memory-file-provider.js';
import type { MemoryRowView } from './providers.js';

const VIEW = { project: 'acme', contextId: 'ct-1', estimatedTokens: 512 };

function rowsWithContext(source: string): readonly MemoryRowView[] {
  return [
    { id: 'row-z', kind: 'lesson', summary: 'Zebra lesson', source },
    { id: 'row-a', kind: 'fact', summary: 'Alpha fact', source },
    { id: '', kind: 'warning', summary: 'Dropped: empty id', source },
    { id: 'row-m', kind: 'decision', summary: 'Middle decision', source },
  ];
}

describe('createFileMemoryProvider (P11-06)', () => {
  it('returns the standard no-op rows when the source text is empty', async () => {
    for (const format of ['json', 'jsonl', 'markdown'] as const) {
      const provider = createFileMemoryProvider({ format, readText: async () => '' });
      const rows = await provider.relevant('ct-1', 10);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe('no-durable-memory');
      expect(rows[0]?.source).toBe('canonical-project-state');
    }
  });

  it('returns the standard no-op rows when the source text is unparseable (REQ-MEM-001)', async () => {
    const provider = createFileMemoryProvider({
      format: 'json',
      readText: async () => '{ definitely not json',
    });
    const rows = await provider.relevant('ct-1', 10);
    expect(rows[0]?.id).toBe('no-durable-memory');
  });

  it('returns no-op rows when the source declares a stale schemaVersion', async () => {
    const stale = exportMemoryPortable(VIEW, rowsWithContext('s'), 'json').replace(
      '"schemaVersion": 1',
      '"schemaVersion": 3',
    );
    const provider = createFileMemoryProvider({ format: 'json', readText: async () => stale });
    const rows = await provider.relevant('ct-1', 10);
    expect(rows[0]?.id).toBe('no-durable-memory');
  });

  it('returns no-op rows when readText rejects', async () => {
    const provider = createFileMemoryProvider({
      format: 'json',
      readText: async () => {
        throw new Error('no such file');
      },
    });
    const rows = await provider.relevant('ct-1', 10);
    expect(rows[0]?.id).toBe('no-durable-memory');
  });

  it('filters empty ids, sorts by id, and slices to the caller limit', async () => {
    const text = exportMemoryPortable(VIEW, rowsWithContext('docs'), 'json');
    const provider = createFileMemoryProvider({ format: 'json', readText: async () => text });
    const rows = await provider.relevant('ct-1', 2);
    expect(rows.map((r) => r.id)).toEqual(['row-a', 'row-m']);
  });

  it('never exceeds the configured limit when it is smaller than the requested limit', async () => {
    const text = exportMemoryPortable(VIEW, rowsWithContext('docs'), 'json');
    const provider = createFileMemoryProvider({
      format: 'json',
      limit: 1,
      readText: async () => text,
    });
    const rows = await provider.relevant('ct-1', 10);
    expect(rows.map((r) => r.id)).toEqual(['row-a']);
  });

  it('never fabricates rows: returned rows are exactly the source rows (REQ-MEM-001)', async () => {
    const text = exportMemoryPortable(VIEW, rowsWithContext('docs'), 'json');
    const provider = createFileMemoryProvider({ format: 'json', readText: async () => text });
    const rows = await provider.relevant('ct-1', 100);
    expect(rows).toEqual([
      { id: 'row-a', kind: 'fact', summary: 'Alpha fact', source: 'docs' },
      { id: 'row-m', kind: 'decision', summary: 'Middle decision', source: 'docs' },
      { id: 'row-z', kind: 'lesson', summary: 'Zebra lesson', source: 'docs' },
    ]);
  });

  it('serves jsonl sources', async () => {
    const text = exportMemoryPortable(VIEW, rowsWithContext('docs'), 'jsonl');
    const provider = createFileMemoryProvider({ format: 'jsonl', readText: async () => text });
    const rows = await provider.relevant('ct-1', 10);
    expect(rows.map((r) => r.id)).toEqual(['row-a', 'row-m', 'row-z']);
  });

  it('serves markdown sources', async () => {
    const text = exportMemoryPortable(VIEW, rowsWithContext('docs'), 'markdown');
    const provider = createFileMemoryProvider({ format: 'markdown', readText: async () => text });
    const rows = await provider.relevant('ct-1', 10);
    expect(rows.map((r) => r.id)).toEqual(['row-a', 'row-m', 'row-z']);
  });

  it('returns no-op rows when every row has an empty id', async () => {
    const provider = createFileMemoryProvider({
      format: 'json',
      readText: async () =>
        JSON.stringify(
          {
            format: 'planmo-memory',
            schemaVersion: 1,
            rows: [{ id: '', kind: 'fact', summary: 'x', source: 'y' }],
          },
          null,
          2,
        ),
    });
    const rows = await provider.relevant('ct-1', 10);
    expect(rows[0]?.id).toBe('no-durable-memory');
  });
});
