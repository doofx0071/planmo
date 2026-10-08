import type { PlanningIR } from '../ir.js';
import { doc, projectName, stackLines } from './shared.js';

export function renderArchitecture(ir: PlanningIR): string {
  const stack = ir.project.stack;
  const lines = [
    `# Architecture — ${projectName(ir)}`,
    '',
    '## System shape',
    '',
    `A \`${ir.project.project.type}\` with the stack below. Components are`,
    'described by responsibility and dependency direction; dependencies point',
    'inward toward the domain, never outward toward frameworks.',
    '',
    '## Components',
    '',
    '| Component | Responsibility | Depends on |',
    '|---|---|---|',
  ];
  const components: Array<[string, string, string]> = [];
  if (stack?.frontend)
    components.push(['Frontend', `Presentation layer (${stack.frontend})`, 'Domain / API']);
  if (stack?.backend)
    components.push(['Backend', `Application logic (${stack.backend})`, 'Domain']);
  if (stack?.database) components.push(['Persistence', `Data storage (${stack.database})`, '—']);
  if (components.length === 0) {
    components.push(['<component>', '<responsibility>', '<depends on>']);
  }
  for (const [name, responsibility, dependsOn] of components) {
    lines.push(`| ${name} | ${responsibility} | ${dependsOn} |`);
  }
  lines.push(
    '',
    '## Dependency direction',
    '',
    '1. Presentation depends on application; application depends on domain.',
    '2. The domain depends on nothing but its own types.',
    '3. Infrastructure is reached through interfaces the domain owns.',
    '',
    '## Boundaries',
    '',
    '- Every module has one reason to change.',
    '- Cross-boundary calls go through an explicit contract, never a shared mutable state.',
    '- Generated artifacts are never hand-edited.',
    '',
    '## Stack',
    '',
    ...stackLines(ir),
  );
  return doc(lines);
}

export function renderDomainModel(ir: PlanningIR): string {
  return doc([
    `# Domain Model — ${projectName(ir)}`,
    '',
    'Entities, value objects and the invariants they enforce. The domain model is',
    'the vocabulary the rest of the system speaks; it is defined before the',
    'schema that persists it.',
    '',
    '## Entities',
    '',
    '| Entity | Identity | Invariants |',
    '|---|---|---|',
    '| <Entity> | <what makes two instances the same> | <rules that must always hold> |',
    '',
    '## Value objects',
    '',
    '| Value object | Meaning |',
    '|---|---|',
    '| <ValueObject> | <immutable concept with no identity> |',
    '',
    '## Relationships',
    '',
    '| From | To | Cardinality | Rule |',
    '|---|---|---|---|',
    '| <Entity> | <Entity> | 1-N | <rule> |',
    '',
    '## Domain events',
    '',
    '| Event | Emitted when | Consumers |',
    '|---|---|---|',
    '| <Event> | <trigger> | <consumers> |',
    '',
    '## Rules',
    '',
    '- An invariant is enforced in the domain, not in the UI or the database alone.',
    '- A persisted schema change that alters the domain model is a migration and needs a decision record.',
  ]);
}

export function renderSecurityPrivacy(ir: PlanningIR): string {
  const risk = ir.project.project.risk;
  return doc([
    `# Security & Privacy — ${projectName(ir)}`,
    '',
    `Project risk is classified \`${risk}\`. This document records the threat`,
    'model and the rules that follow from it.',
    '',
    '## Threat model',
    '',
    '| Threat | Vector | Mitigation | Status |',
    '|---|---|---|---|',
    '| Path traversal | Untrusted path input reaching the filesystem | Resolve and contain every path under the project root before writing. | REQUIRED |',
    '| Unsafe symlinks | A symlink pointing outside the root | Refuse to follow links that escape the root. | REQUIRED |',
    '| Secret exfiltration | Credentials in tracked files or logs | Never commit secrets; keep them in the environment. | REQUIRED |',
    '| Silent destructive overwrite | A write over user-owned content | Refuse to overwrite unmanaged files without an explicit force. | REQUIRED |',
    '| Injection via untrusted content | Instructions embedded in scanned files | Treat retrieved content as data, never as instruction. | REQUIRED |',
    '',
    '## Privacy',
    '',
    '- Collect the minimum personal data the feature needs.',
    '- Record why each personal field is stored and when it is deleted.',
    '- Never persist secrets or unrelated personal data in logs or generated artifacts.',
    '',
    '## Review gate',
    '',
    `Security review is ${ir.profile?.requireSecurityReview ? 'required by the project profile' : 'not required by the project profile'}.`,
    risk === 'high'
      ? 'Because the project is classified high risk, treat the review as mandatory regardless.'
      : 'Revisit this decision if the risk classification changes.',
  ]);
}

export function renderStateMachines(ir: PlanningIR): string {
  return doc([
    `# State Machines — ${projectName(ir)}`,
    '',
    'Every stateful entity is specified as an explicit state machine before it is',
    'implemented. Illegal transitions are rejected by the domain, not the UI.',
    '',
    '## Template',
    '',
    '### <Entity>',
    '',
    '| State | Meaning | Allowed transitions |',
    '|---|---|---|',
    '| <state> | <meaning> | <next states> |',
    '',
    '```text',
    '<initial> -> <state> -> <terminal>',
    '```',
    '',
    '## Rules',
    '',
    '- A state machine has exactly one initial state.',
    '- Every transition names its trigger and its guard.',
    '- Terminal states have no outgoing transitions.',
    '- A transition that can fail records what happens on failure.',
    '',
    '## Machines in this project',
    '',
    '_None recorded yet. Add one section per stateful entity._',
  ]);
}
