import type { PlanningIR } from '../ir.js';
import { doc, gates, projectName } from './shared.js';

export function renderTestStrategy(ir: PlanningIR): string {
  const stack = ir.project.stack;
  const lines = [
    `# Test Strategy — ${projectName(ir)}`,
    '',
    '## Gate',
    '',
    'The gate that must pass before a phase is done:',
    '',
  ];
  for (const gate of gates(ir)) lines.push(`- ${gate}`);
  lines.push(
    '',
    '## Levels',
    '',
    '| Level | Covers | Runs on |',
    '|---|---|---|',
    '| Unit | Pure logic, domain invariants, edge cases | Every commit |',
    '| Integration | Module boundaries, persistence, I/O seams | Every commit |',
    '| End-to-end | The real entry point, as a user drives it | Before merge |',
    '| Negative / security | Malformed input, traversal, overwrite refusal | Before merge |',
    '| Golden / fixture | Byte-stable output for known inputs | Every commit |',
    '| Cross-platform | Path and filesystem behaviour on each supported OS | CI matrix |',
    '',
    '## Rules',
    '',
    '- A bug is fixed by a test that fails first.',
    '- Tests assert behaviour, not implementation detail.',
    '- Generated output is asserted byte-for-byte, not by shape.',
    '- A test that cannot fail is deleted.',
    '',
    '## Tooling',
    '',
    stack?.test ? `- Test runner: ${stack.test}` : '- Test runner: _not declared_',
    stack?.ci ? `- CI: ${stack.ci}` : '- CI: _not declared_',
    '',
    '## Evidence',
    '',
    'Every phase handoff records the exact command run and its result. A phase',
    'with no recorded evidence is not complete.',
  );
  return doc(lines);
}
