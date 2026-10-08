import type { PlanningIR } from '../ir.js';
import { doc, projectName } from './shared.js';

export function renderProductRequirements(ir: PlanningIR): string {
  const lines = [
    `# Product Requirements — ${projectName(ir)}`,
    '',
    '## Problem',
    '',
    '_What problem does this project solve, and for whom?_',
    '',
    '## Scope',
    '',
    `- Project type: \`${ir.project.project.type}\``,
    `- Lifecycle: \`${ir.project.project.lifecycle}\``,
    `- Risk: \`${ir.project.project.risk}\``,
    '',
    '## Requirements',
    '',
    '| ID | Requirement | Priority | Phase | Acceptance |',
    '|---|---|---|---|---|',
  ];
  ir.phases.forEach((phase, index) => {
    lines.push(
      `| REQ-${String(index + 1).padStart(3, '0')} | ${phase.objective} | MUST | ${phase.id} | Phase ${phase.id} exit gates pass. |`,
    );
  });
  lines.push(
    '',
    '## Non-functional requirements',
    '',
    '| Area | Requirement |',
    '|---|---|',
    '| Accessibility | Meet the declared accessibility target on every screen. |',
    '| Security | No path traversal, no unsafe symlink following, no secret in the repository. |',
    '| Determinism | Identical inputs produce identical generated output. |',
    '| Data safety | User-owned files are never silently overwritten. |',
    '',
    '## Non-goals',
    '',
    '_What this project deliberately will not do._',
  );
  return doc(lines);
}
