import { readStatus } from '@planmo/core';
import { buildIr, compileWorkspace } from '@planmo/generator';
import { readPlanDocument } from './plan.js';
import { compilePlanningProfile, resolvePacks, selectStandards } from '@planmo/packs';

/**
 * Compile the planning workspace for an initialized project.
 *
 * Thin adapter: read the canonical project model, build the generator IR from
 * it, and let the generator own every byte it writes. No generation logic here —
 * `.planmo/*` stays owned by `initWorkspace`, `planning/*` by the generator.
 */
export interface GenerateOptions {
  root: string;
  /** The CLI's own version, recorded in the generation manifest. */
  planmoVersion: string;
  /** Compute + report the plan without writing anything. */
  dryRun?: boolean;
  /** Permit replacing files the generation manifest already owns. */
  allowOverwrite?: boolean;
}

export interface GenerateOutcome {
  written: string[];
  collisions: string[];
  diff: string;
  /** Resolution diagnostics (missing/unknown pack refs). Never fatal here. */
  diagnostics: string[];
  /**
   * Per-document action from the synth preview: what WOULD happen to each file.
   * Present on a dry run too, which is what makes `planmo diff` precise rather
   * than a guess from the written list.
   *
   * NOTE: `overwrite`/`merge` mean "the manifest owns this and it would be
   * written", NOT "its content differs". The preview decides by ownership, not by
   * bytes, so a caller asking "would anything actually change?" must compare
   * against `contents`.
   */
  changes: { path: string; action: string; reason: string }[];
  /** The exact bytes each document would be written with, keyed by path. */
  contents: Record<string, string>;
}

export async function generatePlanningWorkspace(opts: GenerateOptions): Promise<GenerateOutcome> {
  const status = await readStatus({ root: opts.root });
  if (status.project === null) {
    throw new Error(`no readable .planmo/project.yml in ${opts.root}`);
  }
  const project = status.project;

  // A recorded plan AUGMENTS the canonical spine: when `.planmo/plan.yml` exists,
  // its phases and tasks are the project's. Absent, generation is exactly what it
  // was before the AI planner existed — which is what keeps every pre-existing
  // workspace and every golden fixture byte-identical, and keeps this command
  // deterministic and model-free.
  const plan = await readPlanDocument(status.root);

  // No local pack catalog is wired to the CLI yet: resolve against an empty
  // catalog so requested refs surface as diagnostics instead of silent success.
  const resolution = resolvePacks([], [...(project.packs ?? [])]);

  const ir = buildIr({
    project,
    resolution,
    lockfile: { planmoVersion: opts.planmoVersion, packs: [] },
    profile: compilePlanningProfile(project.planning?.depth ?? 'standard'),
    standards: selectStandards(resolution.packs, { risk: project.project.risk }),
    plan,
  });

  const result = await compileWorkspace(ir, {
    root: opts.root,
    ...(opts.allowOverwrite !== undefined ? { allowOverwrite: opts.allowOverwrite } : {}),
    ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
  });

  return {
    written: [...result.written],
    collisions: [...result.collisions],
    diff: result.diff,
    diagnostics: resolution.diagnostics.map((d) => `${d.code}: ${d.message}`),
    changes: result.preview.changes.map((change) => ({
      path: change.path,
      action: change.action,
      reason: change.reason,
    })),
    contents: Object.fromEntries(result.artifacts.map((a) => [a.path, a.content])),
  };
}
