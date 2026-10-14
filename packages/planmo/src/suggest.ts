/**
 * Suggestion orchestration and evidence verification (AI-setup Plan T18).
 *
 * `planmo suggest` composes four already-frozen pieces into one read-only run:
 *
 *   1. the T15 context engine builds redacted, token-budgeted repository batches;
 *   2. the T17 prompt builder turns those batches into a bounded `{ system, prompt }`;
 *   3. the injected `ModelProvider` is called in TEXT mode;
 *   4. the response is parsed as JSON and validated by `SuggestionReportSchema`
 *      (T16) — the canonical Zod schema is the FINAL gate, never the model's own
 *      claim of validity and never a wire-level JSON Schema.
 *
 * THE SCHEMA IS THE ONLY DOOR. A malformed or schema-invalid response fails
 * closed: no report is returned, the diagnostic names what was wrong, and no
 * partial report is ever accepted (a report a caller cannot trust is worse than
 * no report). Nothing here writes — no file, no `.planmo/`, no `plan.yml` — so
 * every failure path is automatically side-effect free.
 *
 * EVIDENCE IS VERIFIED AGAINST THE SCAN, NOT RE-READ. Every suggestion must cite
 * files and line ranges that actually exist in the inventory the T15 engine
 * produced (`files` + `skipped`), and the line range must fit the file's real
 * (pre-truncation) line count from that scan. The reader is never consulted
 * again: re-reading would let a file change between the scan the model saw and
 * the check that is supposed to ground it.
 *
 * WHY THE WHOLE REPORT IS REJECTED (not the offending suggestion): a fabricated
 * citation is the single most important signal a reviewer needs. Dropping just
 * the bad suggestion would silently turn "the model invented a file" into "the
 * model found one fewer thing", which is exactly the failure a user must see.
 * So one bad evidence reference fails the whole report, and the diagnostic names
 * the path and line range so the fabrication is visible rather than hidden.
 *
 * DETERMINISM: the only sources of nondeterminism are the injected reader and the
 * injected provider; the result carries no timestamp and no random identifier, so
 * identical inputs yield a deep-equal result. There is deliberately no clock or
 * randomness seam to inject because there is nothing nondeterministic to inject.
 *
 * exactOptionalPropertyTypes is ON: optional fields are omitted, never set to
 * `undefined`.
 */
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelUsage,
  ProviderErrorKind,
} from '@planmo/ai';
import { isProviderError } from '@planmo/ai';
import type {
  FileReader,
  SuggestionContextCoverage,
  SuggestionContextOptions,
  SuggestionContextResult,
  SuggestionSkipReason,
} from '@planmo/scanner';
import { suggestionContextEngine } from '@planmo/scanner';
import type { SuggestionCoverage, SuggestionReport } from '@planmo/schema';
import {
  SUGGESTION_CATEGORIES,
  SUGGESTION_EFFORTS,
  SUGGESTION_IMPACTS,
  SUGGESTION_KINDS,
  SuggestionReportSchema,
} from '@planmo/schema';

import type { SuggestContextBatch, SuggestCoverageSummary } from './suggest-build.js';
import { buildSuggestRequest } from './suggest-build.js';

/** Stable diagnostic codes for a `runSuggest` failure. */
export const SUGGEST_DIAGNOSTIC_CODES = [
  'SUG-100', // the provider failed (timeout, auth, rate-limit, transport, aborted)
  'SUG-101', // the response was not parseable JSON
  'SUG-102', // the parsed JSON did not satisfy the report schema
  'SUG-103', // evidence cites a path that is not in the scanned inventory
  'SUG-104', // evidence cites a path that was not submitted for review
  'SUG-105', // evidence line range falls outside the cited file
] as const;

export type SuggestDiagnosticCode = (typeof SUGGEST_DIAGNOSTIC_CODES)[number];

/** One machine-readable reason a suggestion run produced no report. */
export interface SuggestDiagnostic {
  readonly code: SuggestDiagnosticCode;
  readonly severity: 'error';
  readonly message: string;
  /** Evidence path, when the diagnostic is about one. */
  readonly path?: string;
  readonly startLine?: number;
  /** Inclusive 1-based end of the cited range, when the diagnostic is about one. */
  readonly endLine?: number;
  /** Provider failure mode, when the diagnostic is a provider failure. */
  readonly providerKind?: ProviderErrorKind;
}

/** How far a run got before it stopped. */
export type SuggestValidationOutcome =
  'valid' | 'provider-error' | 'malformed-json' | 'schema-invalid' | 'evidence-invalid';

/** Provider identity, taken from the response — never from the model's text. */
export interface SuggestProviderIdentity {
  readonly id: string;
  readonly model: string;
}

/** Everything a caller needs from one suggestion run. */
export interface SuggestRunResult {
  readonly ok: boolean;
  /** The validated report, or null. Never a partial report. */
  readonly report: SuggestionReport | null;
  readonly diagnostics: readonly SuggestDiagnostic[];
  /** The T15 scan coverage for this run. */
  readonly coverage: SuggestionContextCoverage;
  readonly provider: SuggestProviderIdentity;
  readonly usage: ModelUsage;
  readonly validation: SuggestValidationOutcome;
  /** The model's raw text, for diagnosis only. Never written anywhere. */
  readonly raw: string;
}

/** Inputs to a suggestion run. Every seam is injected; nothing is read implicitly. */
export interface SuggestRunOptions {
  readonly provider: ModelProvider;
  /** Read-only file access (a virtual repo in tests). */
  readonly reader: FileReader;
  /** Repository root passed to the context engine. Default `''`. */
  readonly root?: string;
  readonly context?: SuggestionContextOptions;
  /**
   * A context result the caller already built (e.g. to show a consent summary).
   * When present it is used as-is and the repository is NOT scanned again, so the
   * numbers a user consented to are exactly the bytes that ship.
   */
  readonly prebuiltContext?: SuggestionContextResult;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

/**
 * What the scan knows about one path. An included file has content, so its line
 * count is authoritative; a skipped path has no content, so it can never ground
 * an evidence line range.
 */
type InventoryEntry =
  | { readonly kind: 'included'; readonly lineCount: number }
  | { readonly kind: 'skipped'; readonly reason: SuggestionSkipReason };

/**
 * The path -> knowledge map the T15 result implies. Never re-reads the reader.
 *
 * The line count is the T15 file's PRE-truncation `lineCount`, not the line
 * count of the (possibly cut-off) content, so a truncated file does not reject
 * a citation that lies within the original file. It is still the real file
 * length, so a citation past the end of the file remains a `SUG-105` failure —
 * the fail-closed property is unchanged.
 */
function buildInventory(context: SuggestionContextResult): Map<string, InventoryEntry> {
  const inventory = new Map<string, InventoryEntry>();
  for (const file of context.files) {
    inventory.set(file.path, { kind: 'included', lineCount: file.lineCount });
  }
  for (const skipped of context.skipped) {
    if (!inventory.has(skipped.path)) {
      inventory.set(skipped.path, { kind: 'skipped', reason: skipped.reason });
    }
  }
  return inventory;
}

/** Map the T15 coverage block onto the T17 builder's summary. */
function toBuildCoverage(context: SuggestionContextResult): SuggestCoverageSummary {
  const { coverage, files } = context;
  const excludedFiles = coverage.skippedByReason.excluded;
  const redactedFiles = files.filter((file) => file.redactionCount > 0).length;
  const estimatedInputTokens = files.reduce((sum, file) => sum + file.estimatedTokens, 0);
  return {
    inventoriedFiles: coverage.totalFiles,
    eligibleFiles: Math.max(0, coverage.totalFiles - excludedFiles),
    submittedFiles: coverage.included,
    excludedFiles,
    redactedFiles,
    omittedFiles: Math.max(0, coverage.totalFiles - coverage.included - excludedFiles),
    estimatedInputTokens,
    truncated: coverage.truncated,
  };
}

/** The authoritative coverage PlanMo supplies into the final report. */
function toReportCoverage(context: SuggestionContextResult, usage: ModelUsage): SuggestionCoverage {
  const build = toBuildCoverage(context);
  return {
    inventoriedFiles: build.inventoriedFiles,
    eligibleFiles: build.eligibleFiles,
    submittedFiles: build.submittedFiles,
    excludedFiles: build.excludedFiles,
    redactedFiles: build.redactedFiles,
    omittedFiles: build.omittedFiles,
    estimatedInputTokens: build.estimatedInputTokens,
    actualInputTokens: usage.inputTokens,
    truncated: build.truncated,
  };
}

/** Map T15 batches onto the T17 builder's batch shape (stable `batch-NN` ids). */
function toBuildBatches(context: SuggestionContextResult): SuggestContextBatch[] {
  return context.batches.map((batch) => ({
    id: `batch-${String(batch.index + 1).padStart(2, '0')}`,
    files: batch.files.map((file) => ({ path: file.path, content: file.content })),
  }));
}

/**
 * Verify every evidence reference against the scanned inventory.
 *
 * Returns one diagnostic per bad reference (path absent, path not submitted, or
 * line range outside the file). An empty array means every reference is grounded.
 */
function verifyEvidence(
  report: SuggestionReport,
  inventory: ReadonlyMap<string, InventoryEntry>,
): SuggestDiagnostic[] {
  const diagnostics: SuggestDiagnostic[] = [];
  for (const suggestion of report.suggestions) {
    for (const evidence of suggestion.evidence) {
      const entry = inventory.get(evidence.path);
      if (entry === undefined) {
        diagnostics.push({
          code: 'SUG-103',
          severity: 'error',
          message: `suggestion ${suggestion.id} cites '${evidence.path}', which is not in the scanned file inventory`,
          path: evidence.path,
          startLine: evidence.startLine,
          endLine: evidence.endLine,
        });
        continue;
      }
      if (entry.kind === 'skipped') {
        diagnostics.push({
          code: 'SUG-104',
          severity: 'error',
          message: `suggestion ${suggestion.id} cites '${evidence.path}', which was not submitted for review (skipped: ${entry.reason})`,
          path: evidence.path,
          startLine: evidence.startLine,
          endLine: evidence.endLine,
        });
        continue;
      }
      if (evidence.startLine > entry.lineCount || evidence.endLine > entry.lineCount) {
        diagnostics.push({
          code: 'SUG-105',
          severity: 'error',
          message: `suggestion ${suggestion.id} cites '${evidence.path}' lines ${evidence.startLine}-${evidence.endLine}, but the file has ${entry.lineCount} line(s)`,
          path: evidence.path,
          startLine: evidence.startLine,
          endLine: evidence.endLine,
        });
      }
    }
  }
  return diagnostics;
}

/** The provider-failure diagnostic, naming the machine-readable failure mode. */
function providerDiagnostic(error: unknown): SuggestDiagnostic {
  if (isProviderError(error)) {
    return {
      code: 'SUG-100',
      severity: 'error',
      message: `the provider failed (${error.kind}): ${error.message}`,
      providerKind: error.kind,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: 'SUG-100', severity: 'error', message: `the provider failed: ${message}` };
}

/** The malformed-JSON diagnostic. */
function malformedJsonDiagnostic(error: unknown): SuggestDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: 'SUG-101',
    severity: 'error',
    message: `the model returned malformed JSON: ${message}`,
  };
}

/** The subset of a Zod issue this module reads (avoids a direct zod dependency). */
interface SchemaIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** At most this many schema issues are surfaced; a strict schema can report many. */
const MAX_SCHEMA_DIAGNOSTICS = 8;

/** One diagnostic per Zod issue, capped, so a broken shape stays readable. */
function schemaDiagnostics(issues: readonly SchemaIssue[]): SuggestDiagnostic[] {
  return issues.slice(0, MAX_SCHEMA_DIAGNOSTICS).map((issue) => ({
    code: 'SUG-102',
    severity: 'error',
    message: `report schema violation at ${issue.path.join('.') || '(root)'}: ${issue.message}`,
  }));
}

/** Assemble a failure result: no report, coverage preserved, diagnostics attached. */
function failure(
  context: SuggestionContextResult,
  provider: SuggestProviderIdentity,
  validation: SuggestValidationOutcome,
  diagnostics: readonly SuggestDiagnostic[],
  usage: ModelUsage,
  raw: string,
): SuggestRunResult {
  return {
    ok: false,
    report: null,
    diagnostics,
    coverage: context.coverage,
    provider,
    usage,
    validation,
    raw,
  };
}

const ZERO_USAGE: ModelUsage = { inputTokens: 0, outputTokens: 0 };

/**
 * Run one suggestion pass: scan context -> prompt -> provider -> schema -> evidence.
 *
 * Read-only and deterministic. Returns the validated report (with the provider
 * identity and coverage PlanMo supplies, not the model's claims) on success, or a
 * failure result with diagnostics and a null report on any failure. Never writes.
 */
export async function runSuggest(options: SuggestRunOptions): Promise<SuggestRunResult> {
  const { provider, reader } = options;

  // A caller that already built the context (to show a consent summary) passes
  // it in; re-scanning here would let the repository change between the numbers
  // the user consented to and the bytes that actually ship.
  const context =
    options.prebuiltContext ??
    (await suggestionContextEngine().build(options.root ?? '', reader, options.context));
  const identity: SuggestProviderIdentity = { id: provider.id, model: provider.model };

  const request = buildSuggestRequest({
    batches: toBuildBatches(context),
    coverage: toBuildCoverage(context),
    enums: {
      kinds: SUGGESTION_KINDS,
      categories: SUGGESTION_CATEGORIES,
      impacts: SUGGESTION_IMPACTS,
      efforts: SUGGESTION_EFFORTS,
    },
  });

  const modelRequest: ModelRequest = {
    system: request.system,
    prompt: request.prompt,
    mode: 'text',
    ...(options.maxOutputTokens !== undefined ? { maxOutputTokens: options.maxOutputTokens } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  };

  let response: ModelResponse;
  try {
    response = await provider.generate(modelRequest, options.signal);
  } catch (error) {
    return failure(
      context,
      identity,
      'provider-error',
      [providerDiagnostic(error)],
      ZERO_USAGE,
      '',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch (error) {
    return failure(
      context,
      identity,
      'malformed-json',
      [malformedJsonDiagnostic(error)],
      response.usage,
      response.text,
    );
  }

  const shape = SuggestionReportSchema.safeParse(parsed);
  if (!shape.success) {
    return failure(
      context,
      identity,
      'schema-invalid',
      schemaDiagnostics(shape.error.issues),
      response.usage,
      response.text,
    );
  }

  const evidenceDiagnostics = verifyEvidence(shape.data, buildInventory(context));
  if (evidenceDiagnostics.length > 0) {
    return failure(
      context,
      identity,
      'evidence-invalid',
      evidenceDiagnostics,
      response.usage,
      response.text,
    );
  }

  // The model's `provider` and `coverage` are claims; PlanMo knows the truth, so
  // it supplies the authoritative values (as the T17 system prompt states).
  const report: SuggestionReport = {
    ...shape.data,
    provider: identity,
    coverage: toReportCoverage(context, response.usage),
  };

  return {
    ok: true,
    report,
    diagnostics: [],
    coverage: context.coverage,
    provider: identity,
    usage: response.usage,
    validation: 'valid',
    raw: response.text,
  };
}
