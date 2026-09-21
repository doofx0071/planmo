import { describe, expect, it } from 'vitest';
import type { StandardRule } from '@planmo/schema';
import { fitnessEngine } from './fitness.js';
import { standardsDriftEngine, hasStandardsDrift } from './standards-drift.js';
import {
  driftFixture,
  driftFixtureExpectedMissingEvidence,
  driftFixtureExpectedOrphans,
} from './fixtures/drift.js';
import type { StandardsDriftInput } from './contracts.js';

const rule = (id: string, extra: Partial<StandardRule> = {}): StandardRule => ({
  id,
  class: 'language',
  precedence: 'global-default',
  rule: 'Observe the standard.',
  rationale: 'Rationale.',
  ...extra,
});

describe('fitnessEngine (P09-07)', () => {
  it('flags undeclared dependency edges (FIT-001)', () => {
    const { diagnostics, counts } = fitnessEngine().evaluate({
      id: 'boundary',
      allowedEdges: { core: ['shared', 'schema'] },
      observedEdges: { core: ['shared', 'schema', 'adapters'] },
    });
    const v = diagnostics.find((d) => d.code === 'FIT-001');
    expect(diagnostics.some((d) => d.code === 'FIT-001' && d.target === 'core -> adapters')).toBe(
      true,
    );
    expect(v?.remediation?.length ?? 0).toBeGreaterThan(0);
    expect(counts.error).toBe(1);
  });

  it('flags cycles (FIT-002) and generated imports (FIT-003)', () => {
    const { diagnostics } = fitnessEngine().evaluate({
      id: 'boundary',
      allowedEdges: { a: ['b'], b: ['a'] },
      cycles: ['a -> b -> a'],
      generatedImports: ['packages/x/src/y.ts -> ../x/dist/index.js'],
    });
    expect(diagnostics.map((d) => d.code).sort()).toEqual(['FIT-002', 'FIT-003']);
  });

  it('no diagnostics when everything is declared allowed and clean', () => {
    const { diagnostics, counts } = fitnessEngine().evaluate({
      id: 'boundary',
      allowedEdges: { core: ['shared', 'schema'] },
      observedEdges: { core: ['shared'] },
    });
    expect(diagnostics).toEqual([]);
    expect(counts.error).toBe(0);
  });

  it('is deterministic: identical input → identical diagnostics', () => {
    const rules = {
      id: 'boundary',
      allowedEdges: { a: ['b'] },
      observedEdges: { a: ['b', 'c'], b: ['c'] },
    };
    expect(fitnessEngine().evaluate(rules).diagnostics).toEqual(
      fitnessEngine().evaluate(rules).diagnostics,
    );
  });
});

describe('standardsDriftEngine (P09-08)', () => {
  const declared = [
    rule('design.dtcg-canonical', { class: 'design' }),
    rule('design.contrast-floor', { class: 'design' }),
  ];
  const selected = [
    rule('design.dtcg-canonical', { class: 'design' }),
    rule('design.touch-targets', { class: 'design' }),
  ];
  const input = (): StandardsDriftInput => ({
    declared,
    selected,
    knownClasses: ['design', 'language'],
  });

  it('detects declared-missing (DRF-001) and selected-undeclared (DRF-002)', () => {
    const { diagnostics } = standardsDriftEngine().analyze(input());
    expect(
      diagnostics.some((d) => d.code === 'DRF-001' && d.target === 'design.contrast-floor'),
    ).toBe(true);
    expect(
      diagnostics.some((d) => d.code === 'DRF-002' && d.target === 'design.touch-targets'),
    ).toBe(true);
  });

  it('flags unknown classes as errors (DRF-003)', () => {
    const { diagnostics } = standardsDriftEngine().analyze({
      declared: [{ ...rule('x.y'), class: 'stale-class' as StandardRule['class'] }],
      selected: [],
      knownClasses: ['language'],
    });
    expect(diagnostics.some((d) => d.code === 'DRF-003' && d.target === 'x.y')).toBe(true);
  });

  it('hasStandardsDrift is true when warnings exist, false when clean', () => {
    expect(hasStandardsDrift(input())).toBe(true);
    expect(
      hasStandardsDrift({
        declared: [rule('a.b')],
        selected: [rule('a.b')],
        knownClasses: ['language'],
      }),
    ).toBe(false);
  });

  it('clean input produces no diagnostics', () => {
    const clean: StandardsDriftInput = {
      declared,
      selected: declared,
      knownClasses: ['design', 'language'],
    };
    const { diagnostics } = standardsDriftEngine().analyze(clean);
    expect(diagnostics).toEqual([]);
  });

  it('is deterministic', () => {
    expect(standardsDriftEngine().analyze(input())).toEqual(
      standardsDriftEngine().analyze(input()),
    );
  });
});

describe('drift/orphan fixtures (P09-05)', () => {
  it('fixture declares the orphaned requirement', () => {
    expect(driftFixture.requirements).toContain('REQ-C');
    expect(driftFixtureExpectedOrphans).toEqual(['REQ-C']);
  });

  it('fixture marks the DONE task without passing evidence', () => {
    expect(driftFixtureExpectedMissingEvidence).toEqual(['P03-01']);
    const done = driftFixture.tasks.filter((t) => t.status === 'DONE');
    expect(done.length).toBeGreaterThan(0);
  });

  it('every expected entity exists in the fixture', () => {
    expect(driftFixture.requirements.length).toBe(3);
    expect(driftFixture.tasks.length).toBe(4);
    expect(driftFixture.links.length).toBe(2);
    expect(driftFixture.tests.length).toBe(4);
  });
});
