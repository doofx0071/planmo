import type { RichDesignProfile } from '@planmo/schema';
import type {
  A11yCheckResult,
  A11yDiagnostic,
  A11ySeverity,
  A11yValidator,
  DtcToken,
} from './contracts.js';
import { isAlias } from './tokens.js';
import { dtcTokenEngine } from './tokens.js';

/**
 * Accessibility & motion validator (P07-06, CHG-001).
 *
 * Validates a rich design profile + resolved DTCG tokens against the WCAG
 * 2.2 AA default target (docs/05-design-engine/accessibility-and-motion.md).
 * Accessibility outranks visual style: style can never override contrast,
 * keyboard navigation, focus visibility, semantics, reduced motion, touch
 * targets, or accessible names — violations surface here as diagnostics.
 *
 * Checks (documented heuristics):
 *  - contrast: when the profile targets AA or AAA and the pack provides
 *    `color.text.*` and `color.surface.*` tokens, every text/surface pair is
 *    checked with the exact WCAG relative-luminance/contrast-ratio math for
 *    6-digit hex literals. Alias values are resolved through
 *    dtcTokenEngine.resolve before comparison. Floors: AA 4.5:1 normal /
 *    3:1 large; AAA 7:1 normal / 4.5:1 large. Same-color text/surface pairs
 *    additionally warn (text and surface tokens must differ).
 *  - reduced motion: frontend (non-backendOnly) profiles must declare
 *    motion.reducedMotionRequired === true (WCAG 2.3.3) — error otherwise.
 *  - touch targets: `compact` density risks targets below the 44px floor
 *    (WCAG 2.5.8) — warning. Heuristic: density is the only proxy available
 *    in the profile; exact target-size auditing happens at render time.
 *  - reduced-motion availability: a `motion.duration.slow` token means a
 *    reduced-motion variant can be offered — info.
 *  - style override: tokens in the reserved `a11y.*` namespace with a
 *    skip-like literal value (skip/true/1/none/off/disabled) declare that
 *    style overrides an accessibility requirement — error. NOTE: the frozen
 *    validate(profile, tokens) signature has no DesignPack, so pack
 *    accessibilityNotes claiming contrast skips are proxied through the
 *    `a11y.*` token namespace; wiring the notes directly is deferred until
 *    the caller passes pack metadata (flagged contract discrepancy).
 *
 * Backend-only profiles have no frontend surface and always validate clean.
 * PURE + deterministic: identical input always yields identical diagnostics,
 * sorted by severity (error > warning > info) then code.
 */

/* eslint-disable sort-imports */
const SEVERITY_RANK: Record<A11ySeverity, number> = { error: 0, warning: 1, info: 2 };

const HEX6_RE = /^#[0-9a-fA-F]{6}$/;
const SURFACE_RE = /^color\.surface(\.|$)/;
const TEXT_RE = /^color\.text(\.|$)/;
const A11Y_OVERRIDE_VALUES = new Set(['skip', 'true', '1', 'none', 'off', 'disabled']);

/** WCAG contrast floors for a given target level (AA default). */
function contrastFloors(accessibility: RichDesignProfile['accessibility'] | undefined): {
  normal: number;
  large: number;
} {
  if (accessibility === 'WCAG-2.2-AAA') return { normal: 7, large: 4.5 };
  return { normal: 4.5, large: 3 };
}

/** WCAG relative luminance of an sRGB channel (0..255). */
function channelLuminance(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #rrggbb color (0..1). */
function relativeLuminance(hex: string): number {
  return (
    0.2126 * channelLuminance(parseInt(hex.slice(1, 3), 16)) +
    0.7152 * channelLuminance(parseInt(hex.slice(3, 5), 16)) +
    0.0722 * channelLuminance(parseInt(hex.slice(5, 7), 16))
  );
}

/** WCAG contrast ratio between two #rrggbb colors (1..21). */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolve a token to a literal 6-digit hex color, following alias chains. */
function resolveHexColor(token: DtcToken, tokens: readonly DtcToken[]): string | undefined {
  const seen = new Set<string>();
  let current = token;
  for (;;) {
    if (seen.has(current.name)) return undefined; // alias cycle — not checkable
    seen.add(current.name);
    const value = current.$value;
    if (typeof value !== 'string') return undefined;
    if (HEX6_RE.test(value)) return value;
    if (!isAlias(value)) return undefined;
    const next = dtcTokenEngine.resolve(value, tokens);
    if (!next) return undefined;
    current = next;
  }
}

const byName = (a: DtcToken, b: DtcToken): number => a.name.localeCompare(b.name);

export const a11yValidator: A11yValidator = {
  validate(profile, tokens) {
    if (profile.backendOnly === true) {
      // No frontend surface — nothing to validate against (valid profile state).
      return { diagnostics: [], pass: true };
    }

    const diagnostics: A11yDiagnostic[] = [];

    // Reduced motion is mandatory for product UI (WCAG 2.3.3); a frontend
    // profile must opt in explicitly — absence is an error, never a default.
    if (profile.motion?.reducedMotionRequired !== true) {
      diagnostics.push({
        severity: 'error',
        code: 'motion.reduced',
        message:
          'frontend profile must require reduced motion (motion.reducedMotionRequired) — WCAG 2.3.3 cannot be disabled by style',
      });
    }

    // Compact density risks touch targets below the 44px floor (WCAG 2.5.8).
    // Heuristic: density (compact/balanced/spacious) is the profile-level
    // proxy for target size; exact sizes are audited at render time.
    if (profile.density === 'compact') {
      diagnostics.push({
        severity: 'warning',
        code: 'touch.target',
        message:
          'density "compact" risks touch targets below 44px (WCAG 2.5.8) — verify interactive element sizes',
      });
    }

    // A slow-duration token means a reduced-motion variant can be offered.
    if (tokens.some((t) => t.name === 'motion.duration.slow')) {
      diagnostics.push({
        severity: 'info',
        code: 'motion.reduced-available',
        message:
          'motion.duration.slow token exists — reduced-motion variant can be provided under prefers-reduced-motion',
      });
    }

    // Style cannot override accessibility: reserved `a11y.*` tokens that
    // declare a skip (e.g. "a11y.contrast-skip: true") are errors.
    for (const token of [...tokens].sort(byName)) {
      if (!token.name.startsWith('a11y.')) continue;
      if (typeof token.$value !== 'string') continue;
      const literal = A11Y_OVERRIDE_VALUES.has(token.$value.toLowerCase());
      if (!literal && !isAlias(token.$value)) continue;
      if (literal) {
        diagnostics.push({
          severity: 'error',
          code: 'a11y.style-override',
          message: `accessibility cannot be overridden by style: token "${token.name}" declares a skip ("${token.$value}")`,
        });
      }
    }

    // Contrast (AA or AAA): every text token against every surface token.
    const level = profile.accessibility ?? 'WCAG-2.2-AA';
    if (level === 'WCAG-2.2-AA' || level === 'WCAG-2.2-AAA') {
      const floors = contrastFloors(level);
      const surfaces = tokens.filter((t) => SURFACE_RE.test(t.name)).sort(byName);
      const texts = tokens.filter((t) => TEXT_RE.test(t.name)).sort(byName);
      for (const text of texts) {
        const textHex = resolveHexColor(text, tokens);
        if (!textHex) continue; // alias cycle / non-hex literal — not checkable
        for (const surface of surfaces) {
          const surfaceHex = resolveHexColor(surface, tokens);
          if (!surfaceHex) continue;
          if (textHex === surfaceHex) {
            diagnostics.push({
              severity: 'warning',
              code: 'contrast.text-surface-equal',
              message: `text token "${text.name}" and surface token "${surface.name}" both resolve to "${textHex}" — text and surface tokens must differ`,
            });
          }
          const ratio = contrastRatio(textHex, surfaceHex);
          if (ratio < floors.normal) {
            diagnostics.push({
              severity: 'error',
              code: 'contrast.aa-text',
              message: `text "${text.name}" on "${surface.name}": contrast ratio ${ratio.toFixed(2)}:1 is below ${floors.normal}:1 (${level} normal text)`,
            });
          }
          if (ratio < floors.large) {
            diagnostics.push({
              severity: 'error',
              code: 'contrast.large-text',
              message: `text "${text.name}" on "${surface.name}": contrast ratio ${ratio.toFixed(2)}:1 is below ${floors.large}:1 (${level} large text)`,
            });
          }
        }
      }
    }

    const sorted = [...diagnostics].sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (bySeverity !== 0) return bySeverity;
      return a.code.localeCompare(b.code);
    });
    return { diagnostics: sorted, pass: sorted.every((d) => d.severity !== 'error') };
  },
};
