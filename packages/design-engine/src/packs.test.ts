import { describe, expect, it } from 'vitest';
import { DESIGN_STYLES, RichDesignProfileSchema, type DesignStyle } from '@planmo/schema';
import { DESIGN_PACKS, designPackCatalog } from './packs.js';
import { dtcTokenEngine } from './tokens.js';
import { a11yValidator } from './accessibility.js';
import type { DesignPack } from './contracts.js';

/**
 * Design packs contract tests (P07-03). Exit-gate relevant:
 *  - count() === 8, ids exactly equal DESIGN_STYLES;
 *  - every pack's tokens validate clean (aliases, cycles, units, dups);
 *  - every pack's color.text.* / color.surface.* pairs meet the WCAG 2.2 AA
 *    normal-text floor (4.5:1) under a11yValidator with a balanced profile;
 *  - playful carries the motion.express token its expressive motion profile
 *    demands;
 *  - DTCG emission is byte-deterministic for every pack.
 */

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function packProfile(style: DesignStyle) {
  return RichDesignProfileSchema.parse({
    schemaVersion: 1,
    style,
    density: 'balanced',
    motion: { profile: 'restrained', reducedMotionRequired: true },
    accessibility: 'WCAG-2.2-AA',
  });
}

const sorted = (items: readonly string[]): string[] =>
  [...items].sort((a, b) => a.localeCompare(b));

describe('designPackCatalog', () => {
  it('catalogs exactly the eight canonical styles, sorted by id', () => {
    expect(designPackCatalog.count()).toBe(8);
    const ids = designPackCatalog.packs().map((pack) => pack.id);
    expect(sorted(ids)).toEqual(ids);
    expect(sorted(ids)).toEqual([...DESIGN_STYLES].sort((a, b) => a.localeCompare(b)));
  });

  it('looks each canonical id up and returns undefined for unknown ids', () => {
    for (const id of DESIGN_STYLES) {
      expect(designPackCatalog.pack(id)?.id).toBe(id);
    }
    expect(designPackCatalog.pack('not-a-style')).toBeUndefined();
  });

  it('covers every DESIGN_STYLES entry (no drift between catalogs)', () => {
    const ids = new Set(designPackCatalog.packs().map((pack) => pack.id));
    expect(DESIGN_STYLES.every((id) => ids.has(id))).toBe(true);
  });

  it('returns a fresh sorted copy from packs()', () => {
    const first = designPackCatalog.packs();
    const second = designPackCatalog.packs();
    expect(first).not.toBe(second);
    expect(first.map((pack) => pack.id)).toEqual(second.map((pack) => pack.id));
  });
});

describe('each design pack', () => {
  for (const pack of DESIGN_PACKS) {
    describe(pack.id, () => {
      it('has canonical metadata (id, semver version, name, description)', () => {
        expect(DESIGN_STYLES).toContain(pack.id);
        expect(SEMVER_RE.test(pack.version)).toBe(true);
        expect(pack.name.length).toBeGreaterThan(0);
        expect(pack.description.length).toBeGreaterThan(0);
      });

      it('validates its DTCG tokens cleanly (aliases, cycles, units, duplicates)', () => {
        const motion = pack.id === 'playful' ? 'expressive' : 'restrained';
        expect(dtcTokenEngine.validate(pack.tokens, { motion })).toEqual([]);
      });

      it('resolves every token name and every alias reference', () => {
        const names = new Set(pack.tokens.map((token) => token.name));
        for (const token of pack.tokens) {
          expect(names.has(token.name)).toBe(true);
          if (typeof token.$value === 'string' && token.$value.startsWith('{')) {
            const target = token.$value.slice(1, -1);
            expect(names.has(target)).toBe(true);
          }
        }
      });

      it('emits deterministic DTCG JSON regardless of input order', () => {
        const forward = dtcTokenEngine.emit(pack.tokens);
        const reversed = dtcTokenEngine.emit([...pack.tokens].reverse());
        expect(forward).toBe(reversed);
      });

      it('keeps every text/surface pair above the AA 4.5:1 floor', () => {
        const result = a11yValidator.validate(packProfile(pack.id as DesignStyle), pack.tokens);
        const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
        expect(errors).toEqual([]);
        expect(result.pass).toBe(true);
      });

      it('declares sorted, non-empty style-specific anti-patterns', () => {
        expect(pack.antiPatterns.length).toBeGreaterThan(0);
        expect(sorted(pack.antiPatterns)).toEqual(pack.antiPatterns);
        expect(new Set(pack.antiPatterns).size).toBe(pack.antiPatterns.length);
      });

      it('declares responsive rules and accessibility notes for the docs generator', () => {
        expect(pack.responsive?.length).toBeGreaterThan(0);
        expect(pack.accessibilityNotes?.length).toBeGreaterThan(0);
      });
    });
  }
});

describe('playful expressive motion profile', () => {
  it('provides the motion.express token the engine cross-check requires', () => {
    const playful = designPackCatalog.pack('playful') as DesignPack;
    expect(playful.tokens.some((token) => token.name === 'motion.express')).toBe(true);
    expect(dtcTokenEngine.validate(playful.tokens, { motion: 'expressive' })).toEqual([]);
  });
});
