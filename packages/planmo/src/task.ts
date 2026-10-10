import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { readStatus, writeManaged } from '@planmo/core';
import { parseTaskList, TASKS_CSV_PATH } from '@planmo/workflow';
import { TASK_STATUSES, type TaskStatus } from '@planmo/schema';
import { generatePlanningWorkspace } from './generate.js';
import { cliVersion } from './version.js';

/**
 * `planmo task` — record a task's status.
 *
 * This exists because the obvious thing does not work. `planning/tasks.csv` is a
 * GENERATED document: hand-edit a status and the next `planmo generate` silently
 * resets it to TODO. Verified, not assumed — that is how the gap was found.
 *
 * So status is recorded in `.planmo/state.yml`, which PlanMo owns and regeneration
 * never rewrites. The `tasks` map there has been in the schema since the state
 * document was defined and was never read or written by anything: the durable home
 * existed, the plumbing did not.
 *
 * The generator then merges that map over the generated default, so `tasks.csv`,
 * `TRACKER.md` and the phase documents all agree, and the status survives
 * regeneration.
 */
export interface TaskOptions {
  root: string;
  /** Task id, e.g. `P00-01`. Omitted to choose interactively. */
  id?: string;
  /** New status. Omitted to choose interactively. */
  status?: string;
  /** When true, report what would change and write nothing. */
  dryRun?: boolean;
}

export interface TaskOutcome {
  id: string;
  from: TaskStatus;
  to: TaskStatus;
  /** True when the task already had that status and nothing was written. */
  unchanged: boolean;
  written: readonly string[];
}

export class UnknownTaskError extends Error {
  constructor(id: string, root: string) {
    super(`no task '${id}' in ${TASKS_CSV_PATH} under ${root}`);
  }
}

export class UnknownStatusError extends Error {
  constructor(status: string) {
    super(`'${status}' is not a task status — expected one of ${TASK_STATUSES.join(', ')}`);
  }
}

/** Case-insensitive match against the canonical status list. */
export function normalizeStatus(input: string): TaskStatus {
  const match = TASK_STATUSES.find((status) => status === input.trim().toUpperCase());
  if (match === undefined) throw new UnknownStatusError(input);
  return match;
}

/** The tasks a caller can pick from, in file order. */
export interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
}

export async function readTaskRows(root: string): Promise<readonly TaskRow[]> {
  const csv = await readFile(join(root, TASKS_CSV_PATH), 'utf8');
  const parsed = parseTaskList(csv);
  return parsed.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
  }));
}

export async function recordTaskStatus(opts: TaskOptions): Promise<TaskOutcome> {
  const status = await readStatus({ root: opts.root });
  if (status.project === null) {
    throw new Error(`no readable .planmo/project.yml in ${opts.root}`);
  }
  if (status.state === null) {
    throw new Error(`no readable .planmo/state.yml in ${status.root}`);
  }

  const rows = await readTaskRows(status.root);
  const id = opts.id ?? '';
  const row = rows.find((candidate) => candidate.id === id);
  if (row === undefined) throw new UnknownTaskError(id, status.root);
  if (opts.status === undefined) throw new UnknownStatusError('');
  const to = normalizeStatus(opts.status);

  if (row.status === to) {
    return { id, from: row.status, to, unchanged: true, written: [] };
  }

  if (opts.dryRun === true) {
    return { id, from: row.status, to, unchanged: false, written: [] };
  }

  // Write the state document, preserving every other field. The status map is the
  // only thing this command owns.
  const next = {
    ...status.state,
    tasks: { ...(status.state.tasks ?? {}), [id]: to },
  };
  const written = await writeManaged(
    status.root,
    [{ path: '.planmo/state.yml', content: stringifyYaml(next) }],
    // PlanMo owns the state document; the user owns the planning documents. This
    // command is the sanctioned way to change it, so overwriting it is not a
    // collision.
    { contentDirs: ['.planmo'], allowOverwrite: true },
  );

  // Regenerate so tasks.csv and every other surface show the new status now, rather
  // than only after the next unrelated `planmo generate`.
  const regenerated = await generatePlanningWorkspace({
    root: status.root,
    planmoVersion: cliVersion(),
  });

  return {
    id,
    from: row.status,
    to,
    unchanged: false,
    written: [...written.written, ...regenerated.written],
  };
}

export function renderTaskOutcome(outcome: TaskOutcome): string {
  if (outcome.unchanged) {
    return `${outcome.id} is already ${outcome.to} — nothing changed.`;
  }
  return `${outcome.id}: ${outcome.from} → ${outcome.to}`;
}
