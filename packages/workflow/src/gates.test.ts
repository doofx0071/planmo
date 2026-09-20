import { describe, expect, it } from 'vitest';
import type { GateDefinition, GateVerdict } from './contracts.js';
import { gateEvaluator } from './gates.js';

const gate = (over: Partial<GateDefinition> = {}): GateDefinition => ({
  id: 'tests',
  phase: '08',
  requirement: 'All unit tests pass.',
  ...over,
});

/** Assert a single in-scope verdict and return it (narrows the index). */
const only = (verdicts: readonly GateVerdict[]): GateVerdict => {
  expect(verdicts).toHaveLength(1);
  return verdicts[0] as GateVerdict;
};

describe('gateEvaluator (P08-05)', () => {
  it('passes an unconstrained documentation gate with no optional keys', () => {
    const evaluator = gateEvaluator();
    const verdict = only(evaluator.evaluate([gate()], { phase: '08', approvals: {} }));
    expect(verdict).toEqual({ gate: 'tests', phase: '08', passed: true });
    expect(Object.keys(verdict).sort()).toEqual(['gate', 'passed', 'phase']);
  });

  it('blocks a human-approval gate when the approval is missing', () => {
    const evaluator = gateEvaluator();
    const verdict = only(
      evaluator.evaluate([gate({ id: 'release', humanApproval: true })], {
        phase: '08',
        approvals: {},
      }),
    );
    expect(verdict.passed).toBe(false);
    if (verdict.reason) expect(verdict.reason).toMatch(/requires human approval/);
    expect(verdict.unblock).not.toBeUndefined();
    expect(verdict.unblock?.length).toBeGreaterThan(0);
  });

  it('blocks a human-approval gate when the approval is explicitly false', () => {
    const evaluator = gateEvaluator();
    const verdict = only(
      evaluator.evaluate([gate({ id: 'release', humanApproval: true })], {
        phase: '08',
        approvals: { release: false },
      }),
    );
    expect(verdict.passed).toBe(false);
  });

  it('passes a human-approval gate only when explicitly approved', () => {
    const evaluator = gateEvaluator();
    const unapproved = only(
      evaluator.evaluate([gate({ id: 'release', humanApproval: true })], {
        phase: '08',
        approvals: {},
      }),
    );
    const approved = only(
      evaluator.evaluate([gate({ id: 'release', humanApproval: true })], {
        phase: '08',
        approvals: { release: true },
      }),
    );
    expect(unapproved.passed).toBe(false);
    expect(approved).toEqual({ gate: 'release', phase: '08', passed: true });
  });

  it('blocks an artifact gate until the caller confirms its paths via approvals', () => {
    const evaluator = gateEvaluator();
    const def = gate({
      id: 'handoff',
      requires: ['planning/handoffs/phase-08-handoff.md', 'docs/handoffs.md'],
    });
    const blocked = only(evaluator.evaluate([def], { phase: '08', approvals: {} }));
    expect(blocked.passed).toBe(false);
    if (blocked.reason) expect(blocked.reason).toMatch(/requires artifacts/);
    expect(blocked.unblock?.[0]).toMatch(/approvals\["handoff"\] = true/);

    const cleared = only(evaluator.evaluate([def], { phase: '08', approvals: { handoff: true } }));
    expect(cleared.passed).toBe(true);
  });

  it('blocks a gate with both constraints and lists both reasons', () => {
    const evaluator = gateEvaluator();
    const verdict = only(
      evaluator.evaluate(
        [gate({ id: 'ship', humanApproval: true, requires: ['docs/checklist.md'] })],
        { phase: '08', approvals: {} },
      ),
    );
    expect(verdict.passed).toBe(false);
    if (verdict.reason) {
      expect(verdict.reason).toMatch(/requires human approval/);
      expect(verdict.reason).toMatch(/docs\/checklist\.md/);
    }
  });

  it('scopes verdicts to opts.phase and sorts by gate id', () => {
    const evaluator = gateEvaluator();
    const gates = [
      gate({ id: 'zeta', humanApproval: true }),
      gate({ id: 'handoff', phase: '07', humanApproval: true }),
      gate({ id: 'alpha', humanApproval: true }),
    ];
    const verdicts = evaluator.evaluate(gates, { phase: '08', approvals: {} });
    expect(verdicts.map((v) => v.gate)).toEqual(['alpha', 'zeta']);
    expect(verdicts.every((v) => v.phase === '08')).toBe(true);
  });

  it('returns an empty list for no in-scope gates', () => {
    const evaluator = gateEvaluator();
    expect(evaluator.evaluate([gate({ phase: '07' })], { phase: '08', approvals: {} })).toEqual([]);
    expect(evaluator.evaluate([], { phase: '08', approvals: {} })).toEqual([]);
  });

  it('ignores approvals for unrelated gates', () => {
    const evaluator = gateEvaluator();
    const verdict = only(
      evaluator.evaluate([gate({ id: 'tests', humanApproval: true })], {
        phase: '08',
        approvals: { other: true },
      }),
    );
    expect(verdict.passed).toBe(false);
  });

  it('is deterministic: identical input yields identical verdicts', () => {
    const evaluator = gateEvaluator();
    const defs = [
      gate({ id: 'tests', humanApproval: true }),
      gate({ id: 'handoff', requires: ['docs/handoffs.md'] }),
    ];
    const opts = { phase: '08', approvals: { tests: true } } as const;
    expect(evaluator.evaluate(defs, opts)).toEqual(evaluator.evaluate(defs, opts));
  });
});
