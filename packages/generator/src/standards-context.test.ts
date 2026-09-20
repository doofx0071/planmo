import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type StandardRule } from '@planmo/schema';
import { compilePlanningProfile } from '@planmo/packs';
import { buildIr, type IrInput, type PlanningIR } from './ir.js';
import { renderStandardsAndContext } from './standards-context.js';

/** Minimal validated project config shared by the standards/context tests. */
function project() {
  return ProjectConfigSchema.parse({
    schemaVersion: 1,
    project: {
      name: 'demo',
      lifecycle: 'greenfield',
      type: 'web-application',
      risk: 'medium',
    },
    stack: { language: 'typescript', frontend: 'react', test: 'vitest' },
    planning: { depth: 'standard', phaseMode: 'gated', freshSessionPerPhase: true },
    agents: { primary: 'opencode' },
    packs: ['stack/react', 'test/vitest'],
  });
}

const RULES: StandardRule[] = [
  {
    id: 'project.chg.no-clocks',
    class: 'organization',
    precedence: 'explicit-project-policy',
    rule: 'Pure modules must not read clocks, random, or the filesystem.',
    rationale: 'Byte-stable regeneration requires deterministic renderers.',
  },
  {
    id: 'sec.deps.pinned',
    class: 'security',
    precedence: 'security',
    rule: 'All dependencies must be pinned with integrity digests.',
    references: ['docs/02-architecture/state-and-manifest.md'],
  },
  {
    id: 'stack.react.hooks-order',
    class: 'framework',
    precedence: 'stack-framework',
    rule: 'Hooks must be called at the top level of components.',
    rationale: 'Preserves hook order across renders.',
  },
  {
    id: 'lang.typescript.strict',
    class: 'language',
    precedence: 'language',
    rule: 'Enable strict mode and exactOptionalPropertyTypes.',
  },
];

function irInput(overrides: Partial<IrInput> = {}): IrInput {
  return {
    project: project(),
    resolution: { packs: [], order: [], diagnostics: [], ok: true },
    lockfile: {
      planmoVersion: '0.0.0',
      packs: [
        {
          ref: 'stack/react',
          name: 'react',
          version: '1.0.0',
          source: 'registry',
          integrity: { algorithm: 'sha256', digest: 'a'.repeat(64) },
        },
      ],
    },
    profile: compilePlanningProfile('standard'),
    standards: {
      rules: RULES,
      conflicts: [
        {
          code: 'duplicate-rule-id',
          ruleId: 'lang.typescript.strict',
          refs: ['standards/one', 'standards/two'],
          message: 'standard "lang.typescript.strict" has conflicting definitions',
        },
        {
          code: 'precedence-collision',
          ruleId: 'sec.deps.pinned',
          refs: ['standards/security'],
          message: 'collision between precedence tiers',
        },
      ],
      sources: ['standards/planmo'],
    },
    ...overrides,
  };
}

describe('renderStandardsAndContext (P05-09)', () => {
  it('renders STANDARDS.md, one policy doc per class in use, and CONTEXT.md', () => {
    const ir = buildIr(irInput());
    const artifacts = renderStandardsAndContext(ir);
    // Canonical class order: language, framework, security, organization.
    expect(artifacts.map((a) => a.path)).toEqual([
      'planning/STANDARDS.md',
      'planning/policies/language.md',
      'planning/policies/framework.md',
      'planning/policies/security.md',
      'planning/policies/organization.md',
      'planning/CONTEXT.md',
    ]);
  });

  it('marks every artifact planning-doc/generated with non-empty lineage', () => {
    for (const artifact of renderStandardsAndContext(buildIr(irInput()))) {
      expect(artifact.path.startsWith('planning/')).toBe(true);
      expect(artifact.kind).toBe('planning-doc');
      expect(artifact.ownership).toBe('generated');
      expect(artifact.content.length).toBeGreaterThan(0);
      expect(artifact.sources).toContain('standards/planmo');
      expect(artifact.sources).toContain(`inputHash:${buildIr(irInput()).inputHash}`);
    }
  });

  it('groups STANDARDS.md rules by precedence tier, highest authority first', () => {
    const ir = buildIr(irInput());
    const standards = renderStandardsAndContext(ir).find((a) => a.path === 'planning/STANDARDS.md');
    const content = standards?.content ?? '';
    expect(content).toContain('# Standards');
    expect(content).toContain('## explicit-project-policy');
    expect(content).toContain('## security');
    expect(content).toContain('## stack-framework');
    expect(content).toContain('## language');
    expect(content.indexOf('## explicit-project-policy')).toBeLessThan(
      content.indexOf('## security'),
    );
    expect(content.indexOf('## security')).toBeLessThan(content.indexOf('## stack-framework'));
    expect(content.indexOf('## stack-framework')).toBeLessThan(content.indexOf('## language'));
  });

  it('renders rule text plus optional rationale and references', () => {
    const ir = buildIr(irInput());
    const content =
      renderStandardsAndContext(ir).find((a) => a.path === 'planning/STANDARDS.md')?.content ?? '';
    expect(content).toContain('**project.chg.no-clocks** — Pure modules must not read clocks');
    expect(content).toContain(
      'Rationale: Byte-stable regeneration requires deterministic renderers.',
    );
    expect(content).toContain('References: docs/02-architecture/state-and-manifest.md');
    expect(content).toContain('**lang.typescript.strict** — Enable strict mode');
  });

  it('surfaces conflicts explicitly and never silences them', () => {
    const content =
      renderStandardsAndContext(buildIr(irInput())).find((a) => a.path === 'planning/STANDARDS.md')
        ?.content ?? '';
    expect(content).toContain('## Surfaced conflicts');
    expect(content).toContain('**duplicate-rule-id** — `lang.typescript.strict`');
    expect(content).toContain('has conflicting definitions');
    expect(content).toContain('refs: standards/one, standards/two');
    expect(content).toContain('**precedence-collision** — `sec.deps.pinned`');
  });

  it('renders one policy doc per class with the class rules only', () => {
    const policy = renderStandardsAndContext(buildIr(irInput())).find(
      (a) => a.path === 'planning/policies/framework.md',
    );
    expect(policy?.content).toContain('# framework standards');
    expect(policy?.content).toContain('project `demo`');
    expect(policy?.content).toContain('**stack.react.hooks-order**');
    expect(policy?.content).toContain('Hooks must be called at the top level');
    expect(policy?.content).toContain('Rationale: Preserves hook order across renders.');
    // Classes are separated: framework doc never carries language/security rules.
    expect(policy?.content).not.toContain('lang.typescript');
    expect(policy?.content).not.toContain('sec.deps');
  });

  it('renders project context, locked packs, and provenance lineage in CONTEXT.md', () => {
    const ir = buildIr(irInput());
    const context = renderStandardsAndContext(ir).find((a) => a.path === 'planning/CONTEXT.md');
    const content = context?.content ?? '';
    expect(content).toContain('# Project Context');
    expect(content).toContain('- Name: demo');
    expect(content).toContain('- Type: web-application');
    expect(content).toContain('- Lifecycle: greenfield');
    expect(content).toContain('- Risk: medium');
    expect(content).toContain('- Language: typescript');
    expect(content).toContain('- Frontend: react');
    expect(content).toContain('- Depth: standard');
    expect(content).toContain('- Phase mode: gated');
    expect(content).toContain('- Profile: standard');
    expect(content).toContain('## Standards sources');
    expect(content).toContain('- standards/planmo');
    expect(content).toContain('- `stack/react@1.0.0` — sha256:'.concat('a'.repeat(64)));
    expect(content).toContain(`- IR schema version: ${ir.schemaVersion}`);
    expect(content).toContain(`- Input hash: ${ir.inputHash}`);
  });

  it('omits stack/design/agents/profile/sources sections that are absent from the IR', () => {
    const ir = buildIr(
      irInput({
        project: ProjectConfigSchema.parse({
          schemaVersion: 1,
          project: { name: 'bare', lifecycle: 'greenfield', type: 'cli', risk: 'low' },
          planning: { depth: 'standard', phaseMode: 'gated', freshSessionPerPhase: true },
          packs: [],
        }),
        lockfile: { planmoVersion: '0.0.0', packs: [] },
        profile: null,
        standards: { rules: [], conflicts: [], sources: [] },
      }),
    );
    const content =
      renderStandardsAndContext(ir).find((a) => a.path === 'planning/CONTEXT.md')?.content ?? '';
    expect(content).toContain('## Project');
    expect(content).toContain('## Planning');
    expect(content).not.toContain('## Stack');
    expect(content).not.toContain('## Design');
    expect(content).not.toContain('## Agents');
    expect(content).not.toContain('## Profile');
    expect(content).not.toContain('## Standards sources');
    expect(content).not.toContain('## Locked packs');
    expect(content).toContain('## Lineage');
  });

  it('emits no policy docs and an explicit empty note when no rules apply', () => {
    const ir = buildIr(irInput({ standards: { rules: [], conflicts: [], sources: [] } }));
    const artifacts = renderStandardsAndContext(ir);
    expect(artifacts.map((a) => a.path)).toEqual(['planning/STANDARDS.md', 'planning/CONTEXT.md']);
    const standards = artifacts.find((a) => a.path === 'planning/STANDARDS.md')?.content ?? '';
    expect(standards).toContain('_No standards selected for this project._');
    expect(standards).not.toContain('## Surfaced conflicts');
  });

  it('is byte-stable: identical IR renders identical artifacts', () => {
    const a = renderStandardsAndContext(buildIr(irInput()));
    const b = renderStandardsAndContext(buildIr(irInput()));
    expect(a).toEqual(b);
  });

  it('is deterministic regardless of rule input order (sorts by precedence then id)', () => {
    // buildIr hashes the rules array order, so pin the IR inputHash while
    // shuffling the rules: the renderer alone must stay order-independent.
    const base = buildIr(irInput());
    const shuffledIr: PlanningIR = {
      ...base,
      standards: { ...base.standards, rules: [...base.standards.rules].reverse() },
    };
    const a = renderStandardsAndContext(base);
    const b = renderStandardsAndContext(shuffledIr);
    expect(a).toEqual(b);
  });

  it('produces deterministic, path-safe content: no CRLF, no backslashes, no absolute paths', () => {
    for (const artifact of renderStandardsAndContext(buildIr(irInput()))) {
      expect(artifact.path).not.toContain('\\');
      expect(artifact.content).not.toContain('\r');
      expect(artifact.content).not.toMatch(/(^|[^`])[A-Za-z]:[\\/]/);
    }
  });
});
