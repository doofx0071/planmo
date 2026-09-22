import { describe, expect, it } from 'vitest';
import { aliasTarget, dtcTokenEngine, isAlias } from './tokens.js';
import type { DtcToken, TokenValidationDiagnostic } from './contracts.js';

/**
 * Property / fuzz tests for the DTCG token engine (P12-02, P-TOK).
 *
 * Properties under test (docs/09-testing/property-and-fuzz.md — Token
 * references):
 * - P-TOK-1  An alias graph is either fully resolvable (every chain
 *            terminates at a literal within a bounded walk) or validation
 *            reports deterministic cycle / missing-reference diagnostics
 *            that match an independent per-token walk oracle; deep and
 *            cyclic graphs terminate (no hangs).
 * - P-TOK-2  emit() is byte-identical for the same token multiset in any
 *            order, and repeated emits are stable.
 * - P-TOK-3  Negative cases: duplicate names, NaN, unit-less dimensions and
 *            empty alias refs produce deterministic diagnostics.
 * All randomness is seeded (mulberry32, fixed seeds).
 */

/** Deterministic 32-bit PRNG (mulberry32). Fixed seeds only. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rnd: () => number, items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)] as T;
}

const WORDS = [
  'color',
  'surface',
  'bg',
  'text',
  'spacing',
  'radius',
  'motion',
  'icon',
  'font',
  'scale',
  'state',
  'accent',
  'primary',
  'gray',
  'blue',
  'green',
  'white',
  'black',
  'transparent',
  'card',
  'border',
  'shadow',
  'focus',
  'hover',
  'dense',
  'x',
  'y',
] as const;

const LITERALS: readonly string[] = [
  '#ffffff',
  '#0a0a0a',
  '#4f46e5',
  '0',
  '1px',
  '4px',
  '16px',
  '0.5s',
  '200ms',
  '1',
  '500',
  'center',
  'normal',
];

const GHOST_NAMES = ['ghost.a', 'ghost.b', 'ghost.missing'] as const;

/** Build a unique-name token set (8..28 tokens) with seeded alias structure. */
function genTokens(rnd: () => number): DtcToken[] {
  const count = 8 + Math.floor(rnd() * 21);
  const names: string[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (names.length < count && guard < 500) {
    guard += 1;
    const depth = 1 + Math.floor(rnd() * 3);
    const parts: string[] = [];
    for (let i = 0; i < depth; i += 1) parts.push(pick(rnd, WORDS));
    const name = parts.join('.');
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names.map((name) => {
    const alias = rnd() < 0.4;
    const valueType = rnd();
    let $value: DtcToken['$value'];
    if (alias) {
      // Reference a random EXISTING pool name (self-reference possible) or a
      // ghost name — never a name the pool does not contain, so graphs stay
      // structurally interesting without degenerate load failures.
      $value = rnd() < 0.22 ? `{${pick(rnd, GHOST_NAMES)}}` : `{${pick(rnd, names)}}`;
    } else if (valueType < 0.15) {
      $value = Math.floor(rnd() * 9);
    } else {
      $value = pick(rnd, LITERALS);
    }
    const useType = rnd() < 0.6;
    return useType
      ? { name, $type: pick(rnd, ['color', 'dimension', 'number', 'duration']), $value }
      : { name, $value };
  });
}

/**
 * Independent oracle for the engine's DIRECT missing-reference check
 * (the engine only flags a token whose own $value aliases an unknown name).
 */
function directMissing(t: DtcToken, byName: Map<string, DtcToken>): boolean {
  return typeof t.$value === 'string' && isAlias(t.$value) && !byName.has(aliasTarget(t.$value));
}

/**
 * Independent per-token walk oracle for the engine's cycle check: follow alias
 * chains from the token; revisiting a node within 64 steps is a cycle.
 */
function chainCycles(t: DtcToken, byName: Map<string, DtcToken>): boolean {
  const visited = new Set<string>([t.name]);
  let current: DtcToken | undefined = t;
  for (let steps = 0; steps <= 64; steps += 1) {
    const value = current?.$value;
    if (typeof value !== 'string' || !isAlias(value)) return false;
    const target = aliasTarget(value);
    const next = byName.get(target);
    if (!next) return false; // missing reference — chain stops, no cycle
    if (visited.has(next.name)) return true;
    visited.add(next.name);
    current = next;
  }
  return true; // walk did not terminate within the bound — pathological
}

function isSorted(diags: readonly TokenValidationDiagnostic[]): boolean {
  for (let i = 1; i < diags.length; i += 1) {
    const a = diags[i - 1] as TokenValidationDiagnostic;
    const b = diags[i] as TokenValidationDiagnostic;
    if (a.token > b.token) return false;
    if (a.token === b.token && a.code > b.code) return false;
  }
  return true;
}

describe('P-TOK-1 alias graphs: fully resolvable or deterministic cycle/missing diagnostics', () => {
  it('200 seeded graphs: engine diagnostics match the walk oracle exactly', () => {
    const rnd = mulberry32(0x70b);
    for (let iter = 0; iter < 200; iter += 1) {
      const tokens = genTokens(rnd);
      const byName = new Map(tokens.map((t) => [t.name, t]));
      const diags = dtcTokenEngine.validate(tokens, {});

      let oracleMissing = 0;
      let oracleCycle = 0;
      for (const t of tokens) {
        if (directMissing(t, byName)) oracleMissing += 1;
        if (chainCycles(t, byName)) oracleCycle += 1;
      }

      const cycleDiags = diags.filter((d) => d.code === 'cycle');
      const missingDiags = diags.filter((d) => d.code === 'missing-reference');

      expect(cycleDiags.length, `iter ${iter}: cycle count`).toBe(oracleCycle);
      expect(missingDiags.length, `iter ${iter}: missing count`).toBe(oracleMissing);

      // Fully-resolvable branch: with no cycle or missing reference anywhere,
      // every alias chain must terminate at a literal (bounded walk).
      if (oracleCycle === 0 && oracleMissing === 0) {
        for (const t of tokens) {
          expect(chainCycles(t, byName), `iter ${iter}: ${t.name}`).toBe(false);
        }
      }

      // Diagnostics are deterministically sorted by (token, code).
      expect(isSorted(diags), `iter ${iter}: sorted diagnostics`).toBe(true);
      // Deterministic: a second validation call reports identical diagnostics.
      expect(dtcTokenEngine.validate(tokens, {})).toEqual(diags);
    }
  });

  it('deep chains and large cycles terminate fast (no hangs)', () => {
    const deep: DtcToken[] = [];
    const N = 300;
    for (let i = 0; i < N; i += 1) {
      deep.push({ name: `chain.${i}`, $type: 'color', $value: `{chain.${i + 1}}` });
    }
    deep.push({ name: `chain.${N}`, $type: 'color', $value: '#000000' });
    const cyc: DtcToken[] = [];
    const C = 50;
    for (let i = 0; i < C; i += 1) {
      cyc.push({ name: `cyc.${i}`, $type: 'color', $value: `{cyc.${(i + 1) % C}}` });
    }
    const deepDiags = dtcTokenEngine.validate(deep, {});
    expect(deepDiags).toEqual([]);
    const emitted = dtcTokenEngine.emit(deep);
    expect(emitted).toContain('"chain"');
    expect(emitted).toContain('"#000000"');
    const cycDiags = dtcTokenEngine.validate(cyc, {});
    expect(cycDiags.some((d) => d.code === 'cycle')).toBe(true);
    expect(cycDiags).toHaveLength(C);
  });
});

describe('P-TOK-2 emit() is byte-identical for permuted multisets', () => {
  it('200 seeded graphs: any order of the same multiset emits identical bytes', () => {
    const rnd = mulberry32(0xe617);
    for (let iter = 0; iter < 200; iter += 1) {
      const tokens = genTokens(rnd);
      const reversed = [...tokens].reverse();
      const shuffled = [...tokens].sort(() => (rnd() < 0.5 ? -1 : 1));
      expect(dtcTokenEngine.emit(tokens), `iter ${iter}: reversed`).toBe(
        dtcTokenEngine.emit(reversed),
      );
      expect(dtcTokenEngine.emit(tokens), `iter ${iter}: shuffled`).toBe(
        dtcTokenEngine.emit(shuffled),
      );
      expect(dtcTokenEngine.emit(reversed)).toBe(dtcTokenEngine.emit(reversed));
    }
  });

  it('clean graphs emit and re-emit stable canonical JSON', () => {
    const tokens: DtcToken[] = [
      { name: 'color.bg', $type: 'color', $value: '#ffffff' },
      { name: 'color.fg', $type: 'color', $value: '{color.bg}' },
    ];
    const once = dtcTokenEngine.emit(tokens);
    expect(dtcTokenEngine.emit(tokens)).toBe(once);
    expect(once).toContain('"#ffffff"');
    expect(once).toContain('"{color.bg}"');
  });
});

describe('P-TOK-3 negative value diagnostics (table)', () => {
  it('reports duplicate names, NaN, unit-less dimensions and empty aliases', () => {
    const cases: { title: string; tokens: DtcToken[]; code: string; token: string }[] = [
      {
        title: 'duplicate name',
        tokens: [
          { name: 'x.dup', $value: '1px' },
          { name: 'x.dup', $value: '2px' },
        ],
        code: 'duplicate-name',
        token: 'x.dup',
      },
      {
        title: 'NaN value',
        tokens: [{ name: 'x.nan', $value: Number.NaN }],
        code: 'invalid-value',
        token: 'x.nan',
      },
      {
        title: 'unit-less dimension',
        tokens: [{ name: 'x.unitless', $value: '16' }],
        code: 'invalid-value',
        token: 'x.unitless',
      },
      {
        title: 'empty alias reference',
        tokens: [{ name: 'x.empty', $value: '{}' }],
        code: 'invalid-value',
        token: 'x.empty',
      },
    ];
    for (const c of cases) {
      const diags = dtcTokenEngine.validate(c.tokens, {});
      expect(
        diags.some((d) => d.code === c.code && d.token === c.token),
        c.title,
      ).toBe(true);
    }
  });

  it('self-referencing and mutual aliases are cycles, deterministically reported', () => {
    const self: DtcToken[] = [{ name: 'a.self', $value: '{a.self}' }];
    const mutual: DtcToken[] = [
      { name: 'a.m1', $value: '{a.m2}' },
      { name: 'a.m2', $value: '{a.m1}' },
    ];
    const selfDiags = dtcTokenEngine.validate(self, {});
    expect(selfDiags.some((d) => d.code === 'cycle' && d.token === 'a.self')).toBe(true);
    const mutualDiags = dtcTokenEngine.validate(mutual, {});
    expect(mutualDiags.filter((d) => d.code === 'cycle')).toHaveLength(2);
    expect(dtcTokenEngine.validate(mutual, {})).toEqual(mutualDiags);
  });

  it('motion-profile contexts demand the matching motion token', () => {
    const base: DtcToken[] = [{ name: 'color.bg', $value: '#fff' }];
    expect(
      dtcTokenEngine
        .validate(base, { motion: 'expressive' })
        .some((d) => d.token === 'motion.express'),
    ).toBe(true);
    expect(
      dtcTokenEngine
        .validate(base, { motion: 'cinematic' })
        .some((d) => d.token === 'motion.cinematic'),
    ).toBe(true);
    expect(dtcTokenEngine.validate(base, { motion: 'restrained' })).toEqual([]);
  });
});
