import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME, PRODUCT_SLUG, isNonEmptyString } from './index.js';

describe('shared constants', () => {
  it('exposes the product name and slug deterministically', () => {
    expect(PRODUCT_NAME).toBe('PlanMo');
    expect(PRODUCT_SLUG).toBe('planmo');
  });
});

describe('isNonEmptyString', () => {
  it('accepts non-whitespace strings', () => {
    expect(isNonEmptyString('x')).toBe(true);
    expect(isNonEmptyString('  x ')).toBe(true);
  });

  it('rejects empty, whitespace-only, and non-string values', () => {
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString('   ')).toBe(false);
    expect(isNonEmptyString('\t\n')).toBe(false);
    expect(isNonEmptyString(42)).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString(['a'])).toBe(false);
  });
});
