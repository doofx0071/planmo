/**
 * Minimal deterministic line diff (no external dependency — ADR-0010 keeps
 * the core zero-dep where practical).
 *
 * Produces a unified-style diff with a small header:
 *
 *   --- a/path
 *   +++ b/path
 *   -old line
 *   +new line
 *
 * Implementation: longest-common-subsequence over lines (dynamic
 * programming). Deterministic by construction: equal inputs with equal
 * content always produce identical output. O(n*m) — fine for the generated
 * document sizes PlanMo writes; not a general-purpose diff engine.
 */

export interface DiffLine {
  kind: 'same' | 'remove' | 'add';
  text: string;
}

/** Split text into lines, preserving a trailing newline as a final '' sentinel. */
function lines(text: string): string[] {
  return text.split('\n');
}

/** Longest common subsequence indices (0-based) of two line arrays. */
function lcs(a: string[], b: string[]): { ai: number; bi: number }[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: { ai: number; bi: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ ai: i, bi: j });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return out;
}

/** Compute line-by-line changes between `before` and `after`. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = lines(before);
  const b = lines(after);
  const common = lcs(a, b);
  const result: DiffLine[] = [];
  let ai = 0;
  let bi = 0;
  for (const { ai: cai, bi: cbi } of common) {
    while (ai < cai) result.push({ kind: 'remove', text: a[ai++]! });
    while (bi < cbi) result.push({ kind: 'add', text: b[bi++]! });
    result.push({ kind: 'same', text: a[ai]! });
    ai++;
    bi++;
  }
  while (ai < a.length) result.push({ kind: 'remove', text: a[ai++]! });
  while (bi < b.length) result.push({ kind: 'add', text: b[bi++]! });
  return result;
}

/** Render a unified diff for `path`; empty string when there are no changes. */
export function unifiedDiff(path: string, before: string, after: string): string {
  const changes = diffLines(before, after);
  if (!changes.some((c) => c.kind !== 'same')) return '';
  const body = changes
    .map((c) => {
      if (c.kind === 'remove') return `-${c.text}`;
      if (c.kind === 'add') return `+${c.text}`;
      return ` ${c.text}`;
    })
    .join('\n');
  return `--- a/${path}\n+++ b/${path}\n${body}\n`;
}
