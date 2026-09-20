import { describe, expect, it } from 'vitest';
import { transitionEngine, STANDARD_EXIT_GATES, PROMPT_BY_PHASE } from './transition.js';
import { handoffBuilder } from './handoff.js';
import { nextComposer } from './next.js';
import { changeEngine } from './change.js';

/** A valid Phase 07-complete state (matches repo `.planmo/state.yml` at merge). */
const state07 = {
  schemaVersion: 1 as const,
  currentPhase: '07' as const,
  status: 'planned' as const,
  completedPhases: ['00' as const, '01' as const, '02' as const, '03' as const, '04' as const, '05' as const, '06' as const],
  blockedTasks: [],
  nextPrompt: PROMPT_BY_PHASE['07'],
};

const allGatesPass = (phase: string) =>
  STANDARD_EXIT_GATES.map((name) => ({ name, phase, passed: true }));

describe('transitionEngine (P08-01)', () => {
  it('advances to the exact next phase when gates pass', () => {
    const engine = transitionEngine();
    const result = engine.advance(state07, '08', allGatesPass('07'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.next.currentPhase).toBe('08');
      expect(result.next.completedPhases).toContain('07');
      expect(result.next.nextPrompt).toBe(PROMPT_BY_PHASE['08']);
    }
  });

  it('rejects skipping phases', () => {
    const engine = transitionEngine();
    const result = engine.advance(state07, '09', allGatesPass('07'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/phase order/);
  });

  it('rejects advancing while any exit gate is red', () => {
    const engine = transitionEngine();
    const gates = allGatesPass('07').map((g, i) =>
      i === 2 ? { ...g, passed: false, detail: 'missing' } : g,
    );
    const result = engine.advance(state07, '08', gates);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/exit gates not clear/);
  });

  it('force overrides red gates', () => {
    const engine = transitionEngine();
    const gates = [{ name: 'tests', phase: '07', passed: false }];
    const result = engine.advance(state07, '08', gates, { force: true });
    expect(result.ok).toBe(true);
  });

  it('isNextPhase respects order and completion', () => {
    const engine = transitionEngine();
    expect(engine.isNextPhase(state07, '08')).toBe(true);
    expect(engine.isNextPhase(state07, '07')).toBe(false);
    expect(engine.isNextPhase(state07, '99')).toBe(false);
  });

  it('freshSession derives from canonical state, never memory', () => {
    const engine = transitionEngine();
    const fresh = engine.freshSession(state07);
    expect(fresh.currentPhase).toBe('07');
    expect(fresh.requiredGates).toEqual([...STANDARD_EXIT_GATES]);
    expect(fresh.isFresh).toBe(true);
    expect(fresh.instructions.length).toBeGreaterThanOrEqual(STANDARD_EXIT_GATES.length);
  });

  it('phaseOrder is deterministic and sorted', () => {
    const engine = transitionEngine();
    expect(engine.phaseOrder(state07)).toEqual(['00', '01', '02', '03', '04', '05', '06', '07']);
  });
});

describe('handoffBuilder (P08-02)', () => {
  const builder = handoffBuilder();
  it('builds a schema-valid handoff with sorted arrays', () => {
    const doc = builder.build({
      phase: '07',
      status: 'COMPLETE',
      completedTasks: ['P07-03', 'P07-01'],
      materialChanges: ['packages/design-engine', 'packages/schema'],
      nextPhase: '08',
      instructions: ['Record handoff'],
      testsRun: [{ command: 'pnpm run check', result: 'PASS' }],
      git: { branch: 'feat/phase-07', commits: ['7b1ca41'] },
    });
    expect(doc.completedTasks).toEqual(['P07-01', 'P07-03']);
    expect(doc.phase).toBe('07');
    expect(doc.nextPhase).toBe('08');
    expect(doc.materialChanges).toContain('packages/schema');
  });

  it('missingForResume flags absent essentials', () => {
    const doc = builder.build({ phase: '07', status: 'PARTIAL', completedTasks: [], nextPhase: '08' });
    const missing = builder.missingForResume(doc);
    expect(missing).toContain('completedTasks');
  });

  it('a fully specified handoff is resume-sufficient', () => {
    const doc = builder.build({
      phase: '07', status: 'COMPLETE',
      completedTasks: ['P07-01'], nextPhase: '08', instructions: ['go'],
    });
    expect(builder.missingForResume(doc)).toEqual([]);
  });
});

describe('nextComposer (P08-03 + P08-10)', () => {
  it('composes a deterministic directive + budgeted bundle', () => {
    const composer = nextComposer();
    const session = composer.compose({
      state: state07,
      nextPromptText: '# Prompt — read me',
      budgetTokens: 4000,
    });
    expect(session.phase).toBe('07');
    expect(session.blockers).toEqual([]);
    expect(session.budgetTokens).toBe(4000);
    expect(session.directive).toMatch(/Work phase 07/);
    expect(session.bundle.l0Capsule).toContain('Work phase 07');
    expect(session.bundle.estimatedTokens).toBeGreaterThan(0);
    expect(session.bundle.retrievalHandles).toContain(PROMPT_BY_PHASE['07']);
  });

  it('surfaces blocked tasks as blockers', () => {
    const composer = nextComposer();
    const session = composer.compose({
      state: { ...state07, blockedTasks: ['P07-02'] },
    });
    expect(session.blockers).toContain('BLOCKED P07-02 (state.blockedTasks)');
    expect(session.directive).toMatch(/clear 1 blocker/);
  });

  it('is deterministic (identical input → identical output)', () => {
    const composer = nextComposer();
    const a = composer.compose({ state: state07 });
    const b = composer.compose({ state: state07 });
    expect(a).toEqual(b);
    expect(a.bundle.l1Index).toBe(b.bundle.l1Index);
  });
});

describe('changeEngine (P08-11)', () => {
  const engine = changeEngine();
  it('newChange creates a proposed package with deltas', () => {
    const result = engine.newChange({
      id: 'CHG-002',
      slug: 'example-change',
      proposal: 'A test change.',
      requirementDeltas: [
        { kind: 'ADDED', requirementId: 'REQ-DESIGN-004', detail: 'New requirement' },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.change) expect(result.change.status).toBe('proposed');
  });

  it('rejects a change with zero deltas', () => {
    const result = engine.newChange({
      id: 'CHG-002', slug: 'x', proposal: 'p', requirementDeltas: [],
    });
    expect(result.ok).toBe(false);
  });

  it('apply stamps decision + moves to applied; archive moves to archived', () => {
    const made = engine.newChange({
      id: 'CHG-002', slug: 'x', proposal: 'p',
      requirementDeltas: [{ kind: 'MODIFIED', requirementId: 'REQ-X', detail: 'd' }],
    });
    if (!made.ok || !made.change) throw new Error('setup');
    const applied = engine.apply(made.change, 'ACCEPTED: all tests pass');
    expect(applied.ok).toBe(true);
    if (applied.ok && applied.change) {
      expect(applied.change.status).toBe('applied');
      expect(applied.change.decision).toMatch(/ACCEPTED/);
      const archived = engine.archive(applied.change);
      expect(archived.ok).toBe(true);
      if (archived.ok && archived.change) expect(archived.change.status).toBe('archived');
    }
  });

  it('cannot apply twice or archive unapplied changes', () => {
    const made = engine.newChange({
      id: 'CHG-002', slug: 'x', proposal: 'p',
      requirementDeltas: [{ kind: 'REMOVED', requirementId: 'REQ-X', detail: 'd' }],
    });
    if (!made.ok || !made.change) throw new Error('setup');
    const applied = engine.apply(made.change, 'ok');
    if (!applied.ok || !applied.change) throw new Error('apply');
    expect(engine.apply(applied.change, 'again').ok).toBe(false);
    const made2 = engine.newChange({
      id: 'CHG-003', slug: 'y', proposal: 'p',
      requirementDeltas: [{ kind: 'ADDED', requirementId: 'REQ-Y', detail: 'd' }],
    });
    if (!made2.ok || !made2.change) throw new Error('setup2');
    expect(engine.archive(made2.change).ok).toBe(false);
  });
});