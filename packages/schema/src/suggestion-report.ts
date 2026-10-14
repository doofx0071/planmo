import { z } from 'zod';
import { NonEmptyString, SCHEMA_VERSION } from './common.js';

/**
 * Versioned, strict report contract for `planmo suggest` (T16).
 *
 * `planmo suggest` is read-only and advisory: a model proposes observations,
 * risks, improvements, and feature ideas grounded in repository evidence. This
 * schema is the fail-closed gate between untrusted model output and anything
 * PlanMo renders, stores, or shows a user.
 *
 * Decisions frozen here:
 * - Strict at every level. Unknown keys are rejected rather than stripped so a
 *   model cannot smuggle fields past the contract. There is deliberately no
 *   `extensions` map: unlike other PlanMo documents, this report is untrusted
 *   model output, and an open map would let it carry quoted source snippets,
 *   which the plan forbids ("Do not persist quoted source snippets").
 * - No field can carry raw source: the shape simply has no `snippet`/`code`
 *   slot, and strict objects reject them if a model adds one.
 * - Evidence paths are relative POSIX repo paths (see
 *   `SuggestionEvidencePathSchema`) with a verified line range.
 * - `suggestions` may be empty: a clean or unremarkable repository can honestly
 *   yield zero suggestions, so a non-empty array is not required. A suggestion
 *   that *is* present, however, must cite at least one evidence entry.
 */

/** What a suggestion is: a neutral observation or an actionable claim. */
export const SUGGESTION_KINDS = ['observation', 'risk', 'improvement', 'feature-idea'] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

/** The area a suggestion belongs to (plan line 104). */
export const SUGGESTION_CATEGORIES = [
  'product',
  'architecture',
  'frontend',
  'backend',
  'data',
  'design',
  'accessibility',
  'security',
  'reliability',
  'performance',
  'testing',
  'documentation',
  'developer-experience',
] as const;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

/** How much the finding matters if true. */
export const SUGGESTION_IMPACTS = ['low', 'medium', 'high'] as const;
export type SuggestionImpact = (typeof SUGGESTION_IMPACTS)[number];

/** How much work the recommendation implies. */
export const SUGGESTION_EFFORTS = ['small', 'medium', 'large'] as const;
export type SuggestionEffort = (typeof SUGGESTION_EFFORTS)[number];

/** Control (`Cc`) and format (`Cf`) characters, including bidi overrides. */
const ControlOrFormatCharacter = /[\p{Cc}\p{Cf}]/u;

/** A Windows drive-letter prefix, e.g. `C:`. */
const WindowsDrivePrefix = /^[A-Za-z]:/;

/** Non-negative integer counter or token count. */
const NonNegativeInt = z.number().int().nonnegative();

/** Confidence in the closed interval [0, 1]; NaN and Infinity are rejected. */
const Confidence = z
  .number()
  .min(0, { message: 'confidence must be between 0 and 1' })
  .max(1, { message: 'confidence must be between 0 and 1' })
  .refine(Number.isFinite, { message: 'confidence must be a finite number' });

/**
 * A relative POSIX path to a file inside the scanned repository.
 *
 * Rejects (fail-closed): absolute paths, Windows drive paths, backslashes,
 * empty path segments, `.`/`..` segments, and control/format characters. This
 * keeps evidence anchored to the repository and un-spoofable by traversal.
 */
export const SuggestionEvidencePathSchema = z.string().superRefine((value, context) => {
  if (value.trim() === '') {
    context.addIssue({ code: 'custom', message: 'evidence path must not be empty' });
    return;
  }
  if (ControlOrFormatCharacter.test(value)) {
    context.addIssue({
      code: 'custom',
      message: 'evidence path must not contain control or format characters',
    });
    return;
  }
  if (value.includes('\\')) {
    context.addIssue({
      code: 'custom',
      message: 'evidence path must use forward slashes (relative POSIX path)',
    });
    return;
  }
  if (value.startsWith('/')) {
    context.addIssue({
      code: 'custom',
      message: 'evidence path must be relative to the repository root',
    });
    return;
  }
  if (WindowsDrivePrefix.test(value)) {
    context.addIssue({ code: 'custom', message: 'evidence path must not be a Windows drive path' });
    return;
  }

  const segments = value.split('/');
  if (segments.some((segment) => segment === '')) {
    context.addIssue({ code: 'custom', message: 'evidence path must not contain empty segments' });
  }
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    context.addIssue({
      code: 'custom',
      message: 'evidence path must not contain "." or ".." traversal segments',
    });
  }
});

/** A file and 1-based inclusive line range that grounds a suggestion. */
export const SuggestionEvidenceSchema = z
  .strictObject({
    path: SuggestionEvidencePathSchema,
    startLine: z.number().int().min(1),
    endLine: z.number().int().min(1),
  })
  .superRefine((evidence, context) => {
    if (evidence.endLine < evidence.startLine) {
      context.addIssue({
        code: 'custom',
        path: ['endLine'],
        message: 'endLine must be greater than or equal to startLine',
      });
    }
  });
export type SuggestionEvidence = z.infer<typeof SuggestionEvidenceSchema>;

/** One advisory suggestion. Must cite at least one real evidence reference. */
export const SuggestionSchema = z.strictObject({
  id: NonEmptyString,
  kind: z.enum(SUGGESTION_KINDS),
  category: z.enum(SUGGESTION_CATEGORIES),
  title: NonEmptyString,
  rationale: NonEmptyString,
  recommendation: NonEmptyString,
  impact: z.enum(SUGGESTION_IMPACTS),
  effort: z.enum(SUGGESTION_EFFORTS),
  confidence: Confidence,
  evidence: z.array(SuggestionEvidenceSchema).min(1),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

/** Provider that produced the report (id + model id, never a credential). */
export const SuggestionProviderSchema = z.strictObject({
  id: NonEmptyString,
  model: NonEmptyString,
});
export type SuggestionProvider = z.infer<typeof SuggestionProviderSchema>;

/** Honest scan/upload coverage: what was seen vs. submitted vs. dropped. */
export const SuggestionCoverageSchema = z.strictObject({
  inventoriedFiles: NonNegativeInt,
  eligibleFiles: NonNegativeInt,
  submittedFiles: NonNegativeInt,
  excludedFiles: NonNegativeInt,
  redactedFiles: NonNegativeInt,
  omittedFiles: NonNegativeInt,
  estimatedInputTokens: NonNegativeInt,
  actualInputTokens: NonNegativeInt,
  truncated: z.boolean(),
});
export type SuggestionCoverage = z.infer<typeof SuggestionCoverageSchema>;

/**
 * The canonical `planmo suggest` report. Strict, versioned, and free of any
 * field that could carry quoted source. `suggestions` may be empty.
 */
export const SuggestionReportSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  provider: SuggestionProviderSchema,
  summary: NonEmptyString,
  coverage: SuggestionCoverageSchema,
  limitations: z.array(NonEmptyString),
  suggestions: z.array(SuggestionSchema),
});
export type SuggestionReport = z.infer<typeof SuggestionReportSchema>;
