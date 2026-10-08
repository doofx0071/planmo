import type { PlanningIR } from '../ir.js';
import { doc, gates, stackLines } from './shared.js';

export function renderMasterPlan(ir: PlanningIR): string {
  const info = ir.project.project;
  const profile = ir.profile;
  const lines = [
    `# Master Plan — ${info.name}`,
    '',
    '## Goal',
    '',
    `Deliver the ${info.type} described by this plan, starting from a ${info.lifecycle} state.`,
    '',
    '## Scope',
    '',
    `- Project type: ${info.type}`,
    `- Lifecycle: ${info.lifecycle}`,
    `- Risk: ${info.risk}`,
    `- Planning depth: ${ir.depth}`,
    `- Phase mode: ${ir.phaseMode}`,
    '',
    '## Stack',
    '',
    ...stackLines(ir),
    '',
    '## Phase spine',
    '',
    '| Phase | Title | Objective |',
    '|---|---|---|',
  ];
  for (const phase of ir.phases) {
    lines.push(`| ${phase.id} | ${phase.title} | ${phase.objective} |`);
  }
  lines.push(
    '',
    '## Deliverables',
    '',
    '1. A working implementation of the scope above.',
    '2. Tests and evidence for every phase exit gate.',
    '3. Documentation updated alongside the code.',
    '4. Traceability from requirement to task to test.',
    '',
    '## Exit gates',
    '',
  );
  for (const gate of gates(ir)) lines.push(`- ${gate}`);
  if (profile) {
    lines.push(
      '',
      '## Profile obligations',
      '',
      `- Traceability required: ${profile.requireTraceability ? 'yes' : 'no'}`,
      `- Security review required: ${profile.requireSecurityReview ? 'yes' : 'no'}`,
    );
  }
  lines.push(
    '',
    '## Non-goals',
    '',
    '_Record the non-goals here: what this project deliberately will not do._',
  );
  return doc(lines);
}
