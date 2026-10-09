import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProjectNotFoundError, readStatus, writeManaged, type WorkspaceStatus } from '@planmo/core';
import {
  ManifestSchema,
  type HandoffDocument,
  type HandoffStatus,
  type StateDocument,
} from '@planmo/schema';
import { splitCsvLine } from '@planmo/shared';
import { TASKS_CSV_PATH, handoffBuilder, phaseDocPath } from '@planmo/workflow';
import { WorkspaceNotFoundError } from './workspace-error.js';

/**
 * `planmo handoff` — record a phase handoff from workspace state.
 *
 * Thin adapter over `@planmo/workflow`'s handoff builder, the same shape as
 * `validate` over `@planmo/trace` and `next` over `@planmo/workflow`: read the
 * canonical documents off disk, hand them to the pure engine, write what it
 * returns. No handoff logic lives here, so the same workspace always produces
 * the same document and the artifact is safe to diff.
 *
 * The handoff copy is USER-OWNED (the generator seeds only
 * `planning/handoffs/TEMPLATE.md`): a second run therefore reports a collision
 * rather than overwriting a file the user may have edited. `dryRun` reports the
 * plan and writes nothing.
 */

/** Where per-phase handoffs live, relative to the project root. */
export const HANDOFFS_DIR = 'planning/handoffs';

/** The handoff document path for a phase id, e.g. `00` -> `phase-00-handoff.md`. */
export function handoffPath(phase: string): string {
  return `${HANDOFFS_DIR}/phase-${phase}-handoff.md`;
}

export interface HandoffOptions {
  root: string;
  /** The CLI's own version, stamped into the rendered document when supplied. */
  planmoVersion?: string;
  /** Compute + report the plan without writing anything. */
  dryRun?: boolean;
  /** Permit replacing an existing handoff (default: refuse — it is user-owned). */
  allowOverwrite?: boolean;
}

export interface HandoffOutcome {
  root: string;
  /** The phase this handoff closes. */
  phase: string;
  /** The phase that follows it. */
  nextPhase: string;
  /** The schema-valid document the engine produced. */
  document: HandoffDocument;
  /** Workspace-relative path the document was (or would be) written to. */
  path: string;
  /** The rendered markdown that was (or would be) written. */
  text: string;
  /** Paths actually written (empty on a dry run that collided). */
  written: string[];
  /** Paths refused because a file the user owns is in the way. */
  collisions: string[];
  /** Fields that would block a clean resume; empty means the handoff is sufficient. */
  missingForResume: readonly string[];
}

/** One row of `planning/tasks.csv` (header `id,phase,title,status,priority`). */
interface TaskRow {
  id: string;
  phase: string;
  title: string;
  status: string;
  priority: string;
}

/** Read a file, or return undefined when it is absent (a valid state). */
async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Read `planning/tasks.csv` with RFC 4180 quoting (`@planmo/shared`'s
 * `splitCsvLine`), so a title containing a comma does not split the row.
 *
 * The status is field 4 (index 3). Reading the LAST field instead would make a
 * valid `DONE` row look like a `MUST` one and silently drop it from the
 * completed-task list.
 */
function readTaskRows(csvText: string): TaskRow[] {
  const rows: TaskRow[] = [];
  const lines = csvText.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue;
    // The header is the only first line that starts with the first column name.
    if (index === 0 && line.trimStart().toLowerCase().startsWith('id,')) continue;

    const fields = splitCsvLine(line);
    if (fields.length < 5) continue;
    const [id = '', phase = '', title = '', status = '', priority = ''] = fields;
    rows.push({ id, phase, title, status, priority });
  }
  return rows;
}

/** Zero-pad a numeric phase id to two digits; leave anything else untouched. */
function normalizePhase(phase: string): string {
  return /^\d+$/.test(phase) ? phase.padStart(2, '0') : phase;
}

/**
 * The phase that follows `current`: the lowest phase id in the task list that is
 * strictly greater, or the numeric successor when the task list has no later
 * phase yet. Deterministic and always non-empty.
 */
function deriveNextPhase(current: string, rows: readonly TaskRow[]): string {
  let next: string | undefined;
  for (const row of rows) {
    const phase = normalizePhase(row.phase);
    if (!/^\d+$/.test(phase)) continue;
    if (Number(phase) <= Number(current)) continue;
    if (next === undefined || Number(phase) < Number(next)) next = phase;
  }
  if (next !== undefined) return next;
  return /^\d+$/.test(current) ? String(Number(current) + 1).padStart(2, '0') : current;
}

/** The handoff status implied by the workspace state and the phase's task rows. */
function deriveStatus(state: StateDocument, phaseTasks: readonly TaskRow[]): HandoffStatus {
  if (state.status === 'blocked' || phaseTasks.some((task) => task.status === 'BLOCKED')) {
    return 'BLOCKED';
  }
  if (phaseTasks.length > 0 && phaseTasks.every((task) => task.status === 'DONE')) {
    return 'COMPLETE';
  }
  return 'PARTIAL';
}

/**
 * Material changes: the workspace-relative paths of the artifacts PlanMo has
 * materialised, from `.planmo/manifest.json`.
 *
 * This adapter must not invoke git, so the manifest — the workspace's own,
 * schema-validated record of generated files — is the only derivable set of
 * concrete file paths. A workspace with nothing recorded yields an empty list.
 */
async function readMaterialChanges(root: string): Promise<string[]> {
  const raw = await readIfPresent(join(root, '.planmo', 'manifest.json'));
  if (raw === undefined) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) return [];
  return [...new Set(result.data.entries.map((entry) => entry.path))].sort();
}

/** Resolve the workspace, mapping an absent `.planmo/` to the shared message. */
async function readWorkspace(root: string): Promise<WorkspaceStatus> {
  try {
    return await readStatus({ root });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) throw new WorkspaceNotFoundError(root);
    throw err;
  }
}

/**
 * Render a handoff document as deterministic markdown — no clock, no absolute
 * paths, no colour. Mirrors `planning/handoffs/TEMPLATE.md`. The optional
 * `planmoVersion` adds a single provenance line; absent, the output is identical
 * for identical documents.
 */
export function renderHandoffDocument(doc: HandoffDocument, planmoVersion?: string): string {
  const lines: string[] = [`# Phase ${doc.phase} Handoff`, ''];

  if (planmoVersion !== undefined) {
    lines.push(`_Generated by PlanMo ${planmoVersion}._`, '');
  }

  lines.push('## Status', doc.status, '');

  lines.push('## Completed tasks');
  if (doc.completedTasks.length === 0) lines.push('- (none)');
  else for (const id of doc.completedTasks) lines.push(`- ${id}`);
  lines.push('');

  lines.push('## Remaining / blocked');
  if (doc.blocked.length === 0) {
    lines.push('- (none)');
  } else {
    for (const blocker of doc.blocked) {
      lines.push(`- Task: ${blocker.task}`, `- Reason: ${blocker.reason}`);
      if (blocker.unblock !== undefined) lines.push(`- Exact unblock action: ${blocker.unblock}`);
    }
  }
  lines.push('');

  lines.push('## Material changes');
  if (doc.materialChanges.length === 0) lines.push('- (none)');
  else for (const change of doc.materialChanges) lines.push(`- ${change}`);
  lines.push('');

  lines.push('## Tests & evidence', '| Command/Test | Result | Notes |', '|---|---|---|');
  for (const row of doc.testsRun)
    lines.push(`| ${row.command} | ${row.result} | ${row.notes ?? ''} |`);
  lines.push('');

  lines.push('## Security / reliability findings');
  if (doc.securityFindings.length === 0) lines.push('- (none)');
  else for (const finding of doc.securityFindings) lines.push(`- ${finding}`);
  lines.push('');

  lines.push('## Decisions / ADRs');
  if (doc.decisions.length === 0) lines.push('- (none)');
  else for (const decision of doc.decisions) lines.push(`- ${decision}`);
  lines.push('');

  lines.push(
    '## Git',
    `- Branch: ${doc.git?.branch ?? ''}`,
    `- Commits: ${(doc.git?.commits ?? []).join(', ')}`,
    `- PR: ${doc.git?.pr ?? ''}`,
    '',
  );

  lines.push('## Known debt');
  if (doc.knownDebt.length === 0) lines.push('- (none)');
  else for (const debt of doc.knownDebt) lines.push(`- ${debt}`);
  lines.push('');

  lines.push('## Next phase', `- Phase: ${doc.nextPhase}`);
  for (const instruction of doc.instructions) lines.push(`- ${instruction}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Build the current phase's handoff from workspace state and write it to
 * `planning/handoffs/phase-<NN>-handoff.md`.
 *
 * The current phase and its DONE task ids come from `.planmo/state.yml` and
 * `planning/tasks.csv`; the next phase and material changes are derived from the
 * task list and the generation manifest. Writing goes through `writeManaged`, so
 * a file the user owns is a collision, not a silent overwrite.
 */
export async function buildHandoff(opts: HandoffOptions): Promise<HandoffOutcome> {
  const status = await readWorkspace(opts.root);
  if (status.project === null) throw new WorkspaceNotFoundError(status.root);
  if (status.state === null) {
    throw new Error(`no readable .planmo/state.yml in ${status.root}`);
  }

  const csv = await readIfPresent(join(status.root, TASKS_CSV_PATH));
  if (csv === undefined) {
    throw new Error(`no ${TASKS_CSV_PATH} in ${status.root} — run 'planmo generate' first`);
  }

  const phase = normalizePhase(status.state.currentPhase);
  const rows = readTaskRows(csv);
  const phaseTasks = rows.filter((row) => normalizePhase(row.phase) === phase);
  const completedTasks = phaseTasks.filter((task) => task.status === 'DONE').map((task) => task.id);
  const blocked = phaseTasks
    .filter((task) => task.status === 'BLOCKED')
    .map((task) => ({ task: task.id, reason: 'marked BLOCKED in planning/tasks.csv' }));
  const nextPhase = deriveNextPhase(phase, rows);

  const builder = handoffBuilder();
  const document = builder.build({
    phase,
    status: deriveStatus(status.state, phaseTasks),
    completedTasks,
    blocked,
    materialChanges: await readMaterialChanges(status.root),
    nextPhase,
    instructions: [`Read first: ${phaseDocPath(nextPhase)}`],
  });

  const text = renderHandoffDocument(document, opts.planmoVersion);
  const path = handoffPath(phase);

  const result = await writeManaged(status.root, [{ path, content: text }], {
    contentDirs: [HANDOFFS_DIR],
    ...(opts.allowOverwrite !== undefined ? { allowOverwrite: opts.allowOverwrite } : {}),
    ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
  });

  return {
    root: status.root,
    phase,
    nextPhase,
    document,
    path,
    text,
    written: result.written,
    collisions: result.collisions,
    missingForResume: builder.missingForResume(document),
  };
}
