import type { IrInput } from './ir.js';
import type { StandardRule } from '@planmo/schema';
import type { StandardsSelection } from '@planmo/packs';

/**
 * Golden fixture inputs (P05-04): three canonical projects at low, medium,
 * and high assurance. Each exposes a ready IrInput; the golden test renders
 * them through the REAL pipeline and byte-compares against the committed
 * `golden-<level>/` snapshots, so the fixtures always exercise the actual
 * renderers, manifest builder, and synth preview — never hand-written stubs.
 */

const pack = (ref: string, version: string, digest = ref.repeat(2).padEnd(64, '0')) => ({
  ref,
  name: ref.split('/')[1] ?? ref,
  version,
  source: 'registry' as const,
  integrity: { algorithm: 'sha256' as const, digest },
});

const project = (overrides: Record<string, unknown>) => ({
  schemaVersion: 1,
  project: {
    name: 'fixture-app',
    lifecycle: 'greenfield',
    type: 'web-application',
    risk: 'medium',
    ...(overrides.project ?? {}),
  },
  stack: { language: 'typescript', frontend: 'react', test: 'vitest' },
  design: { style: 'minimal', density: 'comfortable', accessibility: 'aa' },
  agents: { primary: 'opencode' },
  packs: ['stack/react', 'test/vitest'],
  ...(overrides.planning ? { planning: overrides.planning } : {}),
});

const standardsFor = (rules: StandardRule[]): StandardsSelection => ({
  rules,
  conflicts: [],
  sources: ['standards/planmo', 'policy/engineering'],
});

function standard(
  id: string,
  classId: StandardRule['class'],
  precedence: StandardRule['precedence'],
  rule: string,
): StandardRule {
  return {
    id,
    class: classId,
    precedence,
    rule,
    rationale: `rationale for ${id}`,
    references: [`docs/ref-${id}.md`],
  };
}

/** Low assurance: lean depth, continuous phases, no traceability. */
export function lowAssuranceInput(): IrInput {
  return {
    project: project({
      planning: { depth: 'lean', phaseMode: 'continuous', freshSessionPerPhase: false },
    }) as never,
    resolution: { packs: [], order: [], diagnostics: [], ok: true },
    lockfile: {
      planmoVersion: '0.0.0',
      packs: [pack('stack/react', '1.0.0'), pack('test/vitest', '2.0.0')],
    },
    profile: null,
    standards: standardsFor([
      standard('sec-basic', 'security', 'security', 'No secrets in the repository.'),
      standard('fmt-prettier', 'language', 'language', 'Prettier with printWidth 100.'),
    ]),
  };
}

/** Medium assurance: standard depth, gated phases, traceability. */
export function mediumAssuranceInput(): IrInput {
  return {
    project: project({
      planning: { depth: 'standard', phaseMode: 'gated', freshSessionPerPhase: true },
    }) as never,
    resolution: { packs: [], order: [], diagnostics: [], ok: true },
    lockfile: {
      planmoVersion: '0.0.0',
      packs: [pack('stack/react', '1.2.0'), pack('test/vitest', '2.1.0')],
    },
    profile: null,
    standards: standardsFor([
      standard('sec-basic', 'security', 'security', 'No secrets in the repository.'),
      standard('sec-deps', 'security', 'security', 'Dependency review for every change.'),
      standard('fmt-prettier', 'language', 'language', 'Prettier with printWidth 100.'),
      standard('trace-req', 'organization', 'project', 'Every change traces to a requirement.'),
    ]),
  };
}

/** High assurance: high-assurance depth, gated, full review mandates. */
export function highAssuranceInput(): IrInput {
  return {
    project: project({
      planning: { depth: 'high-assurance', phaseMode: 'gated', freshSessionPerPhase: true },
    }) as never,
    resolution: { packs: [], order: [], diagnostics: [], ok: true },
    lockfile: {
      planmoVersion: '0.0.0',
      packs: [
        pack('stack/react', '1.4.0'),
        pack('test/vitest', '2.2.0'),
        pack('policy/security', '1.0.0', 'aa'),
      ],
    },
    profile: null,
    standards: standardsFor([
      standard('sec-basic', 'security', 'security', 'No secrets in the repository.'),
      standard('sec-deps', 'security', 'security', 'Dependency review for every change.'),
      standard('sec-review', 'security', 'security', 'Mandatory security review sign-off.'),
      standard('fmt-prettier', 'language', 'language', 'Prettier with printWidth 100.'),
      standard('trace-req', 'organization', 'project', 'Every change traces to a requirement.'),
      standard('golden-tests', 'testing', 'project', 'Golden fixtures must pass before merge.'),
    ]),
  };
}

export const GOLDEN_LEVELS = ['low', 'medium', 'high'] as const;
export type GoldenLevel = (typeof GOLDEN_LEVELS)[number];

export function inputForLevel(level: GoldenLevel): IrInput {
  switch (level) {
    case 'low':
      return lowAssuranceInput();
    case 'medium':
      return mediumAssuranceInput();
    case 'high':
      return highAssuranceInput();
  }
}
