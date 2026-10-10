import { z } from 'zod';
import { csvField, isTaskId, splitCsvLine } from '@planmo/shared';
import { NonEmptyString } from './common.js';
import { TASK_STATUSES, type TaskStatus } from './state-lock-manifest.js';

/**
 * The canonical task model (schema v2).
 *
 * Before this, there was no Task type at all: `@planmo/trace` had `TraceTask`,
 * `@planmo/workflow` had its own view, and `planning/tasks.csv` was the only
 * artifact they shared — each parsing it independently. That made the spec's
 * central promise (evidence-based completion: a task is not verified because an
 * agent says so) unrepresentable, because nothing could carry acceptance criteria
 * or a verification policy.
 *
 * This is the one model. The CSV is its serialisation, the engines read it, and
 * the criteria are what `trace` checks evidence against.
 *
 * Division of labour: this schema describes the SHAPE of a record. Policy — "a
 * task with no acceptance criteria is a problem" — belongs to the validators
 * (`@planmo/trace` VLD codes), not here, so a workspace generated before v2 still
 * parses and gets a diagnostic telling the user to regenerate, instead of failing
 * to load at all.
 */

/**
 * Task lifecycle states already live in `state-lock-manifest.ts` — that is the
 * one definition, and `TaskStatus` is its union type. This is only the runtime
 * validator for the same list, so `tasks.csv` can be parsed against it without a
 * second source of truth for the states.
 */
const TaskStatusEnum = z.enum(TASK_STATUSES);

/**
 * Priority is the MoSCoW bucket the phase spine already assigns: a MUST task is
 * required for the phase exit gate, SHOULD/MAY are the rest.
 */
export const TASK_PRIORITIES = ['MUST', 'SHOULD', 'MAY'] as const;
export const TaskPriority = z.enum(TASK_PRIORITIES);
export type TaskPriority = z.infer<typeof TaskPriority>;

/**
 * The verification policy for one task.
 *
 * `required: true` means the task cannot reach DONE without recorded evidence —
 * that is the mechanical basis for "verified" being different from "reported
 * complete". `checks` names the checks the phase exit gate expects; they are what
 * `planning/testing/TEST-EVIDENCE.csv` carries a row for.
 */
export const TaskVerification = z.strictObject({
  required: z.boolean(),
  checks: z.array(NonEmptyString),
});
export type TaskVerification = z.infer<typeof TaskVerification>;

/**
 * One task record.
 *
 * `acceptance` may be empty: a v1 workspace has no criteria recorded, and the
 * validator reports that rather than the schema refusing to load the file.
 */
export const TaskRecord = z.strictObject({
  id: NonEmptyString,
  phase: NonEmptyString,
  title: NonEmptyString,
  status: TaskStatusEnum,
  priority: TaskPriority,
  acceptance: z.array(NonEmptyString),
  verification: TaskVerification,
});
export type TaskRecord = z.infer<typeof TaskRecord>;

// ------------------------------------------------------------ CSV serialisation

/**
 * `planning/tasks.csv` columns, in order.
 *
 * `acceptance` and `checks` are `;`-separated lists inside one RFC 4180 quoted
 * cell. Semicolons are therefore reserved: a criterion must not contain one, which
 * the generator asserts. Commas are fine — quoting handles them — and the whole
 * reason `csvField` exists is that a comma in a title must not split a row.
 */
export const TASKS_CSV_COLUMNS = [
  'id',
  'phase',
  'title',
  'status',
  'priority',
  'acceptance',
  'verification',
  'checks',
] as const;

/** The header line of `planning/tasks.csv`. */
export const TASKS_CSV_HEADER = TASKS_CSV_COLUMNS.join(',');

/** How many columns a v1 workspace's `tasks.csv` had (no criteria, no policy). */
const V1_COLUMN_COUNT = 5;

const LIST_SEPARATOR = '; ';

/** Join a list into one cell; the inverse of `splitList`. */
export function joinList(values: readonly string[]): string {
  return values.join(LIST_SEPARATOR);
}

/** Split a `;`-separated cell, dropping empties and trimming. */
export function splitList(cell: string): string[] {
  return cell
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/** Serialise one task as a CSV line (no trailing newline). */
export function serializeTaskRow(task: TaskRecord): string {
  return [
    csvField(task.id),
    csvField(task.phase),
    csvField(task.title),
    task.status,
    task.priority,
    csvField(joinList(task.acceptance)),
    task.verification.required ? 'required' : 'optional',
    csvField(joinList(task.verification.checks)),
  ].join(',');
}

/** Serialise the whole task list, header first. */
export function serializeTasksCsv(tasks: readonly TaskRecord[]): string {
  return [TASKS_CSV_HEADER, ...tasks.map(serializeTaskRow)].join('\n');
}

/**
 * Parse `planning/tasks.csv`.
 *
 * Tolerant by design: a row with only the five v1 columns parses with no criteria
 * and an optional verification policy, so a workspace generated before schema v2
 * keeps working — the validators tell the user to regenerate. Rows whose first
 * field is not a canonical task id (the header, or a malformed row) are skipped
 * rather than treated as tasks.
 */
export function parseTasksCsv(csv: string): TaskRecord[] {
  const tasks: TaskRecord[] = [];
  for (const line of csv.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const fields = splitCsvLine(line);
    if (fields.length < V1_COLUMN_COUNT) continue;

    const [id = '', phase = '', title = '', status = '', priority = ''] = fields;
    if (!isTaskId(id)) continue;

    const acceptance = splitList(fields[5] ?? '');
    const checks = splitList(fields[7] ?? '');
    const required = (fields[6] ?? '').trim().toLowerCase() === 'required';

    const statusResult = TaskStatusEnum.safeParse(status.trim());
    const priorityResult = TaskPriority.safeParse(priority.trim());

    tasks.push({
      id,
      phase,
      title,
      // An unrecognised status is not silently coerced to TODO: it is kept
      // verbatim so `validate` can report it. Coercion here would hide a real
      // inconsistency in the canonical artifact.
      status: statusResult.success ? statusResult.data : (status.trim() as TaskStatus),
      priority: priorityResult.success ? priorityResult.data : (priority.trim() as TaskPriority),
      acceptance,
      verification: { required, checks },
    });
  }
  return tasks;
}
