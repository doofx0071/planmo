import { describe, expect, it } from 'vitest';
import { diffLines, unifiedDiff } from './diff.js';

describe('diffLines', () => {
  it('returns no changes for identical content', () => {
    expect(diffLines('a\nb\n', 'a\nb\n')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'same', text: 'b' },
      { kind: 'same', text: '' },
    ]);
  });

  it('isolates an insertion', () => {
    const d = diffLines('a\nc\n', 'a\nb\nc\n');
    expect(d.filter((x) => x.kind === 'add').map((x) => x.text)).toEqual(['b']);
    expect(d.filter((x) => x.kind === 'remove')).toEqual([]);
  });

  it('isolates a deletion', () => {
    const d = diffLines('a\nb\nc\n', 'a\nc\n');
    expect(d.filter((x) => x.kind === 'remove').map((x) => x.text)).toEqual(['b']);
    expect(d.filter((x) => x.kind === 'add')).toEqual([]);
  });

  it('is deterministic: same input, same output', () => {
    const a = 'x\n1\ny\n2\nz\n';
    const b = 'x\n1\n2\nz\nq\n';
    expect(diffLines(a, b)).toEqual(diffLines(a, b));
  });
});

describe('unifiedDiff', () => {
  it('renders a unified-style diff with +/- markers', () => {
    const out = unifiedDiff('docs/plan.md', 'old line\n', 'new line\n');
    expect(out).toContain('--- a/docs/plan.md');
    expect(out).toContain('+++ b/docs/plan.md');
    expect(out).toContain('-old line');
    expect(out).toContain('+new line');
  });

  it('returns empty string when nothing changed', () => {
    expect(unifiedDiff('a.md', 'same\n', 'same\n')).toBe('');
  });
});
