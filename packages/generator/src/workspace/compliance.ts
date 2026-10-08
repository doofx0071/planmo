import type { PlanningIR } from '../ir.js';
import { doc } from './shared.js';

export function renderPolicyRegister(ir: PlanningIR): string {
  const lines = [
    '# Policy Register',
    '',
    'The policies that apply to this project, where they come from, and how they',
    'are enforced. A policy with no enforcement is a wish.',
    '',
    '| Policy | Source | Class | Enforcement | Status |',
    '|---|---|---|---|---|',
  ];
  if (ir.standards.rules.length === 0) {
    lines.push('| — | No standards selected | — | — | — |');
  } else {
    for (const rule of ir.standards.rules) {
      lines.push(
        `| ${rule.id} | ${rule.precedence} | ${rule.class} | Automated where a test exists; otherwise reviewed at the phase gate. | ACTIVE |`,
      );
    }
  }
  if (ir.standards.sources.length > 0) {
    lines.push('', '## Sources', '');
    for (const source of ir.standards.sources) lines.push(`- ${source}`);
  }
  if (ir.standards.conflicts.length > 0) {
    lines.push('', '## Conflicts to resolve', '');
    for (const conflict of ir.standards.conflicts) {
      lines.push(`- **${conflict.code}** — \`${conflict.ruleId}\`: ${conflict.message}`);
    }
  }
  lines.push(
    '',
    '## Rules',
    '',
    '- Conflicts between standards are surfaced, never silently resolved.',
    '- A policy is added only with a named source.',
    '- Accessibility outranks visual style.',
  );
  return doc(lines);
}
