import { describe, expect, it } from 'vitest';
import type { RichDesignProfile } from '@planmo/schema';
import { a11yValidator } from './accessibility.js';
import type { DtcToken } from './contracts.js';

const goodTokens: DtcToken[] = [
  { name: 'color.surface.canvas', $type: 'color', $value: '#ffffff' },
  { name: 'color.surface.card', $type: 'color', $value: '{color.surface.canvas}' },
  { name: 'color.text.primary', $type: 'color', $value: '#111111' },
];

const sameColorTokens: DtcToken[] = [
  { name: 'color.surface.canvas', $type: 'color', $value: '#ffffff' },
  { name: 'color.text.primary', $type: 'color', $value: '#ffffff' },
];

function profile(overrides: Partial<RichDesignProfile> = {}): RichDesignProfile {
  return {
    schemaVersion: 1,
    style: 'minimal',
    density: 'balanced',
    accessibility: 'WCAG-2.2-AA',
    motion: { profile: 'restrained', reducedMotionRequired: true },
    backendOnly: false,
    ...overrides,
  };
}

const codes = (result: ReturnType<typeof a11yValidator.validate>): string[] =>
  result.diagnostics.map((d) => d.code);

describe('a11yValidator contrast', () => {
  it('errors contrast.aa-text when AA text and surface are the same color', () => {
    const result = a11yValidator.validate(profile(), sameColorTokens);
    expect(codes(result)).toContain('contrast.aa-text');
    expect(result.pass).toBe(false);
  });

  it('passes when AA text and surface differ with sufficient contrast', () => {
    const result = a11yValidator.validate(profile(), goodTokens);
    expect(result.diagnostics).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('errors on insufficient contrast for an AAA target', () => {
    const tokens: DtcToken[] = [
      { name: 'color.surface.canvas', $type: 'color', $value: '#ffffff' },
      { name: 'color.text.primary', $type: 'color', $value: '#777777' }, // ratio ~4.5:1 — below AAA 7:1
    ];
    const result = a11yValidator.validate(profile({ accessibility: 'WCAG-2.2-AAA' }), tokens);
    expect(codes(result)).toContain('contrast.aa-text');
    expect(result.pass).toBe(false);
  });

  it('warns when a resolved text token equals a resolved surface token (alias resolved)', () => {
    const tokens: DtcToken[] = [
      { name: 'color.surface.canvas', $type: 'color', $value: '#ffffff' },
      { name: 'color.text.primary', $type: 'color', $value: '{color.surface.canvas}' },
    ];
    const result = a11yValidator.validate(profile(), tokens);
    expect(codes(result)).toContain('contrast.text-surface-equal');
  });
});

describe('a11yValidator motion, touch, reduced-motion availability', () => {
  it('errors motion.reduced when a frontend profile does not require reduced motion', () => {
    const result = a11yValidator.validate(
      profile({ motion: { profile: 'restrained', reducedMotionRequired: false } }),
      goodTokens,
    );
    expect(codes(result)).toContain('motion.reduced');
    expect(result.pass).toBe(false);
  });

  it('warns touch.target for compact density', () => {
    const result = a11yValidator.validate(profile({ density: 'compact' }), goodTokens);
    expect(codes(result)).toContain('touch.target');
    expect(result.pass).toBe(true);
  });

  it('infos motion.reduced-available when a motion.duration.slow token exists', () => {
    const tokens = [
      ...goodTokens,
      { name: 'motion.duration.slow', $type: 'duration', $value: '600ms' },
    ];
    const result = a11yValidator.validate(
      profile({ motion: { profile: 'cinematic', reducedMotionRequired: true } }),
      tokens,
    );
    expect(codes(result)).toContain('motion.reduced-available');
    expect(result.pass).toBe(true);
  });
});

describe('a11yValidator style override + backend-only', () => {
  it('errors a11y.style-override when a token declares an a11y skip', () => {
    const tokens = [
      ...goodTokens,
      { name: 'a11y.contrast-skip', $type: 'boolean', $value: 'true' },
    ];
    const result = a11yValidator.validate(profile(), tokens);
    expect(codes(result)).toContain('a11y.style-override');
    expect(result.pass).toBe(false);
  });

  it('never errors for a backend-only profile', () => {
    const tokens: DtcToken[] = [
      { name: 'color.surface.canvas', $type: 'color', $value: '#000000' },
      { name: 'color.text.primary', $type: 'color', $value: '#000000' },
      { name: 'a11y.contrast-skip', $type: 'boolean', $value: 'true' },
    ];
    const result = a11yValidator.validate(profile({ backendOnly: true }), tokens);
    expect(result.diagnostics).toEqual([]);
    expect(result.pass).toBe(true);
  });
});

describe('a11yValidator ordering + determinism', () => {
  it('sorts diagnostics by severity (error > warning > info) then code', () => {
    const tokens = [
      ...sameColorTokens,
      { name: 'motion.duration.slow', $type: 'duration', $value: '600ms' },
    ];
    const result = a11yValidator.validate(
      profile({
        density: 'compact',
        motion: { profile: 'cinematic', reducedMotionRequired: true },
      }),
      tokens,
    );
    expect(result.diagnostics.map((d) => d.severity)).toEqual([
      'error',
      'error',
      'warning',
      'warning',
      'info',
    ]);
    expect(codes(result)).toEqual([
      'contrast.aa-text',
      'contrast.large-text',
      'contrast.text-surface-equal',
      'touch.target',
      'motion.reduced-available',
    ]);
  });

  it('is deterministic: identical input yields identical diagnostics', () => {
    const first = a11yValidator.validate(profile({ density: 'compact' }), sameColorTokens);
    const second = a11yValidator.validate(profile({ density: 'compact' }), sameColorTokens);
    expect(first).toEqual(second);
    expect(first.diagnostics).toEqual(second.diagnostics);
  });

  it('pass is false when any error exists and true otherwise', () => {
    expect(a11yValidator.validate(profile(), sameColorTokens).pass).toBe(false);
    expect(a11yValidator.validate(profile(), goodTokens).pass).toBe(true);
    expect(a11yValidator.validate(profile({ density: 'compact' }), goodTokens).pass).toBe(true);
  });
});
