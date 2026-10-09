import {
  STANDARD_CLASSES,
  STANDARD_PRECEDENCE,
  type StandardClass,
  type StandardPrecedence,
  type StandardRule,
} from '@planmo/schema';
import type { GeneratedArtifact, Renderer } from './contracts.js';
import type { PlanningIR } from './ir.js';
import { artifactSources } from './render.js';

/**
 * Standards, context & policy document renderer (P05-09, CHG-001).
 *
 * Renders the compiled standards selection from the frozen IR into a
 * canonical STANDARDS.md (rules grouped by precedence tier, conflicts
 * surfaced — never silently resolved), one policy document per standard
 * class that has applicable rules (`planning/policies/<class>.md`), and a
 * CONTEXT.md carrying project context plus full provenance/lineage (pack
 * sources, locked packs with integrity, IR input hash). Pure and
 * deterministic: identical IR always produces byte-identical artifacts.
 */

function precedenceRank(precedence: StandardPrecedence): number {
  return STANDARD_PRECEDENCE.indexOf(precedence);
}

/** Rules in deterministic order: precedence tier, then id. */
function sortedRules(rules: readonly StandardRule[]): StandardRule[] {
  return [...rules].sort((a, b) => {
    const byPrecedence = precedenceRank(a.precedence) - precedenceRank(b.precedence);
    if (byPrecedence !== 0) return byPrecedence;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Markdown bullet lines for one rule, including optional rationale/references. */
function ruleLines(rule: StandardRule, indent: string): string[] {
  const lines = [`${indent}- **${rule.id}** — ${rule.rule}`];
  if (rule.rationale) lines.push(`${indent}  - Rationale: ${rule.rationale}`);
  if (rule.references && rule.references.length > 0) {
    lines.push(`${indent}  - References: ${rule.references.join(', ')}`);
  }
  return lines;
}

function standardsDocument(path: string, content: string, ir: PlanningIR): GeneratedArtifact {
  return {
    path,
    content,
    kind: 'planning-doc',
    ownership: 'generated',
    sources: artifactSources(ir),
  };
}

/** STANDARDS.md — all selected rules grouped by precedence tier + surfaced conflicts. */
function renderStandardsDoc(ir: PlanningIR): string {
  const lines: string[] = [
    '# Standards',
    '',
    'Compiled from the project standards selection: deterministic precedence, conflicts surfaced — never silently resolved by PlanMo.',
    '',
  ];
  const rules = sortedRules(ir.standards.rules);
  for (const precedence of STANDARD_PRECEDENCE) {
    const group = rules.filter((r) => r.precedence === precedence);
    if (group.length === 0) continue;
    lines.push(`## ${precedence}`, '');
    for (const rule of group) lines.push(...ruleLines(rule, ''), '');
  }
  if (rules.length === 0) {
    lines.push('_No standards selected for this project._', '');
  }
  if (ir.standards.conflicts.length > 0) {
    lines.push('## Surfaced conflicts', '', 'Conflicts are surfaced, never silently resolved.', '');
    for (const conflict of ir.standards.conflicts) {
      lines.push(`- **${conflict.code}** — \`${conflict.ruleId}\`: ${conflict.message}`);
      if (conflict.refs.length > 0) lines.push(`  - refs: ${conflict.refs.join(', ')}`);
      lines.push('');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** planning/policies/<class>.md — one policy document per standard class in use. */
function renderPolicyDoc(className: StandardClass, rules: StandardRule[], ir: PlanningIR): string {
  const lines: string[] = [
    `# ${className} standards`,
    '',
    `Standards of class \`${className}\` selected for project \`${ir.project.project.name}\`.`,
    '',
  ];
  for (const rule of rules) lines.push(...ruleLines(rule, ''), '');
  return `${lines.join('\n').trimEnd()}\n`;
}

/** CONTEXT.md — project context plus provenance/lineage of the generation. */
function renderContextDoc(ir: PlanningIR): string {
  const lines: string[] = ['# Project Context', '', '## Project'];
  const info = ir.project.project;
  lines.push(
    `- Name: ${info.name}`,
    `- Type: ${info.type}`,
    `- Lifecycle: ${info.lifecycle}`,
    `- Risk: ${info.risk}`,
  );

  const stack = ir.project.stack;
  if (stack) {
    lines.push('', '## Stack');
    const stackKeys = [
      'frontend',
      'backend',
      'database',
      'language',
      'runtime',
      'test',
      'ci',
    ] as const;
    for (const key of stackKeys) {
      const value = stack[key];
      if (value !== undefined) {
        lines.push(`- ${key.charAt(0).toUpperCase()}${key.slice(1)}: ${value}`);
      }
    }
  }

  const design = ir.project.design;
  if (design) {
    lines.push(
      '',
      '## Design',
      `- Style: ${design.style}`,
      `- Density: ${design.density}`,
      `- Accessibility: ${design.accessibility}`,
    );
  }

  const agents = ir.project.agents;
  if (agents) {
    lines.push('', '## Agents', `- Primary: ${agents.primary}`);
  }

  const planning = ir.project.planning;
  if (planning) {
    lines.push(
      '',
      '## Planning',
      `- Depth: ${ir.depth}`,
      `- Phase mode: ${ir.phaseMode}`,
      `- Fresh session per phase: ${planning.freshSessionPerPhase ? 'yes' : 'no'}`,
    );
  }

  const profile = ir.profile;
  if (profile) {
    lines.push(
      '',
      '## Profile',
      `- Profile: ${profile.id}`,
      `- Phase mode: ${profile.phaseMode}`,
      `- Gates: ${profile.gates.join(', ')}`,
      `- Traceability required: ${profile.requireTraceability ? 'yes' : 'no'}`,
      `- Security review required: ${profile.requireSecurityReview ? 'yes' : 'no'}`,
    );
  }

  if (ir.standards.sources.length > 0) {
    lines.push('', '## Standards sources');
    for (const ref of ir.standards.sources) lines.push(`- ${ref}`);
  }

  if (ir.lockedPacks.length > 0) {
    lines.push('', '## Locked packs');
    for (const pack of ir.lockedPacks) {
      const integrity = pack.integrity
        ? ` — ${pack.integrity.algorithm}:${pack.integrity.digest}`
        : '';
      lines.push(`- \`${pack.ref}@${pack.version}\`${integrity}`);
    }
  }

  lines.push(
    '',
    '## Lineage',
    `- IR schema version: ${ir.schemaVersion}`,
    `- Input hash: ${ir.inputHash}`,
  );
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * The standard classes that actually have applicable rules, in canonical class
 * order.
 *
 * This is the single predicate for "does `planning/policies/` exist". The policy
 * renderer and the generated `planning/README.md` both call it, so the README
 * cannot advertise a folder that was never written — which it did, for every
 * project with no packs selected.
 */
export function policyClassesInUse(ir: PlanningIR): readonly StandardClass[] {
  return STANDARD_CLASSES.filter((className) =>
    ir.standards.rules.some((rule) => rule.class === className),
  );
}

/**
 * Render the standards/context/policy document set for a compiled IR
 * (P05-09). Deterministic order: STANDARDS.md, one policy doc per standard
 * class in canonical class order, then CONTEXT.md.
 */
export const renderStandardsAndContext: Renderer = (ir) => {
  const artifacts: GeneratedArtifact[] = [
    standardsDocument('planning/STANDARDS.md', renderStandardsDoc(ir), ir),
  ];
  const rules = sortedRules(ir.standards.rules);
  for (const className of policyClassesInUse(ir)) {
    const group = rules.filter((r) => r.class === className);
    if (group.length === 0) continue;
    artifacts.push(
      standardsDocument(
        `planning/policies/${className}.md`,
        renderPolicyDoc(className, group, ir),
        ir,
      ),
    );
  }
  artifacts.push(standardsDocument('planning/CONTEXT.md', renderContextDoc(ir), ir));
  return artifacts;
};
