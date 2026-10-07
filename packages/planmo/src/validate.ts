import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readStatus } from '@planmo/core';
import { validatorEngine, type Diagnostic } from '@planmo/trace';

/**
 * Validate a workspace's canonical documents.
 *
 * Thin adapter over `@planmo/trace`'s validator: read the documents off disk,
 * hand them to the engine, and report what it returns. No validation logic lives
 * here — the engine owns the invariants and is pure, so the same workspace
 * always produces the same report, and the report is safe to gate CI on.
 */
export interface ValidateOptions {
  root: string;
}

export interface ValidateOutcome {
  root: string;
  diagnostics: readonly Diagnostic[];
  counts: { error: number; warning: number; info: number };
  /** True when the report contains no errors. Warnings do not fail the gate. */
  ok: boolean;
}

/** Read a file, or return undefined when it is absent (a valid state). */
async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

export async function validateWorkspace(opts: ValidateOptions): Promise<ValidateOutcome> {
  const status = await readStatus({ root: opts.root });
  if (status.project === null) {
    throw new Error(`no readable .planmo/project.yml in ${opts.root}`);
  }

  // The engine's document slots are JSON-shaped. state.yml is YAML on disk, so
  // pass the parsed document re-serialized as JSON; tasks.csv stays raw text
  // because the engine parses the CSV itself.
  const documents: { state?: string; tasks?: string; manifest?: string } = {};
  if (status.state !== null) documents.state = JSON.stringify(status.state);

  const tasks = await readIfPresent(join(status.root, 'planning', 'tasks.csv'));
  if (tasks !== undefined) documents.tasks = tasks;

  const manifest = await readIfPresent(join(status.root, '.planmo', 'manifest.json'));
  if (manifest !== undefined) documents.manifest = manifest;

  const report = validatorEngine().validate({
    documents,
    ...(status.state !== null ? { state: status.state } : {}),
  });

  return {
    root: status.root,
    diagnostics: report.diagnostics,
    counts: report.counts,
    ok: report.counts.error === 0,
  };
}
