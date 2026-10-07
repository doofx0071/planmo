import { readStatus } from '@planmo/core';
import { buildIr, compileWorkspace } from '@planmo/generator';
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
}

export async function generatePlanningWorkspace(
  opts: GenerateOptions,
): Promise<GenerateOutcome> {
  const status = await readStatus({ root: opts.root });
  if (status.project === null) {
    throw new Error(`no readable .planmo/project.yml in ${opts.root}`);
  }
  const project = status.project;

  // No local pack catalog is wired to the CLI yet: resolve against an empty
  // catalog so requested refs surface as diagnostics instead of silent success.
  const resolution = resolvePacks([], [...(project.packs ?? [])]);

  const ir = buildIr({
    project,
    resolution,
    lockfile: { planmoVersion: opts.planmoVersion, packs: [] },
    profile: compilePlanningProfile(project.planning?.depth ?? 'standard'),
    standards: selectStandards(resolution.packs, { risk: project.project.risk }),
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
  };
}
