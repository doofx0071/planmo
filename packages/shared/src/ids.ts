/**
 * Canonical PlanMo identifiers (docs/02-architecture/identifier-scheme.md).
 *
 * One definition shared by the emitter (`@planmo/generator`) and the checker
 * (`@planmo/trace`) so the two cannot drift.
 *
 * Fixed width is load-bearing, not cosmetic: the task DAG orders ready work with
 * a min-heap keyed by the task-id string, so `P07-10` only sorts after `P07-09`
 * if both are zero-padded.
 */

/** A phase id: exactly two digits, e.g. "00", "07". */
export const PHASE_ID_PATTERN = /^\d{2}$/;

/** A task id: `P` + 2-digit phase + `-` + 2-digit task, e.g. "P07-03". */
export const TASK_ID_PATTERN = /^P(\d{2})-(\d{2})$/;

/** A requirement id: `REQ-` + 3 digits, e.g. "REQ-003". */
export const REQUIREMENT_ID_PATTERN = /^REQ-\d{3}$/;

/** Zero-pad a phase or task number to its canonical 2-digit form. */
export function phaseId(value: number | string): string {
  return String(value).padStart(2, '0');
}

/** Build the canonical task id for the n-th task of a phase. */
export function taskId(phase: number | string, task: number): string {
  return `P${phaseId(phase)}-${phaseId(task)}`;
}

/** True when `value` is a canonical task id. */
export function isTaskId(value: string): boolean {
  return TASK_ID_PATTERN.test(value);
}

/** The phase id embedded in a task id, or undefined when malformed. */
export function taskPhase(value: string): string | undefined {
  return TASK_ID_PATTERN.exec(value)?.[1];
}

/** The task number embedded in a task id, or undefined when malformed. */
export function taskNumber(value: string): string | undefined {
  return TASK_ID_PATTERN.exec(value)?.[2];
}
