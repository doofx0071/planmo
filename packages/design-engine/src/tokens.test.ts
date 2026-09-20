import { describe, expect, it } from 'vitest';
import { dtcTokenEngine, names, aliasTarget, isAlias } from './tokens.js';
import type { DtcToken } from './contracts.js';

const baseTokens: DtcToken[] = [
  { name: 'color.surface.canvas', $type: 'color', $value: '#ffffff' },
  { name: 'color.surface.card', $type: 'color', $value: '{color.surface.canvas}' },
  { name: 'spacing.unit', $type: 'dimension', $value: '4px' },
  { name: 'spacing.card', $type: 'dimension', $value: '{spacing.unit}' },
];

describe('dtcTokenEngine.resolve', () => {
  it('resolves by name and by alias reference', () => {
    expect(dtcTokenEngine.resolve('color.surface.canvas', baseTokens)?.name).toBe('color.surface.canvas');
    expect(dtcTokenEngine.resolve('{color.surface.canvas}', baseTokens)?.name).toBe('color.surface.canvas');
  });

  it('returns undefined for unknown aliases', () => {
    expect(dtcTokenEngine.resolve('{nope}', baseTokens)).toBeUndefined();
  });
});

describe('validate', () => {
  it('accepts a clean set with aliases (no diagnostics)', () => {
    expect(dtcTokenEngine.validate(baseTokens, {})).toEqual([]);
  });

  it('detects missing references', () => {
    const tokens = [...baseTokens, { name: 'color.broken', $type: 'color', $value: '{color.missing}' }];
    const diagnostics = dtcTokenEngine.validate(tokens, {});
    expect(diagnostics.some((d) => d.code === 'missing-reference' && d.token === 'color.broken')).toBe(true);
  });

  it('detects alias cycles', () => {
    const tokens: DtcToken[] = [
      { name: 'a', $type: 'color', $value: '{b}' },
      { name: 'b', $type: 'color', $value: '{a}' },
    ];
    const diagnostics = dtcTokenEngine.validate(tokens, {});
    expect(diagnostics.some((d) => d.code === 'cycle')).toBe(true);
  });

  it('detects duplicate names', () => {
    const tokens = [
      { name: 'x', $value: '1px' },
      { name: 'x', $value: '2px' },
    ];
    const diagnostics = dtcTokenEngine.validate(tokens as DtcToken[], {});
    expect(diagnostics.some((d) => d.code === 'duplicate-name')).toBe(true);
  });

  it('flags dimension values without units (except 0)', () => {
    const tokens = [
      { name: 'spacing.bad', $type: 'dimension', $value: '16' },
      { name: 'spacing.zero', $type: 'dimension', $value: '0' },
    ];
    const diagnostics = dtcTokenEngine.validate(tokens as DtcToken[], {});
    expect(diagnostics.some((d) => d.code === 'invalid-value' && d.token === 'spacing.bad')).toBe(true);
    expect(diagnostics.some((d) => d.token === 'spacing.zero')).toBe(false);
  });

  it('requires motion tokens for expressive/cinematic profiles', () => {
    const expressive = dtcTokenEngine.validate(baseTokens, { motion: 'expressive' });
    expect(expressive.some((d) => d.token === 'motion.express')).toBe(true);
    const restrained = dtcTokenEngine.validate(baseTokens, { motion: 'restrained' });
    expect(restrained).toEqual([]);
  });

  it('returns diagnostics deterministically sorted', () => {
    const tokens = [
      { name: 'z', $value: '{missing-z}' },
      { name: 'a', $value: '{missing-a}' },
    ];
    const diagnostics = dtcTokenEngine.validate(tokens as DtcToken[], {});
    expect(diagnostics.map((d) => d.token)).toEqual(['a', 'z']);
  });
});

describe('emit', () => {
  it('emits canonical DTCG JSON with $schema, sorted, nested groups', () => {
    const json = dtcTokenEngine.emit(baseTokens);
    expect(json).toContain('$schema');
    expect(json).toContain('"$type": "color"');
    // Nested groups: color > surface > canvas.
    expect(json).toMatch(/"surface":\s*\{/);
  });

  it('is deterministic (identical input → identical output, byte for byte)', () => {
    const swapped = [...baseTokens].reverse();
    expect(dtcTokenEngine.emit(baseTokens)).toBe(dtcTokenEngine.emit(swapped));
  });

  it('emits aliases verbatim as {ref} strings', () => {
    const json = dtcTokenEngine.emit(baseTokens);
    expect(json).toContain('"{color.surface.canvas}"');
  });
});

describe('helpers', () => {
  it('names() is sorted and deduped', () => {
    expect(names(baseTokens)).toEqual([
      'color.surface.canvas',
      'color.surface.card',
      'spacing.card',
      'spacing.unit',
    ]);
  });

  it('isAlias / aliasTarget handle {ref} syntax', () => {
    expect(isAlias('{color.x}')).toBe(true);
    expect(isAlias('#fff')).toBe(false);
    expect(aliasTarget('{color.x}')).toBe('color.x');
  });
});