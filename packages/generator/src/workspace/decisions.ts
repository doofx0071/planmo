import type { PlanningIR } from '../ir.js';
import { design, doc } from './shared.js';

export function renderDecisions(ir: PlanningIR): string {
  const info = ir.project.project;
  const lines = [
    '# Decision Log',
    '',
    'Architecture Decision Records for this project. One entry per decision,',
    'newest first. A decision is not closed until its consequences are recorded.',
    '',
    '## Recorded at generation',
    '',
    'These follow from `.planmo/project.yml` and are the starting position:',
    '',
    `- **D-000 — Project type is \`${info.type}\`.** Lifecycle: \`${info.lifecycle}\`; risk: \`${info.risk}\`.`,
    `- **D-001 — Planning depth is \`${ir.depth}\`.** The phase spine is pruned to ${ir.phases.length} phases accordingly.`,
    `- **D-002 — Phases run \`${ir.phaseMode}\`.** ${
      ir.phaseMode === 'gated'
        ? 'Each phase ends with a recorded handoff before the next begins.'
        : 'A handoff is still recorded at every phase boundary.'
    }`,
  ];
  const agents = ir.project.agents;
  if (agents) {
    lines.push(
      `- **D-003 — Primary agent is \`${agents.primary}\`.** Agent integrations are adapters; project state stays agent-neutral.`,
    );
  }
  const d = design(ir);
  if (d) {
    lines.push(
      `- **D-00${agents ? 4 : 3} — Design is \`${d.style}\`, \`${d.density}\` density, target \`${d.accessibility}\`.** Accessibility outranks visual style.`,
    );
  }
  lines.push(
    '',
    '## Template',
    '',
    '### D-NNN — <decision>',
    '',
    '- Status: proposed | accepted | superseded by D-NNN',
    '- Context: <what forced a choice>',
    '- Decision: <what was chosen>',
    '- Consequences: <what becomes easier, what becomes harder>',
    '- References: <docs, issues, ADRs>',
  );
  return doc(lines);
}

/** Questions implied by gaps in the validated config. Deterministic order. */
function derivedQuestions(ir: PlanningIR): string[] {
  const stack = ir.project.stack;
  const questions: string[] = [];
  if (!stack) {
    questions.push('No stack is declared. Which language, runtime and frameworks will this use?');
  } else {
    if (!stack.database)
      questions.push('No database is declared. Is persistence out of scope, or undecided?');
    if (!stack.test) questions.push('No test tooling is declared. What runs the test suite?');
    if (!stack.ci) questions.push('No CI is declared. Where does the gate run?');
  }
  if (!ir.project.design) {
    questions.push('No design block is declared. What is the visual direction and density?');
  }
  if (ir.project.project.risk === 'high' && !(ir.profile?.requireSecurityReview ?? false)) {
    questions.push('Risk is high but no security review is required by the profile. Should it be?');
  }
  if (ir.lockedPacks.length === 0) {
    questions.push('No packs are applied. Which standards should this project bind to?');
  }
  if (ir.standards.conflicts.length > 0) {
    questions.push(
      `The standards selection surfaces ${ir.standards.conflicts.length} conflict(s). Who decides the resolution?`,
    );
  }
  return questions;
}

export function renderOpenQuestions(ir: PlanningIR): string {
  const lines = [
    '# Open Questions',
    '',
    'Questions that block or shape the work. An open question is a risk until',
    'it is answered; record the answer as a decision in `DECISIONS.md`.',
    '',
    '| # | Question | Owner | Status | Answer |',
    '|---|---|---|---|---|',
  ];
  const derived = derivedQuestions(ir);
  derived.forEach((question, index) => {
    lines.push(`| Q-${String(index + 1).padStart(3, '0')} | ${question} | — | OPEN | — |`);
  });
  if (derived.length === 0) {
    lines.push('| — | No questions derived from the current configuration. | — | — | — |');
  }
  lines.push(
    '',
    '## Added by hand',
    '',
    '| # | Question | Owner | Status | Answer |',
    '|---|---|---|---|---|',
    '| Q-999 | <question> | <owner> | OPEN | — |',
  );
  return doc(lines);
}
