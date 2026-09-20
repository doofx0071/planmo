import { describe, expect, it } from 'vitest';
import type { RichDesignProfile } from '@planmo/schema';
import type { DesignPack, DtcToken } from './contracts.js';
import { designDocsGenerator } from './docs.js';

// ------------------------------------------------------------- inline fixtures

const minimalPack: DesignPack = {
  id: 'minimal',
  version: '1.0.0',
  name: 'Minimal',
  description: 'Clean and content-first.',
  tokens: [],
  antiPatterns: ['excessive decoration', 'visual noise'],
  responsive: ['stack navigation on narrow viewports'],
  accessibilityNotes: ['maintain contrast on brand surfaces'],
};

const mediumTokens: DtcToken[] = [
  { name: 'color.surface.canvas', $type: 'color', $value: '#ffffff' },
  { name: 'color.surface.card', $type: 'color', $value: '{color.surface.canvas}' },
  { name: 'spacing.unit', $type: 'dimension', $value: '4px' },
  { name: 'spacing.card', $type: 'dimension', $value: '{spacing.unit}' },
  // Deliberately dangling alias so the medium fixture exercises Validation warnings.
  { name: 'color.broken', $type: 'color', $value: '{color.missing}' },
];

const mediumProfile: RichDesignProfile = {
  schemaVersion: 1,
  style: 'minimal',
  styleVariant: 'balanced',
  density: 'balanced',
  geometry: { radius: 'subtle', borderStrength: 'subtle', shadowUsage: 'restrained' },
  typography: { strategy: 'sans', maxFamilies: 2 },
  icons: { strategy: 'outline' },
  motion: { profile: 'restrained', reducedMotionRequired: true },
  accessibility: 'WCAG-2.2-AA',
  components: { system: 'shadcn', foundation: 'radix', registries: [] },
  responsive: { mobileFirst: true, breakpoints: [1024, 640, 768] },
  backendOnly: false,
};

const leanProfile: RichDesignProfile = {
  schemaVersion: 1,
  style: 'minimal',
  density: 'compact',
  accessibility: 'WCAG-2.2-AA',
  backendOnly: false,
};

// --------------------------------------------------------------------- tests

describe('designDocsGenerator.generate', () => {
  it('generates all 8 required sections for a minimal-style profile', () => {
    const result = designDocsGenerator.generate({
      profile: mediumProfile,
      packs: [minimalPack],
      tokens: mediumTokens,
    });
    expect(result.sections).toEqual([
      '# minimal design guidance',
      '## Profile',
      '## Design tokens',
      '## Anti-patterns',
      '## Responsive',
      '## Accessibility',
      '## Motion',
      '## Validation warnings',
    ]);
    expect(result.markdown).toContain('# minimal design guidance');
    expect(result.markdown).toContain('## Profile');
  });

  it('emits tokens sorted by name with $type and $value', () => {
    const result = designDocsGenerator.generate({
      profile: mediumProfile,
      packs: [],
      tokens: mediumTokens,
    });
    expect(result.markdown).toContain('| color.surface.canvas | color | #ffffff |');
    const canvas = result.markdown.indexOf('color.surface.canvas');
    const card = result.markdown.indexOf('color.surface.card');
    const broken = result.markdown.indexOf('color.broken');
    expect(canvas).toBeGreaterThan(-1);
    expect(broken).toBeLessThan(canvas);
    expect(canvas).toBeLessThan(card);
  });

  it('anti-patterns section merges universal + pack items', () => {
    const result = designDocsGenerator.generate({
      profile: mediumProfile,
      packs: [minimalPack],
      tokens: mediumTokens,
    });
    expect(result.markdown).toContain('purposeless continuous animation');
    expect(result.markdown).toContain('excessive decoration');
  });

  it('omits the Motion section cleanly when the profile has no motion block', () => {
    const result = designDocsGenerator.generate({
      profile: leanProfile,
      packs: [],
      tokens: [],
    });
    expect(result.markdown).not.toContain('## Motion');
    expect(result.sections).not.toContain('## Motion');
    expect(result.sections).toEqual([
      '# minimal design guidance',
      '## Profile',
      '## Design tokens',
      '## Anti-patterns',
      '## Responsive',
      '## Accessibility',
    ]);
  });

  it('adds a Validation warnings section for missing alias targets', () => {
    const tokens: DtcToken[] = [
      { name: 'color.surface.canvas', $type: 'color', $value: '#ffffff' },
      { name: 'color.surface.card', $type: 'color', $value: '{color.missing}' },
    ];
    const result = designDocsGenerator.generate({
      profile: mediumProfile,
      packs: [],
      tokens,
    });
    expect(result.markdown).toContain('## Validation warnings');
    expect(result.markdown).toContain('[missing-reference] color.surface.card');
    expect(result.markdown).toContain('references missing token "{color.missing}"');
  });

  it('is deterministic: two generate calls are byte-identical', () => {
    const input = { profile: mediumProfile, packs: [minimalPack], tokens: mediumTokens };
    const first = designDocsGenerator.generate(input);
    const second = designDocsGenerator.generate(input);
    expect(first.markdown).toBe(second.markdown);
    expect(first.sections).toEqual(second.sections);
    expect(first).toEqual(second);
  });

  it('still generates guidance for a backend-only profile', () => {
    const backendOnlyProfile: RichDesignProfile = {
      ...mediumProfile,
      backendOnly: true,
    };
    const result = designDocsGenerator.generate({
      profile: backendOnlyProfile,
      packs: [],
      tokens: [],
    });
    expect(result.markdown).toContain('# minimal design guidance');
    expect(result.markdown).toContain('backendOnly: true');
    expect(result.sections).toContain('## Profile');
    expect(result.markdown).not.toContain('## Validation warnings');
  });
});
