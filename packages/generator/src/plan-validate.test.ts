import { describe, expect, it } from 'vitest';
import type { PlanDocument, PlanPhase, PlanTask } from '@planmo/schema';
import { validatePlanDocument } from './plan-validate.js';

/**
 * The plan validator is the gate an AI-authored plan must pass before it can be
 * written. These tests pin each cross-field rule, and — as importantly — that the
 * validator never repairs anything: it reports, and the caller decides.
 *
 * The schema (`PlanDocument`) already guarantees shape, so the cases here are the
 * ones a single field cannot judge: ids that must agree with each other, a phase
 * count that must respect the project's depth, and references that must resolve.
 */

function task(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: 'P00-01',
    title: 'Do the thing',
    priority: 'MUST',
    acceptance: ['The thing is done'],
    requirements: [],
    verification: { required: true, checks: ['unit tests'] },
    ...overrides,
  };
}

function phase(overrides: Partial<PlanPhase> = {}): PlanPhase {
  return {
    id: '00',
    title: 'Foundation',
    objective: 'Lay the foundation',
    exitCriteria: ['The foundation holds'],
    tasks: [task()],
    ...overrides,
  };
}

function plan(overrides: Partial<PlanDocument> = {}): PlanDocument {
  return {
    schemaVersion: 1,
    idea: 'Build a thing',
    provider: { id: 'tokenharbor', model: 'deepseek/deepseek-v4-flash' },
    generatedAt: null,
    phases: [phase()],
    openQuestions: [],
    assumptions: [],
    ...overrides,
  };
}

/** Just the codes, so assertions stay readable and order-insensitive. */
const codes = (result: ReturnType<typeof validatePlanDocument>): string[] =>
  result.diagnostics.map((d) => d.code);

describe('validatePlanDocument', () => {
  it('accepts a well-formed plan with no diagnostics at all', () => {
    const result = validatePlanDocument({ plan: plan(), depth: 'lean' });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it('rejects a duplicate phase id', () => {
    const result = validatePlanDocument({
      plan: plan({ phases: [phase(), phase({ tasks: [task({ id: 'P00-02' })] })] }),
      depth: 'standard',
    });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('PLN-001');
  });

  it('rejects a phase id that is not two-digit zero-padded', () => {
    const result = validatePlanDocument({
      plan: plan({ phases: [phase({ id: '0' })] }),
      depth: 'lean',
    });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('PLN-002');
  });

  it('rejects phase ids that are not contiguous from 00', () => {
    const result = validatePlanDocument({
      plan: plan({
        phases: [phase({ id: '00' }), phase({ id: '02', tasks: [task({ id: 'P02-01' })] })],
      }),
      depth: 'standard',
    });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('PLN-003');
  });

  it('judges contiguity on the set, not the listed order', () => {
    // Phases listed 01, 00 are still contiguous — only a gap is an error.
    const result = validatePlanDocument({
      plan: plan({
        phases: [phase({ id: '01', tasks: [task({ id: 'P01-01' })] }), phase({ id: '00' })],
      }),
      depth: 'standard',
    });
    expect(codes(result)).not.toContain('PLN-003');
  });

  it('rejects a task id that is not canonical', () => {
    const result = validatePlanDocument({
      plan: plan({ phases: [phase({ tasks: [task({ id: 'T001' })] })] }),
      depth: 'lean',
    });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('PLN-004');
  });

  it('rejects a task listed under a phase its id does not belong to', () => {
    const result = validatePlanDocument({
      plan: plan({ phases: [phase({ id: '01', tasks: [task({ id: 'P00-01' })] })] }),
      depth: 'lean',
    });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('PLN-004');
  });

  it('rejects a duplicate task id across phases', () => {
    const result = validatePlanDocument({
      plan: plan({
        phases: [phase({ id: '00' }), phase({ id: '01', tasks: [task({ id: 'P00-01' })] })],
      }),
      depth: 'standard',
    });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('PLN-004');
  });

  it('rejects a plan with more phases than the declared depth allows', () => {
    // Five phases is over `lean`'s cap of four.
    const five = ['00', '01', '02', '03', '04'].map((id) =>
      phase({ id, tasks: [task({ id: `P${id}-01` })] }),
    );
    const result = validatePlanDocument({ plan: plan({ phases: five }), depth: 'lean' });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('PLN-005');
  });

  it('accepts a plan exactly at the depth cap', () => {
    const four = ['00', '01', '02', '03'].map((id) =>
      phase({ id, tasks: [task({ id: `P${id}-01` })] }),
    );
    const result = validatePlanDocument({ plan: plan({ phases: four }), depth: 'lean' });
    expect(result.ok).toBe(true);
    expect(codes(result)).not.toContain('PLN-005');
  });

  it('rejects a task that requires verification but names no checks', () => {
    const result = validatePlanDocument({
      plan: plan({
        phases: [
          phase({
            tasks: [task({ verification: { required: true, checks: [] } })],
          }),
        ],
      }),
      depth: 'lean',
    });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('PLN-006');
  });

  it('allows an optional task with no checks', () => {
    const result = validatePlanDocument({
      plan: plan({
        phases: [phase({ tasks: [task({ verification: { required: false, checks: [] } })] })],
      }),
      depth: 'lean',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a reference to a requirement the workspace does not declare', () => {
    const result = validatePlanDocument({
      plan: plan({ phases: [phase({ tasks: [task({ requirements: ['REQ-999'] })] })] }),
      depth: 'lean',
      requirementIds: ['REQ-001'],
    });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('PLN-007');
  });

  it('accepts a reference that resolves', () => {
    const result = validatePlanDocument({
      plan: plan({ phases: [phase({ tasks: [task({ requirements: ['REQ-001'] })] })] }),
      depth: 'lean',
      requirementIds: ['REQ-001'],
    });
    expect(result.ok).toBe(true);
  });

  it('does not check requirement references when no set is supplied', () => {
    // A plan may be authored before the requirements document exists.
    const result = validatePlanDocument({
      plan: plan({ phases: [phase({ tasks: [task({ requirements: ['REQ-999'] })] })] }),
      depth: 'lean',
    });
    expect(result.ok).toBe(true);
    expect(codes(result)).not.toContain('PLN-007');
  });

  it('warns about missing exit criteria without failing the plan', () => {
    const result = validatePlanDocument({
      plan: plan({ phases: [phase({ exitCriteria: [] })] }),
      depth: 'lean',
    });
    expect(result.ok).toBe(true);
    expect(codes(result)).toContain('PLN-008');
    expect(result.diagnostics.every((d) => d.code !== 'PLN-008' || d.severity === 'warning')).toBe(
      true,
    );
  });

  it('reports diagnostics sorted by code, so output is stable', () => {
    const result = validatePlanDocument({
      plan: plan({
        phases: [phase({ id: '0', exitCriteria: [], tasks: [task({ id: 'T001' })] })],
      }),
      depth: 'lean',
    });
    const seen = result.diagnostics.map((d) => d.code);
    expect(seen).toEqual([...seen].sort());
  });

  it('never mutates the plan it is given', () => {
    const input = plan({ phases: [phase({ id: '0' })] });
    const before = JSON.stringify(input);
    validatePlanDocument({ plan: input, depth: 'lean' });
    expect(JSON.stringify(input)).toBe(before);
  });
});
