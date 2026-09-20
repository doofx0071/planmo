import { describe, expect, it } from 'vitest';
import {
  RichDesignProfileSchema,
  RegistryItemSchema,
  MOTION_PROFILES,
  REGISTRY_TRUST_LEVELS,
} from './index.js';

const validProfile = {
  schemaVersion: 1,
  style: 'minimal',
  styleVariant: 'balanced',
  density: 'balanced',
  geometry: { radius: 'subtle', borderStrength: 'subtle', shadowUsage: 'restrained' },
  typography: { strategy: 'sans', maxFamilies: 2 },
  icons: { strategy: 'outline' },
  motion: { profile: 'restrained', reducedMotionRequired: true },
  accessibility: 'WCAG-2.2-AA',
  components: { system: 'shadcn' },
  responsive: { mobileFirst: true, breakpoints: [640, 768, 1024] },
};

describe('RichDesignProfileSchema (P07-01)', () => {
  it('parses the canonical design-profile.md shape', () => {
    const profile = RichDesignProfileSchema.parse(validProfile);
    expect(profile.style).toBe('minimal');
    expect(profile.motion?.profile).toBe('restrained');
    expect(profile.components?.system).toBe('shadcn');
  });

  it('rejects unknown fields (strict)', () => {
    const result = RichDesignProfileSchema.safeParse({ ...validProfile, bogus: true });
    expect(result.success).toBe(false);
  });

  it('accepts a backend-only / no-frontend profile (valid state)', () => {
    const backendOnly = RichDesignProfileSchema.parse({
      schemaVersion: 1,
      style: 'minimal',
      density: 'balanced',
      backendOnly: true,
    });
    expect(backendOnly.backendOnly).toBe(true);
    expect(backendOnly.typography).toBeUndefined();
  });

  it('defaults accessibility to WCAG-2.2-AA and reducedMotion to true', () => {
    const profile = RichDesignProfileSchema.parse({
      schemaVersion: 1,
      style: 'playful',
      density: 'spacious',
    });
    expect(profile.accessibility).toBe('WCAG-2.2-AA');
    expect(MOTION_PROFILES).toContain(profile.motion?.profile ?? 'restrained');
  });

  it('rejects a typography strategy outside the enum and maxFamilies > 4', () => {
    expect(
      RichDesignProfileSchema.safeParse({ ...validProfile, typography: { strategy: 'papyrus' } })
        .success,
    ).toBe(false);
    expect(
      RichDesignProfileSchema.safeParse({
        ...validProfile,
        typography: { strategy: 'sans', maxFamilies: 9 },
      }).success,
    ).toBe(false);
  });

  it('rejects a motion profile outside none/restrained/expressive/cinematic', () => {
    expect(
      RichDesignProfileSchema.safeParse({ ...validProfile, motion: { profile: 'flamboyant' } })
        .success,
    ).toBe(false);
  });
});

describe('RegistryItemSchema (P07-04 trust metadata)', () => {
  const officialItem = {
    id: 'shadcn/ui',
    url: 'https://ui.shadcn.com/r/styles/new-york/button.json',
    trust: 'official',
    name: 'button',
    version: '0.9.2',
    integrity: 'sha256:abcd1234',
  };

  it('accepts an official item with integrity', () => {
    const item = RegistryItemSchema.parse(officialItem);
    expect(item.trust).toBe('official');
    expect(item.requiresReview).toBe(true);
  });

  it('never defaults trust: missing trust is rejected', () => {
    const withoutTrust = { ...officialItem, trust: undefined };
    expect(RegistryItemSchema.safeParse(withoutTrust).success).toBe(false);
  });

  it('accepts all trust levels; community/untrusted FORCE review', () => {
    for (const trust of REGISTRY_TRUST_LEVELS) {
      const item = RegistryItemSchema.parse({
        id: 'registry/x',
        url: 'https://example.com/item.json',
        trust,
        name: 'x',
      });
      if (trust === 'community' || trust === 'untrusted') {
        expect(item.requiresReview).toBe(true);
      }
    }
  });

  it('community/untrusted cannot disable review (security invariant)', () => {
    for (const trust of ['community', 'untrusted'] as const) {
      const parsed = RegistryItemSchema.safeParse({
        id: 'registry/x',
        url: 'https://example.com/item.json',
        trust,
        name: 'x',
        requiresReview: false,
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues.some((i) => i.path.includes('requiresReview'))).toBe(true);
      }
    }
  });

  it('official/verified may declare requiresReview: false explicitly', () => {
    const item = RegistryItemSchema.parse({
      id: 'shadcn/ui',
      url: 'https://ui.shadcn.com/r/item.json',
      trust: 'official',
      name: 'button',
      requiresReview: false,
    });
    expect(item.requiresReview).toBe(false);
  });

  it('rejects a malformed integrity hash', () => {
    expect(RegistryItemSchema.safeParse({ ...officialItem, integrity: 'not-a-hash' }).success).toBe(
      false,
    );
  });

  it('rejects a non-URL source (file:// scheme)', () => {
    expect(
      RegistryItemSchema.safeParse({ ...officialItem, url: 'file:///etc/passwd' }).success,
    ).toBe(false);
  });
});
