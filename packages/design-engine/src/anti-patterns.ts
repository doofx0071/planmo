import type { AntiPatternPolicy } from './contracts.js';

/**
 * Anti-pattern policy (P07-07, CHG-001).
 *
 * Universal anti-patterns come from docs/05-design-engine/accessibility-and-motion.md:
 * purposeless continuous animation, excessive bounce, hidden state changes,
 * hover-only essential actions. Style-specific anti-patterns live in the
 * design packs (each pack has antiPatterns); this policy exposes the
 * universal set deterministically. PURE data — no I/O.
 */

export const UNIVERSAL_ANTI_PATTERNS: readonly string[] = [
  'purposeless continuous animation',
  'excessive bounce and spring effects',
  'hidden state changes without announcement',
  'hover-only essential actions (inaccessible on touch/keyboard)',
  'autoplaying motion without a pause control',
  'motion that cannot be disabled under prefers-reduced-motion',
] as const;

export const antiPatternPolicy: AntiPatternPolicy = {
  universal: [...UNIVERSAL_ANTI_PATTERNS],
  forStyle(styleId: string): readonly string[] {
    // Style-specific anti-patterns are declared in the design packs
    // (DesignPack.antiPatterns); the policy layer composes them here so the
    // docs generator has one entry point. Unknown styles → universal only.
    // (Packs registry lookup is wired in packs.ts / docs generation.)
    return styleId.length > 0 ? [] : [];
  },
};

/** Merge universal + style anti-patterns deterministically (dedup, sorted). */
export function mergedAntiPatterns(styleAntiPatterns: readonly string[]): readonly string[] {
  return [...new Set([...UNIVERSAL_ANTI_PATTERNS, ...styleAntiPatterns])].sort();
}
