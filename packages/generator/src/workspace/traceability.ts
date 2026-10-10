import type { PlanningIR } from '../ir.js';
import { doc } from './shared.js';
import { phaseTasks, tasksForPhase } from '../render.js';
import { csvField } from '@planmo/shared';
import { serializeTasksCsv, type TaskRecord } from '@planmo/schema';

export function renderTraceability(ir: PlanningIR): string {
  const lines = [
    '# Requirements Traceability',
    '',
    'Every requirement traces forward to a design element, a task and a test, and',
    'backward to the phase that delivers it. A requirement with no test is not',
    'implemented; a test with no requirement is scope creep.',
    '',
    '| Requirement | Phase | Tasks | Design | Test | Status |',
    '|---|---|---|---|---|---|',
  ];
  ir.phases.forEach((phase, index) => {
    const tasks = tasksForPhase(ir, phase);
    const first = tasks[0]?.id ?? '';
    const last = tasks[tasks.length - 1]?.id ?? '';
    lines.push(
      `| REQ-${String(index + 1).padStart(3, '0')} | ${phase.id} | ${first}–${last} | — | — | TODO |`,
    );
  });
  lines.push(
    '',
    '## Rules',
    '',
    '- Status values: TODO / IN_PROGRESS / DONE / DROPPED.',
    '- A requirement is DONE only when its test exists and passes.',
    `- Traceability is ${ir.profile?.requireTraceability ? 'required by the project profile' : 'not required by the project profile, but recommended'}.`,
  );
  return doc(lines);
}

/**
 * planning/tasks.csv — the canonical task list (schema v2).
 *
 * Eight columns: `id,phase,title,status,priority,acceptance,verification,checks`.
 * `acceptance` and `checks` are `;`-separated lists inside one RFC 4180 quoted
 * cell, so a criterion containing a comma cannot split a row. The serialiser
 * lives in `@planmo/schema` next to the task model, so the writer and every
 * reader (`@planmo/trace`, the CLI adapters) share one codec rather than each
 * splitting on a bare comma.
 *
 * Rows come from `phaseTasks`, the single definition of the seed shared with the
 * phase documents, the tracker and the evidence file, so the surfaces cannot
 * disagree.
 */
export function renderTasksCsv(ir: PlanningIR): string {
  const tasks: TaskRecord[] = [];
  for (const phase of ir.phases) {
    tasks.push(...tasksForPhase(ir, phase));
  }
  return `${serializeTasksCsv(tasks)}\n`;
}

/**
 * planning/testing/TEST-EVIDENCE.csv — the evidence scaffold.
 *
 * One row per check a `verification.required` task must satisfy, with `command`
 * and `result` left blank for the user to fill in as the checks are actually run.
 * This is the file `@planmo/trace` reads, so recording a result is what clears
 * `TRC-002` for that task — evidence, not a claim, is what makes a task verified.
 *
 * `command` is blank because the generator cannot know a project's commands; the
 * phase document names the gates, and the user supplies the invocation. Optional
 * tasks get no rows: nothing gates on them, so demanding evidence would be noise.
 */
export function renderTestEvidence(ir: PlanningIR): string {
  const rows: string[] = ['task_id,check,command,result'];
  for (const phase of ir.phases) {
    for (const task of tasksForPhase(ir, phase)) {
      if (!task.verification.required) continue;
      for (const check of task.verification.checks) {
        rows.push([task.id, csvField(check), '', ''].join(','));
      }
    }
  }
  return `${rows.join('\n')}\n`;
}
