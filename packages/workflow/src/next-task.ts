import { splitCsvLine } from '@planmo/shared';
import type { TaskNode } from './contracts.js';
import { createTaskDag } from './task-dag.js';

/**
 * `planmo next` — pick the task to work next from the canonical task list.
 *
 * The selection is delegated to the existing task DAG (`task-dag.ts`), which
 * already computes the ready set and a deterministic topological order. With no
 * dependency column in `tasks.csv` every task is independent, so "next" is the
 * lowest-id task that is ready — which, because ids are phase-major and
 * zero-padded, is also the earliest phase with work left. Phase gating therefore
 * falls out of the identifier scheme rather than needing a second rule.
 *
 * PURE + deterministic: no I/O, no clock, no randomness. The adapter reads the
 * files; this decides.
 */

/** Canonical task list, written by `@planmo/generator`, validated by `@planmo/trace`. */
export const TASKS_CSV_PATH = 'planning/tasks.csv';

/** The five canonical task statuses. */
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** One row of `planning/tasks.csv`. */
export interface PlanTask {
  id: string;
  /** Two-digit phase id, e.g. `03`. */
  phase: string;
  title: string;
  status: TaskStatus;
  priority: string;
}

export interface ParsedTaskList {
  tasks: readonly PlanTask[];
  /**
   * Rows that could not be read, as `line N: reason`. Surfaced rather than
   * dropped: a row this reader cannot use is a row the user needs to know about.
   */
  skipped: readonly string[];
}

/** The phase document for a phase id, e.g. `03` -> `planning/phases/phase-03.md`. */
export function phaseDocPath(phase: string): string {
  return `planning/phases/phase-${phase}.md`;
}

/**
 * Documents every session reads before starting work, whatever the task.
 * The phase document is prepended per-task, because it is the most specific.
 */
export const SESSION_READING: readonly string[] = [
  'planning/CONTEXT.md',
  'planning/STANDARDS.md',
  'planning/TRACKER.md',
];

/**
 * Parse `planning/tasks.csv` (header `id,phase,title,status,priority`).
 *
 * RFC 4180 quoting is delegated to `@planmo/shared`'s reader, so a title
 * containing a comma does not split the row.
 */
export function parseTaskList(csvText: string): ParsedTaskList {
  const tasks: PlanTask[] = [];
  const skipped: string[] = [];

  const lines = csvText.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (line.trim() === '') continue;
    // The header is the only line starting with the first column name.
    if (lineNumber === 1 && line.trimStart().toLowerCase().startsWith('id,')) continue;

    const fields = splitCsvLine(line);
    if (fields.length < 5) {
      skipped.push(`line ${lineNumber}: expected 5 columns, found ${fields.length}`);
      continue;
    }
    const [id = '', phase = '', title = '', status = '', priority = ''] = fields;
    if (!(TASK_STATUSES as readonly string[]).includes(status)) {
      skipped.push(`line ${lineNumber}: unknown status "${status}"`);
      continue;
    }
    tasks.push({ id, phase, title, status: status as TaskStatus, priority });
  }

  return { tasks, skipped };
}

export interface NextBrief {
  /** The task to work next; null when nothing is left to do. */
  task: PlanTask | null;
  /** Phase id of `task`, or null. */
  phase: string | null;
  /** Human phase title, when the caller supplied one. */
  phaseTitle: string | null;
  /** The phase document to read before starting, or null. */
  phaseDoc: string | null;
  /** Documents to read before starting: the phase document first, then the shared ones. */
  read: readonly string[];
  /** BLOCKED tasks. Surfaced, never stepped over silently. */
  blocked: readonly PlanTask[];
  /** How many tasks are DONE, out of the total. */
  progress: { done: number; total: number };
  /** How many tasks are ready to be worked right now. */
  readyCount: number;
  /** Rows the reader could not use. */
  skipped: readonly string[];
  /** True when every task is DONE. */
  complete: boolean;
}

export interface NextBriefInput {
  tasks: readonly PlanTask[];
  /** Rows `parseTaskList` could not read, passed through to the brief. */
  skipped?: readonly string[];
  /** Phase titles keyed by phase id, e.g. `{ '03': 'CLI foundation' }`. */
  phaseTitles?: Readonly<Record<string, string>>;
}

/** Compose the next-session brief from the canonical task list. */
export function composeNextBrief(input: NextBriefInput): NextBrief {
  const { tasks } = input;
  const nodes: TaskNode[] = tasks.map((task) => ({ id: task.id, status: task.status }));
  const dag = createTaskDag();

  const readyIds = new Set(dag.ready(nodes));
  const byId = new Map(tasks.map((task) => [task.id, task]));
  // `ordered` is deterministic (id order for independent nodes), so the first
  // ready task in that order is stable across runs and platforms.
  const nextNode = dag.ordered(nodes).find((node) => readyIds.has(node.id));
  const task = nextNode === undefined ? null : (byId.get(nextNode.id) ?? null);

  const phase = task?.phase ?? null;
  const phaseDoc = phase === null ? null : phaseDocPath(phase);
  return {
    task,
    phase,
    phaseTitle: phase === null ? null : (input.phaseTitles?.[phase] ?? null),
    phaseDoc,
    read: phaseDoc === null ? [...SESSION_READING] : [phaseDoc, ...SESSION_READING],
    blocked: tasks.filter((entry) => entry.status === 'BLOCKED'),
    progress: {
      done: tasks.filter((entry) => entry.status === 'DONE').length,
      total: tasks.length,
    },
    readyCount: readyIds.size,
    skipped: input.skipped ?? [],
    complete: tasks.length > 0 && tasks.every((entry) => entry.status === 'DONE'),
  };
}

/**
 * The phase title from a phase document's first heading, e.g.
 * `# Phase 03 — CLI foundation` -> `CLI foundation`. Undefined when the document
 * has no recognisable heading, so the caller can fall back rather than print
 * something misleading.
 */
export function phaseTitleFromDoc(markdown: string): string | undefined {
  const heading = markdown.split(/\r?\n/).find((line) => line.startsWith('# '));
  if (heading === undefined) return undefined;
  // `# Phase 03 — CLI foundation` / `# Phase 03 - CLI foundation`
  const match = /^#\s*Phase\s+\d+\s*[—–-]\s*(.+?)\s*$/.exec(heading);
  return match?.[1];
}
