import type { MotionProfile, RegistryItem, RichDesignProfile } from '@planmo/schema';

/**
 * FROZEN Phase 07 contracts (design engine).
 *
 * Workers implement against THESE interfaces only. All renderers/builders
 * are PURE + deterministic: no timestamps, no randomness, no filesystem,
 * no CLI execution. Sort every array before it appears in output.
 * exactOptionalPropertyTypes is ON: omit optional fields, never set them to
 * undefined.
 */

// ------------------------------------------------------------- DTCG tokens

/** A DTCG token value: literal, alias reference, or nested object group. */
export type TokenValue = string | number | readonly string[] | readonly DtcToken[] | DtcToken;

export interface DtcToken {
  /** DTCG token name, e.g. "color.surface.canvas" (dot-separated). */
  name: string;
  /** DTCG $type (color, dimension, number, duration, typography...). */
  $type?: string;
  /** Literal value or a `{ref}` alias to another token. */
  $value: TokenValue;
}

/** One resolved design pack: style metadata + tokens + anti-patterns. */
export interface DesignPack {
  /** Canonical style id, e.g. "minimal" (must exist in DESIGN_STYLES). */
  id: string;
  /** Pack version, semver. */
  version: string;
  name: string;
  description: string;
  /** Structured tokens in DTCG shape (may use `{alias}` refs). */
  tokens: readonly DtcToken[];
  /** Anti-patterns that MUST NOT be used (exit gate: docs carry them). */
  antiPatterns: readonly string[];
  /** Responsive rules for this style. */
  responsive?: readonly string[];
  /** Accessibility notes for this style. */
  accessibilityNotes?: readonly string[];
}

export interface TokenValidationDiagnostic {
  code: 'missing-reference' | 'cycle' | 'invalid-value' | 'duplicate-name';
  token: string;
  message: string;
}

export interface DtcTokenEngine {
  /** Resolve an alias or name to its token; undefined when unknown. */
  resolve(nameOrRef: string, tokens: readonly DtcToken[]): DtcToken | undefined;
  /** Validate the token set: missing refs, cycles, invalid values, dups. */
  validate(
    tokens: readonly DtcToken[],
    context: { motion?: MotionProfile },
  ): readonly TokenValidationDiagnostic[];
  /** Emit canonical DTCG JSON (sorted, deterministic). */
  emit(tokens: readonly DtcToken[]): string;
}

// ------------------------------------------------------------- design packs

export interface DesignPackCatalog {
  /** All packs, sorted by id. */
  packs(): readonly DesignPack[];
  /** Lookup by style id; undefined when unknown. */
  pack(id: string): DesignPack | undefined;
  /** Count of packs (exit gate: 8). */
  count(): number;
}

// --------------------------------------------------------- registry adapter

export interface RegistryResolveInput {
  /** Registry base URL, e.g. "https://ui.shadcn.com/r". */
  baseUrl: string;
  /** Item path without scheme, e.g. "styles/new-york/button.json". */
  itemPath: string;
  /** Trust classification of the registry. */
  trust: RegistryItem['trust'];
  /** Optional expected integrity. */
  integrity?: string;
  /** Optional version/ref. */
  version?: string;
  /**
   * Optional review override when the caller can prove prior review.
   * Default true; FORCED true (never false) when trust is community/untrusted.
   */
  requiresReview?: boolean;
}

export interface RegistryResolveResult {
  /** The resolved item (registered against RegistryItemSchema rules). */
  item: RegistryItem;
  /** Whether the resolved item requires explicit human review. */
  requiresReview: boolean;
  /** Deterministic reason string (never empty). */
  note: string;
}

export interface ShadcnRegistryAdapter {
  /** Build a RegistryItem from an input. Pure; rejects file:// and bad refs. */
  resolve(input: RegistryResolveInput): RegistryResolveResult;
}

// ------------------------------------------------------------ design docs

export interface DesignDocsInput {
  profile: RichDesignProfile;
  /** Selected design pack(s), sorted by id. */
  packs: readonly DesignPack[];
  /** Resolved tokens (validated). */
  tokens: readonly DtcToken[];
}

export interface DesignDocsOutput {
  /** Full markdown design guidance document. */
  markdown: string;
  /** Section titles in document order (deterministic). */
  sections: readonly string[];
}

export interface DesignDocsGenerator {
  generate(input: DesignDocsInput): DesignDocsOutput;
}

// ------------------------------------------------- accessibility/motion

export type A11ySeverity = 'error' | 'warning' | 'info';

export interface A11yDiagnostic {
  severity: A11ySeverity;
  code: string;
  message: string;
}

export interface A11yCheckResult {
  /** All diagnostics, sorted by (severity, code). */
  diagnostics: readonly A11yDiagnostic[];
  /** True when no 'error' diagnostics exist. */
  pass: boolean;
}

export interface A11yValidator {
  /** Validate a profile + resolved tokens against WCAG 2.2 AA defaults. */
  validate(profile: RichDesignProfile, tokens: readonly DtcToken[]): A11yCheckResult;
}

// ------------------------------------------------------------- anti-patterns

/** Deterministic anti-pattern policy lookup (CHG-001 P07-07). */
export interface AntiPatternPolicy {
  /** Style-independent anti-patterns (from accessibility-and-motion.md). */
  universal: readonly string[];
  /** Style-specific anti-patterns for the given pack id (empty when unknown). */
  forStyle(styleId: string): readonly string[];
}
