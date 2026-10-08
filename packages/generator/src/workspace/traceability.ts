import type { PlanningIR } from '../ir.js';
import { doc } from './shared.js';
import { phaseTasks } from '../render.js';
import { csvField } from '@planmo/shared';

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
    const tasks = phaseTasks(phase);
    const first = tasks[0]?.[0] ?? '';
    const last = tasks[tasks.length - 1]?.[0] ?? '';
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
 * planning/tasks.csv — the canonical task list.
 *
 * Exactly five columns: `id,phase,title,status,priority`, fixed by the
 * validator in `@planmo/trace` (it requires exactly five comma-separated fields
 * per row, and since the identifier scheme landed it also checks that each id is
 * `P<NN>-<NN>` and matches its phase column). Dependencies and acceptance
 * criteria live in `REQUIREMENTS-TRACEABILITY.md` and the phase documents.
 *
 * Rows come from `phaseTasks`, the single definition of the seed shared with the
 * phase documents and the tracker, so the surfaces cannot disagree.
 */
export function renderTasksCsv(ir: PlanningIR): string {
  const rows: string[] = ['id,phase,title,status,priority'];
  for (const phase of ir.phases) {
    phaseTasks(phase).forEach(([id, title], index) => {
      rows.push(
        [id, phase.id, title, 'TODO', index === 0 ? 'MUST' : 'SHOULD'].map(csvField).join(','),
      );
    });
  }
  return `${rows.join('\n')}\n`;
}
