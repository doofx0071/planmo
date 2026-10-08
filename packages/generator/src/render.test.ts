import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@planmo/schema';
import { buildIr, phasesForDepth, type IrInput } from './ir.js';
import { artifactSources, renderPlanningDocuments } from './render.js';

/** Minimal validated project config shared by the renderer tests. */
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
        {
          ref: 'test/vitest',
          name: 'vitest',
          version: '2.0.0',
          source: 'registry',
          integrity: { algorithm: 'sha256', digest: 'b'.repeat(64) },
        },
      ],
    },
    standards: { rules: [], conflicts: [], sources: ['standards/planmo'] },
    profile: null,
    ...overrides,
  };
}

describe('renderPlanningDocuments (P05-02)', () => {
  it('renders the canonical document set for the depth-pruned phase spine', () => {
    const ir = buildIr(irInput());
    const artifacts = renderPlanningDocuments(ir);
    const expected = [
      'planning/ROADMAP.md',
      'planning/TRACKER.md',
      ...phasesForDepth(ir.depth).map((p) => `planning/phases/phase-${p.id}.md`),
      'planning/handoffs/TEMPLATE.md',
    ];
    expect(artifacts.map((a) => a.path)).toEqual(expected);
    // standard depth prunes to the first 7 canonical phases
    expect(phasesForDepth('standard')).toHaveLength(7);
  });

  it('marks every artifact planning-doc/generated except the seeded handoff template', () => {
    const artifacts = renderPlanningDocuments(buildIr(irInput()));
    for (const artifact of artifacts) {
      expect(artifact.path.startsWith('planning/')).toBe(true);
      expect(artifact.kind).toBe('planning-doc');
      expect(artifact.content.length).toBeGreaterThan(0);
      expect(artifact.sources.length).toBeGreaterThan(0);
    }
    const ownershipByPath = new Map(artifacts.map((a) => [a.path, a.ownership]));
    expect(ownershipByPath.get('planning/ROADMAP.md')).toBe('generated');
    expect(ownershipByPath.get('planning/TRACKER.md')).toBe('generated');
    expect(ownershipByPath.get('planning/phases/phase-00.md')).toBe('generated');
    expect(ownershipByPath.get('planning/handoffs/TEMPLATE.md')).toBe('seeded');
  });

  it('records pack refs, standards sources, and the input hash as lineage', () => {
    const ir = buildIr(irInput());
    const sources = artifactSources(ir);
    expect(sources).toEqual([
      'stack/react',
      'test/vitest',
      'standards/planmo',
      `inputHash:${ir.inputHash}`,
    ]);
    for (const artifact of renderPlanningDocuments(ir)) {
      expect(artifact.sources).toEqual(sources);
    }
  });

  it('renders ROADMAP.md with the full phase spine and objectives', () => {
    const ir = buildIr(irInput());
    const roadmap = renderPlanningDocuments(ir).find((a) => a.path === 'planning/ROADMAP.md');
    expect(roadmap).toBeDefined();
    expect(roadmap?.content).toContain('# Detailed Roadmap');
    for (const phase of ir.phases) {
      expect(roadmap?.content).toContain(`## Phase ${phase.id} — ${phase.title}`);
      expect(roadmap?.content).toContain(`${phase.objective}.`);
    }
  });

  it('renders TRACKER.md with a TODO row per phase, its task range, and the phase mode', () => {
    const ir = buildIr(irInput());
    const tracker = renderPlanningDocuments(ir).find((a) => a.path === 'planning/TRACKER.md');
    expect(tracker?.content).toContain('Canonical task list: `planning/tasks.csv`.');
    expect(tracker?.content).toContain('Phase mode: gated.');
    const first = ir.phases[0]!;
    expect(tracker?.content).toContain(
      `| ${first.id} | ${first.title} | P${first.id}-01–P${first.id}-04 (4) | TODO |`,
    );
    expect(tracker?.content.match(/\| TODO \|/g)).toHaveLength(ir.phases.length);
  });

  it('renders one phase document per IR phase with objective, gates, handoff, stop rule', () => {
    const ir = buildIr(irInput());
    const phaseDoc = renderPlanningDocuments(ir).find(
      (a) => a.path === 'planning/phases/phase-05.md',
    );
    expect(phaseDoc).toBeDefined();
    expect(phaseDoc?.content).toContain('# Phase 05 — Planning compiler & artifact generator');
    expect(phaseDoc?.content).toContain('## Objective');
    expect(phaseDoc?.content).toContain('## Tasks');
    expect(phaseDoc?.content).toContain('| P05-01 |');
    expect(phaseDoc?.content).toContain('## Test & evidence gate');
    expect(phaseDoc?.content).toContain('- unit tests');
    expect(phaseDoc?.content).toContain('## Exit gates');
    expect(phaseDoc?.content).toContain('planning/handoffs/phase-05-handoff.md');
    expect(phaseDoc?.content).toContain('## Stop rule');
    expect(phaseDoc?.content).toContain('HARD STOP after Phase 05.');
  });

  it('uses a boundary handoff stop rule in continuous mode', () => {
    const ir = buildIr(
      irInput({
        project: ProjectConfigSchema.parse({
          ...project(),
          planning: { depth: 'lean', phaseMode: 'continuous', freshSessionPerPhase: false },
        }),
      }),
    );
    const phaseDoc = renderPlanningDocuments(ir).find(
      (a) => a.path === 'planning/phases/phase-00.md',
    );
    expect(phaseDoc?.content).toContain('Record the phase handoff at the phase boundary');
    expect(phaseDoc?.content).not.toContain('HARD STOP');
  });

  it('renders the seeded handoff template', () => {
    const template = renderPlanningDocuments(buildIr(irInput())).find(
      (a) => a.path === 'planning/handoffs/TEMPLATE.md',
    );
    expect(template?.content).toContain('# Phase XX Handoff');
    expect(template?.content).toContain('## Status');
    expect(template?.content).toContain('## Completed tasks');
    expect(template?.content).toContain('## Next phase');
  });

  it('prunes phase documents by depth deterministically', () => {
    const lean = renderPlanningDocuments(
      buildIr(
        irInput({
          project: ProjectConfigSchema.parse({
            ...project(),
            planning: { depth: 'lean', phaseMode: 'continuous', freshSessionPerPhase: false },
          }),
        }),
      ),
    );
    expect(lean.filter((a) => a.path.startsWith('planning/phases/phase-'))).toHaveLength(4);
  });

  it('is byte-stable: identical IR renders identical artifacts', () => {
    const a = renderPlanningDocuments(buildIr(irInput()));
    const b = renderPlanningDocuments(buildIr(irInput()));
    expect(a).toEqual(b);
    expect(a.map((x) => x.path)).toEqual(b.map((x) => x.path));
  });

  it('changes output when the IR input hash changes', () => {
    const standard = renderPlanningDocuments(buildIr(irInput()));
    const lean = renderPlanningDocuments(
      buildIr(
        irInput({
          project: ProjectConfigSchema.parse({
            ...project(),
            planning: { depth: 'lean', phaseMode: 'continuous', freshSessionPerPhase: false },
          }),
        }),
      ),
    );
    expect(lean.map((a) => a.path)).not.toEqual(standard.map((a) => a.path));
  });

  it('produces deterministic, path-safe content: no CRLF, no backslashes, no absolute paths', () => {
    for (const artifact of renderPlanningDocuments(buildIr(irInput()))) {
      expect(artifact.path).not.toContain('\\');
      expect(artifact.content).not.toContain('\r');
      expect(artifact.content).not.toMatch(/(^|[^`])[A-Za-z]:[\\/]/);
    }
  });
});
