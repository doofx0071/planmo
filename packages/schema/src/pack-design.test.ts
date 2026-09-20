import { describe, expect, it } from 'vitest';
import { expectRejected, roundTripJson, roundTripYaml } from './test-utils.js';
import { DesignProfileSchema, DesignTokensSchema, PackSchema } from './pack-design.js';

describe('PackSchema (declarative pack)', () => {
  const valid = {
    schemaVersion: 1,
    ref: 'design/minimal',
    name: 'Minimal Design Pack',
    version: '1.0.0',
    category: 'design',
    description: 'Minimal aesthetic design tokens and rules.',
    provides: ['design.minimal', 'tokens.basic'],
    requires: ['stack/web'],
    content: { rules: { borderRadius: 'small' } },
  };

  it('parses and round-trips a declarative pack', () => {
    const parsed = roundTripYaml(PackSchema, valid);
    expect(parsed.category).toBe('design');
    expect(parsed.provides).toContain('design.minimal');
  });

  it('accepts all nine pack categories', () => {
    for (const category of [
      'stack',
      'domain',
      'risk',
      'design',
      'agent',
      'workflow',
      'standards',
      'policy',
      'context',
    ]) {
      expect(() => PackSchema.parse({ ...valid, category })).not.toThrow();
    }
  });

  it('rejects unknown pack metadata fields', () => {
    expectRejected(PackSchema, { ...valid, script: 'rm -rf /' }, 'Unrecognized key');
  });

  it('rejects a non-semver pack version', () => {
    expectRejected(PackSchema, { ...valid, version: 'v1' });
  });

  it('rejects content that is not an object map', () => {
    expectRejected(PackSchema, { ...valid, content: ['not', 'a', 'map'] });
  });
});

describe('DesignProfileSchema', () => {
  const valid = {
    schemaVersion: 1,
    style: 'neobrutalism',
    density: 'compact',
    accessibility: 'WCAG-2.2-AA',
    componentSystem: 'shadcn',
  };

  it('parses and round-trips a design profile', () => {
    const parsed = roundTripJson(DesignProfileSchema, valid);
    expect(parsed.style).toBe('neobrutalism');
  });

  it('accepts optional DTCG-style tokens', () => {
    const parsed = DesignProfileSchema.parse({
      ...valid,
      tokens: { color: { primary: '#7c2d12' } },
    });
    expect(parsed.tokens?.color).toEqual({ primary: '#7c2d12' });
  });

  it('rejects an unknown style', () => {
    expectRejected(DesignProfileSchema, { ...valid, style: 'rainbow' });
  });

  it('rejects an unknown accessibility level', () => {
    expectRejected(DesignProfileSchema, { ...valid, accessibility: 'WCAG-1.0' });
  });
});

describe('DesignTokensSchema (DTCG-compatible)', () => {
  it('parses a token document with the canonical $schema', () => {
    const parsed = DesignTokensSchema.parse({
      $schema: 'https://design-tokens.github.io/community-group/format/',
      color: { primary: { value: '#0f172a' } },
      spacing: { md: { value: '1rem' } },
    });
    expect(parsed.color.primary).toEqual({ value: '#0f172a' });
  });

  it('rejects a missing or wrong $schema', () => {
    expectRejected(DesignTokensSchema, { color: {} }, '$schema');
    expectRejected(DesignTokensSchema, {
      $schema: 'https://example.invalid/format',
      color: {},
    });
  });
});
