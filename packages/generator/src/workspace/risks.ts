import type { PlanningIR } from '../ir.js';
import { doc } from './shared.js';

export function renderRisks(ir: PlanningIR): string {
  const risk = ir.project.project.risk;
  const lines = [
    '# Risk Register',
    '',
    `Project risk is classified \`${risk}\`. Risks are reviewed at every phase`,
    'boundary; a risk with no mitigation and no owner is an open question.',
    '',
    '| # | Risk | Likelihood | Impact | Mitigation | Owner | Status |',
    '|---|---|---|---|---|---|---|',
  ];
  const seeded: string[] = [];
  if (risk === 'high') {
    seeded.push(
      '| R-001 | Project is classified high risk | High | High | Enforce the security review gate and traceability at every phase. | — | OPEN |',
    );
  }
  if (ir.lockedPacks.length === 0) {
    seeded.push(
      '| R-002 | No standards packs applied | Medium | Medium | Apply the relevant packs so rules are enforced rather than assumed. | — | OPEN |',
    );
  }
  if (ir.phaseMode === 'continuous') {
    seeded.push(
      '| R-003 | Continuous phase mode without recorded handoffs | Medium | Medium | Record a handoff at every phase boundary even when phases do not gate. | — | OPEN |',
    );
  }
  if (seeded.length === 0) {
    seeded.push('| — | No risks derived from the current configuration. | — | — | — | — | — |');
  }
  lines.push(...seeded);
  lines.push(
    '',
    '## Added by hand',
    '',
    '| # | Risk | Likelihood | Impact | Mitigation | Owner | Status |',
    '|---|---|---|---|---|---|---|',
    '| R-999 | <risk> | Low/Medium/High | Low/Medium/High | <mitigation> | <owner> | OPEN |',
  );
  return doc(lines);
}
