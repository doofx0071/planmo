import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generatePlanningWorkspace } from './generate.js';

/**
 * `planmo diff` — what would `generate` change?
 *
 * Runs the generator in dry-run mode. Nothing is written, so this is the safe way
 * to answer "is the planning tree stale?" before letting a regeneration loose on
 * it.
 *
 * The synth preview decides each document's fate by OWNERSHIP, not by bytes: it
 * reports `overwrite` for anything the manifest owns, whether or not the content
 * actually differs. So the preview alone would call a freshly generated tree
 * "24 documents would update". Every candidate is therefore compared against the
 * bytes on disk, and only real differences are reported.
 */
export interface DiffOptions {
  root: string;
  planmoVersion: string;
}

export interface DiffOutcome {
  root: string;
  /** Documents that do not exist yet and would be created. */
  added: string[];
  /** PlanMo-owned documents whose content would actually change. */
  updated: string[];
  /** Seeded documents whose content would actually change. */
  merged: string[];
  /** Documents refused because a file PlanMo does not own is in the way. */
  collisions: string[];
  /** Documents deliberately left alone, with the reason. */
  skipped: { path: string; reason: string }[];
  /** Documents that would be rewritten with identical bytes — nothing to do. */
  unchanged: string[];
  /** Unified diff of the content changes. */
  diff: string;
  /** True when regenerating would change nothing at all. */
  upToDate: boolean;
}

/** Read a file, or return undefined when it is absent (a valid state). */
async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

export async function diffWorkspace(opts: DiffOptions): Promise<DiffOutcome> {
  const result = await generatePlanningWorkspace({
    root: opts.root,
    planmoVersion: opts.planmoVersion,
    dryRun: true,
  });

  const added: string[] = [];
  const updated: string[] = [];
  const merged: string[] = [];
  const collisions: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const unchanged: string[] = [];

  for (const change of result.changes) {
    if (change.action === 'create') {
      added.push(change.path);
      continue;
    }
    if (change.action === 'collision') {
      collisions.push(change.path);
      continue;
    }
    if (change.action === 'skip') {
      skipped.push({ path: change.path, reason: change.reason });
      continue;
    }

    // `overwrite` / `merge`: the preview says the manifest owns it, not that the
    // content differs. Compare against disk so an identical rewrite is not
    // reported as a change.
    const next = result.contents[change.path];
    const current = await readIfPresent(join(opts.root, change.path));
    if (next !== undefined && current === next) {
      unchanged.push(change.path);
      continue;
    }
    if (change.action === 'overwrite') updated.push(change.path);
    else merged.push(change.path);
  }

  const sorted = (paths: string[]): string[] => [...paths].sort();

  return {
    root: opts.root,
    added: sorted(added),
    updated: sorted(updated),
    merged: sorted(merged),
    collisions: sorted(collisions),
    skipped: skipped.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    unchanged: sorted(unchanged),
    diff: result.diff,
    upToDate: added.length + updated.length + merged.length + collisions.length === 0,
  };
}

/** Render a diff outcome as plain text. */
export function renderDiff(outcome: DiffOutcome): string {
  if (outcome.upToDate) {
    return [
      'The planning tree already matches the project model.',
      `  ${outcome.unchanged.length} generated document(s) already current.`,
      `  ${outcome.skipped.length} document(s) you own, left alone.`,
    ].join('\n');
  }

  const lines: string[] = [];
  const section = (title: string, paths: readonly string[]): void => {
    if (paths.length === 0) return;
    lines.push(`${title} (${paths.length}):`);
    for (const path of paths) lines.push(`  ${path}`);
    lines.push('');
  };

  section('Would create', outcome.added);
  section('Would update', outcome.updated);
  section('Would merge (seeded — your edits are kept)', outcome.merged);
  section('Refused — a file PlanMo does not own is in the way', outcome.collisions);

  if (outcome.diff.trim() !== '') {
    lines.push('Diff:', '', outcome.diff.trimEnd(), '');
  }

  const pending = outcome.added.length + outcome.updated.length + outcome.merged.length;
  lines.push(
    `${pending} document(s) would change, ${outcome.collisions.length} refused.`,
    'Run `planmo generate` to apply.',
  );
  return lines.join('\n');
}
