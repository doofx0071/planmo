import { describe, expect, it } from 'vitest';
import {
  STANDARD_CLASSES,
  StandardRuleSchema,
  type RichDesignProfile,
  type StandardRule,
} from '@planmo/schema';
import {
  DESIGN_STANDARDS,
  DESIGN_STANDARDS_CLASS,
  designStandardsFor,
} from './design-standards.js';

const sampleProfile: RichDesignProfile = {
  schemaVersion: 1,
  style: 'minimal',
  density: 'balanced',
  accessibility: 'WCAG-2.2-AA',
  motion: { profile: 'restrained', reducedMotionRequired: true },
  backendOnly: false,
};

describe('DESIGN_STANDARDS shape', () => {
  it('has at least 10 rules', () => {
    expect(DESIGN_STANDARDS.length).toBeGreaterThanOrEqual(10);
  });

  it('has unique ids, all dot-prefixed with "design."', () => {
    const ids = DESIGN_STANDARDS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id.startsWith('design.')).toBe(true);
      expect(id.length).toBeGreaterThan('design.'.length);
    }
  });

  it('every rule parses against StandardRuleSchema with a valid class', () => {
    for (const rule of DESIGN_STANDARDS) {
      const parsed = StandardRuleSchema.safeParse(rule);
      expect(parsed.success).toBe(true);
      expect(STANDARD_CLASSES).toContain(rule.class);
    }
  });

  it('every rule has non-empty rule and rationale', () => {
    for (const rule of DESIGN_STANDARDS) {
      expect(rule.rule.trim().length).toBeGreaterThan(0);
      expect(rule.rationale?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it('uses class "language" because "design" is not a STANDARD_CLASSES member', () => {
    expect(STANDARD_CLASSES).not.toContain('design' as never);
    expect(DESIGN_STANDARDS_CLASS).toBe('language');
    expect(DESIGN_STANDARDS.every((r) => r.class === 'language')).toBe(true);
  });

  it('covers the mandated topics', () => {
    const ids = DESIGN_STANDARDS.map((r) => r.id);
    expect(ids).toContain('design.accessibility-outranks-style');
    expect(ids).toContain('design.dtcg-canonical');
    expect(ids).toContain('design.sources-vs-style');
    expect(ids).toContain('design.anti-patterns');
    expect(ids).toContain('design.motion-profiles');
    expect(ids).toContain('design.reduced-motion');
    expect(ids).toContain('design.touch-targets');
    expect(ids).toContain('design.keyboard-navigation');
    expect(ids).toContain('design.focus-visible');
    expect(ids).toContain('design.contrast-floor');
    expect(ids).toContain('design.semantic-html');
    expect(ids).toContain('design.responsive-mobile-first');
  });
});

describe('designStandardsFor', () => {
  it('returns all DESIGN_STANDARDS sorted by id', () => {
    const result = designStandardsFor(sampleProfile);
    const expected = [...DESIGN_STANDARDS].map((r) => r.id).sort();
    expect(result.map((r) => r.id)).toEqual(expected);
    expect(result.length).toBe(DESIGN_STANDARDS.length);
  });

  it('is deterministic: identical profiles yield identical results', () => {
    expect(designStandardsFor(sampleProfile)).toEqual(designStandardsFor(sampleProfile));
  });

  it('returns only valid StandardRule instances', () => {
    for (const rule of designStandardsFor(sampleProfile)) {
      expect(StandardRuleSchema.safeParse(rule).success).toBe(true);
    }
  });

  it('includes the accessibility-outranks-style rule', () => {
    const rule = designStandardsFor(sampleProfile).find(
      (r: StandardRule): boolean => r.id === 'design.accessibility-outranks-style',
    );
    expect(rule).toBeDefined();
    expect(rule?.rule.toLowerCase()).toContain('never let visual style override');
  });
});
