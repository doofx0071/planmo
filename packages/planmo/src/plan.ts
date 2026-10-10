import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ModelProvider, ModelUsage } from '@planmo/ai';
import { readStatus, writeManaged } from '@planmo/core';
import { PLAN_PATH, PlanDocument, type PlanningDepth } from '@planmo/schema';
import type { PlanDiagnostic } from '@planmo/generator';
import { buildPlan } from './plan-build.js';
import { collectRequirementIds } from './trace.js';
import { WorkspaceNotFoundError } from './workspace-error.js';

/**
 * `planmo plan` — author the plan document, once, and record it.
 *
 * The whole design rests on one split: a model authors the plan, and the compiler
 * then reads the pinned document. So this command does its model call, validates
 * the result, writes `.planmo/plan.yml`, and is never run again by `generate`.
 * Everything after this point is deterministic.
 *
 * Two properties are load-bearing and tested:
 *
 *   - A plan that fails validation writes NOTHING. The previous `plan.yml`, if any,
 *     is left byte-identical. A failed planning operation must not destroy the last
 *     valid plan (spec §19), and that is a property of the code path, not a hope.
 *   - A plan the user already owns is a COLLISION, not a silent overwrite, unless
 *     `--force`. The user may have hand-edited their plan; regeneration must not
 *     quietly discard that.
 */

export interface RunPlanOptions {
  root: string;
  /** The idea, verbatim from the command line. */
  idea: string;
  provider: ModelProvider;
  /** Recorded in the document, so the plan always names its author. */
  providerId: string;
  model: string;
  dryRun?: boolean;
  allowOverwrite?: boolean;
  /** Read-only repository evidence for a brownfield project. Untrusted data. */
  repositoryEvidence?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RunPlanOutcome {
  ok: boolean;
  /** The validated plan, or null. Never partial. */
  plan: PlanDocument | null;
  diagnostics: PlanDiagnostic[];
  /** Paths written this run (empty on a dry run or a refusal). */
  written: string[];
  /** Paths refused because the user owns them. */
  collisions: string[];
  usage: ModelUsage;
  /** The rendered summary, ready to print. */
  text: string;
}

const TRACEABILITY_PATH = 'planning/REQUIREMENTS-TRACEABILITY.md';

/** Requirement ids the workspace declares, or undefined when it declares none. */
async function knownRequirementIds(root: string): Promise<readonly string[] | undefined> {
  try {
    const doc = await readFile(join(root, TRACEABILITY_PATH), 'utf8');
    const ids = collectRequirementIds(doc);
    return ids.length > 0 ? ids : undefined;
  } catch {
    // No traceability document yet is a valid state — a plan may be authored
    // before the requirements exist, and the validator then skips ref checking.
    return undefined;
  }
}

/**
 * Serialise the plan for disk.
 *
 * Key order is deterministic because `PlanDocument.safeParse` rebuilds the object
 * following the schema's field order, so the same plan always yields the same
 * bytes. That matters for diffing a hand-edited plan and for the workspace's
 * `inputHash` once `generate` reads this file.
 */
export function serializePlan(plan: PlanDocument): string {
  return stringifyYaml(plan);
}

/** Parse a plan document off disk. Returns null when it is absent or invalid. */
export async function readPlanDocument(root: string): Promise<PlanDocument | null> {
  try {
    const raw = await readFile(join(root, PLAN_PATH), 'utf8');
    const parsed: unknown = parseYaml(raw);
    // The schema is the gate here too: a hand-edited plan.yml that no longer
    // matches is treated as absent rather than compiled from, so a broken plan
    // degrades to the canonical spine instead of producing a broken workspace.
    const result = PlanDocument.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function runPlan(opts: RunPlanOptions): Promise<RunPlanOutcome> {
  const status = await readStatus({ root: opts.root });
  if (status.project === null) throw new WorkspaceNotFoundError(opts.root);

  // `planning` is optional in the project schema; `standard` is the same fallback
  // the IR builder uses when a project declares no planning block.
  const depth: PlanningDepth = status.project.planning?.depth ?? 'standard';
  const requirementIds = await knownRequirementIds(status.root);

  const built = await buildPlan({
    provider: opts.provider,
    idea: opts.idea,
    depth,
    ...(requirementIds !== undefined ? { requirementIds } : {}),
    ...(opts.repositoryEvidence !== undefined
      ? { repositoryEvidence: opts.repositoryEvidence }
      : {}),
    ...(opts.maxOutputTokens !== undefined ? { maxOutputTokens: opts.maxOutputTokens } : {}),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
  });

  if (!built.ok || built.plan === null) {
    // Nothing is written on this path — that is the guarantee, so return before
    // any filesystem call.
    const failed: RunPlanOutcome = {
      ok: false,
      plan: null,
      diagnostics: built.diagnostics,
      written: [],
      collisions: [],
      usage: built.usage,
      text: '',
    };
    return { ...failed, text: renderPlanSummary(failed) };
  }

  // Record the author inside the document itself, so a plan always names the
  // provider and model that produced it.
  const document: PlanDocument = {
    ...built.plan,
    provider: { id: opts.providerId, model: opts.model },
  };

  const result = await writeManaged(
    status.root,
    [{ path: PLAN_PATH, content: serializePlan(document) }],
    {
      ...(opts.allowOverwrite === true ? { allowOverwrite: true } : {}),
      ...(opts.dryRun === true ? { dryRun: true } : {}),
    },
  );

  const outcome: RunPlanOutcome = {
    ok: true,
    plan: document,
    diagnostics: built.diagnostics,
    written: result.written,
    collisions: result.collisions,
    usage: built.usage,
    text: '',
  };
  return { ...outcome, text: renderPlanSummary(outcome) };
}

/**
 * The summary (spec §10).
 *
 * Counts are real — computed from the document that was actually validated and
 * written — and unresolved questions are shown rather than buried, because a plan
 * that hides its own uncertainty is the failure mode this whole design exists to
 * prevent.
 */
export function renderPlanSummary(outcome: RunPlanOutcome): string {
  const lines: string[] = [];

  if (!outcome.ok || outcome.plan === null) {
    lines.push('plan: FAILED — nothing was written.');
    for (const diagnostic of outcome.diagnostics) {
      lines.push(
        `  ${diagnostic.severity} ${diagnostic.code} ${diagnostic.target} — ${diagnostic.message}`,
      );
      if (diagnostic.remediation !== undefined) lines.push(`    fix: ${diagnostic.remediation}`);
    }
    return lines.join('\n');
  }

  const plan = outcome.plan;
  const tasks = plan.phases.reduce((sum, phase) => sum + phase.tasks.length, 0);

  lines.push('plan generated.');
  lines.push(`  phases: ${plan.phases.length}   tasks: ${tasks}`);
  lines.push(`  author: ${plan.provider.id} / ${plan.provider.model}`);
  lines.push(`  tokens: ${outcome.usage.inputTokens} in, ${outcome.usage.outputTokens} out`);

  if (plan.assumptions.length > 0) {
    lines.push('', `Assumptions (not facts — review these): ${plan.assumptions.length}`);
    for (const assumption of plan.assumptions) lines.push(`  - ${assumption}`);
  }
  if (plan.openQuestions.length > 0) {
    lines.push('', `Unresolved questions: ${plan.openQuestions.length}`);
    for (const question of plan.openQuestions) lines.push(`  - ${question}`);
  }

  for (const collision of outcome.collisions) {
    lines.push('', `✗ collision  ${collision} (existing, refused — use --force to overwrite)`);
  }

  if (outcome.written.length === 0 && outcome.collisions.length === 0) {
    lines.push('', '[dry-run] nothing written.');
  } else {
    lines.push('', `Workspace: ${PLAN_PATH}`);
    lines.push('', 'Next step:', '  planmo generate');
  }
  return lines.join('\n');
}
