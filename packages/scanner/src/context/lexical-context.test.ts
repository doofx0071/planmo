import { describe, expect, it } from 'vitest';
import { lexicalContext, MAX_TOKENS_PER_FILE } from './lexical-context.js';

describe('lexical-context: identifier histogram', () => {
  it('counts identifiers and sorts count desc then token asc', async () => {
    const result = await lexicalContext.index(new Map([['src/a.ts', 'const foo = foo + bar;']]));
    expect(result).toEqual([
      {
        file: 'src/a.ts',
        tokens: [
          { token: 'foo', count: 2 },
          { token: 'bar', count: 1 },
          { token: 'const', count: 1 },
        ],
        markers: [],
      },
    ]);
  });

  it('drops the fixed stopword set', async () => {
    const stopwords = 'the and or of to in for is are be was were it this that with on at by from as';
    const result = await lexicalContext.index(new Map([['stop.txt', stopwords]]));
    expect(result[0]!.tokens).toEqual([]);
  });

  it('keeps stopwords when they are part of a longer identifier or differ in case', async () => {
    const result = await lexicalContext.index(new Map([['case.ts', 'The the theorem isThis at_at']]));
    expect(result[0]!.tokens).toEqual([
      { token: 'The', count: 1 },
      { token: 'at_at', count: 1 },
      { token: 'isThis', count: 1 },
      { token: 'theorem', count: 1 },
    ]);
  });

  it('tokenizes letter/underscore-led identifiers only', async () => {
    // Unanchored per contract: the 'abc' tail of 123abc still matches.
    const result = await lexicalContext.index(new Map([['u.ts', '_private foo_1 123abc']]));
    expect(result[0]!.tokens.map((t) => t.token)).toEqual(['_private', 'abc', 'foo_1']);
  });

  it('caps tokens per file at 512 and keeps deterministic order', async () => {
    const lines: string[] = [];
    for (let i = 0; i < 600; i += 1) lines.push(`token_${i}`);
    const result = await lexicalContext.index(new Map([['big.ts', lines.join(' ')]]) as ReadonlyMap<string, string>);
    const tokens = result[0]!.tokens;
    expect(tokens).toHaveLength(MAX_TOKENS_PER_FILE);
    expect(tokens[0]!.count).toBe(1);
    // Sorted: count desc (all 1) then token asc; token_0 first overall.
    expect(tokens[0]!.token).toBe('token_0');
    const sorted = [...tokens].map((t) => t.token).every((t, i, arr) => i === 0 || arr[i - 1]! < t);
    expect(sorted).toBe(true);
  });
});

describe('lexical-context: doc markers', () => {
  it('collects TODO/FIXME/HACK markers, case-insensitive, deduplicated and sorted', async () => {
    const result = await lexicalContext.index(
      new Map([
        [
          'src/a.ts',
          '// TODO: add retry\n// todo: lower\n// FIXME: leak\n// hack later\n// TODO again\n',
        ],
      ]),
    );
    expect(result[0]!.markers).toEqual(['FIXME', 'HACK', 'TODO']);
  });

  it('does not match markers inside longer words or non-boundary positions', async () => {
    const result = await lexicalContext.index(
      new Map([['src/b.ts', '// HACKSAW is fine, TODO_ITEM too, notodo, FIXME\n']]),
    );
    expect(result[0]!.markers).toEqual(['FIXME']);
  });

  it('returns empty markers when none present', async () => {
    const result = await lexicalContext.index(new Map([['src/c.ts', 'const a = 1;']]));
    expect(result[0]!.markers).toEqual([]);
  });
});

describe('lexical-context: ordering and determinism', () => {
  it('sorts files by path ascending', async () => {
    const result = await lexicalContext.index(
      new Map([
        ['z.txt', 'zed'],
        ['a.txt', 'alpha alpha'],
        ['m.txt', 'mid'],
      ]),
    );
    expect(result.map((r) => r.file)).toEqual(['a.txt', 'm.txt', 'z.txt']);
    expect(result[0]!.tokens).toEqual([{ token: 'alpha', count: 2 }]);
  });

  it('handles empty files', async () => {
    const result = await lexicalContext.index(new Map([['empty.txt', '']]));
    expect(result).toEqual([{ file: 'empty.txt', tokens: [], markers: [] }]);
    expect(result).toEqual([{ markers: [], tokens: [], file: 'empty.txt' }]);
  });

  it('is deterministic across repeated calls', async () => {
    const files = new Map([
      ['src/main.ts', 'const x = x + y; // TODO\n'],
      ['src/util.ts', 'export function util() { return util; }'],
    ]);
    const first = await lexicalContext.index(files);
    const second = await lexicalContext.index(files);
    expect(second).toEqual(first);
  });
});