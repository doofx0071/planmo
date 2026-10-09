import { describe, expect, it } from 'vitest';
import type { StateDocument } from '@planmo/schema';
import { doctorEngine, type DoctorInput } from './doctor.js';
import { validatorEngine, type ValidationInput } from './validate.js';

/**
 * Worker B (P09-02 validate + P09-03 doctor) unit tests.
 * Pure engines: every test asserts deterministic, stable-code diagnostics.
 */

const state = (over: Partial<StateDocument> = {}): StateDocument => ({
  schemaVersion: 1,
  currentPhase: '09',
  status: 'planned',
  completedPhases: ['00', '01', '02', '03', '04', '05', '06', '07', '08'],
  blockedTasks: [],
  ...over,
});

const cleanValidateInput = (): ValidationInput => ({
  state: state(),
  documents: { state: '', tasks: '', manifest: '', handoff: '' },
  tasks: [],
});

const minimalHandoff = (nextPhase: string): string =>
  JSON.stringify({
    schemaVersion: 1,
    phase: '08',
    status: 'COMPLETE',
    nextPhase,
  });

describe('validatorEngine (P09-02)', () => {
  it('flags a phase gap (VLD-001): currentPhase skips ahead of the last completed phase', () => {
    const result = validatorEngine().validate({
      ...cleanValidateInput(),
      state: state({ currentPhase: '10' }),
    });
    const vld = result.diagnostics.find((d) => d.code === 'VLD-001');
    expect(vld?.severity).toBe('error');
    expect(vld?.target).toBe('state');
    expect(result.counts.error).toBe(1);
  });

  it('exempts status "complete" from the phase-gap check (VLD-001)', () => {
    const result = validatorEngine().validate({
      ...cleanValidateInput(),
      state: state({ currentPhase: '10', status: 'complete' }),
    });
    expect(result.diagnostics.some((d) => d.code === 'VLD-001')).toBe(false);
    expect(result.diagnostics).toEqual([]);
  });

  it('flags blockedTasks referencing unknown or non-blocked tasks (VLD-002)', () => {
    const input: ValidationInput = {
      ...cleanValidateInput(),
      state: state({ blockedTasks: ['P09-01', 'P99-99'] }),
      documents: {
        state: JSON.stringify(state({ blockedTasks: ['P09-01', 'P99-99'] })),
        tasks: 'id,phase,title,status,priority\nP09-01,09,Implement validator,TODO,high',
        manifest: '',
        handoff: '',
      },
    };
    const result = validatorEngine().validate(input);
    const vld2 = result.diagnostics.filter((d) => d.code === 'VLD-002');
    expect(vld2).toHaveLength(2);
    expect(vld2.map((d) => d.target).sort()).toEqual(['P09-01', 'P99-99']);
    expect(vld2.every((d) => d.severity === 'error')).toBe(true);
    expect(vld2.some((d) => d.target === 'P09-01' && d.message.includes('"TODO"'))).toBe(true);
    expect(vld2.some((d) => d.target === 'P99-99' && d.message.includes('no row'))).toBe(true);
    expect(result.counts.error).toBe(2);
  });

  it('accepts blocked tasks whose status is BLOCKED (no VLD-002)', () => {
    const blocked = ['P09-01'];
    const input: ValidationInput = {
      ...cleanValidateInput(),
      state: state({ blockedTasks: blocked }),
      documents: {
        state: JSON.stringify(state({ blockedTasks: blocked })),
        tasks: 'id,phase,title,status,priority\nP09-01,09,Implement validator,BLOCKED,high',
        manifest: '',
        handoff: '',
      },
    };
    expect(
      validatorEngine()
        .validate(input)
        .diagnostics.some((d) => d.code === 'VLD-002'),
    ).toBe(false);
  });

  it('flags wrong handoff.nextPhase (VLD-003) as a warning', () => {
    const input: ValidationInput = {
      ...cleanValidateInput(),
      state: state({
        currentPhase: '08',
        completedPhases: ['00', '01', '02', '03', '04', '05', '06', '07'],
      }),
      documents: {
        state: '',
        tasks: '',
        manifest: '',
        handoff: minimalHandoff('10'),
      },
    };
    const result = validatorEngine().validate(input);
    const vld = result.diagnostics.find((d) => d.code === 'VLD-003');
    expect(vld?.severity).toBe('warning');
    expect(vld?.target).toBe('handoff');
    expect(vld?.message).toContain('"10"');
    expect(vld?.message).toContain('"09"');
    expect(result.counts.warning).toBe(1);
  });

  it('accepts a matching handoff.nextPhase (no VLD-003)', () => {
    const input: ValidationInput = {
      ...cleanValidateInput(),
      state: state({
        currentPhase: '08',
        completedPhases: ['00', '01', '02', '03', '04', '05', '06', '07'],
      }),
      documents: { state: '', tasks: '', manifest: '', handoff: minimalHandoff('09') },
    };
    expect(
      validatorEngine()
        .validate(input)
        .diagnostics.some((d) => d.code === 'VLD-003'),
    ).toBe(false);
  });

  it('flags a malformed state document (VLD-004) with the parse error', () => {
    const result = validatorEngine().validate({
      documents: { state: '{ not valid json', tasks: '', manifest: '', handoff: '' },
      tasks: [],
    });
    const vld = result.diagnostics.find((d) => d.code === 'VLD-004');
    expect(vld?.severity).toBe('error');
    expect(vld?.target).toBe('state');
    expect(vld?.message.length ?? 0).toBeGreaterThan(0);
    expect(result.counts.error).toBe(1);
  });

  it('flags a malformed tasks CSV (VLD-004): a line without 5 fields', () => {
    const result = validatorEngine().validate({
      ...cleanValidateInput(),
      state: state({ blockedTasks: [] }),
      documents: {
        state: '',
        tasks: 'P09-01,09,Implement validator,TODO', // 4 fields
        manifest: '',
        handoff: '',
      },
    });
    const vld = result.diagnostics.find((d) => d.code === 'VLD-004' && d.target === 'tasks');
    expect(vld?.severity).toBe('error');
    expect(vld?.message).toContain('expected 5');
  });

  it('flags a malformed manifest and handoff document (VLD-004)', () => {
    const result = validatorEngine().validate({
      ...cleanValidateInput(),
      documents: {
        state: '',
        tasks: '',
        manifest: '{"schemaVersion":99}',
        handoff: 'not-json',
      },
    });
    expect(result.diagnostics.filter((d) => d.code === 'VLD-004').map((d) => d.target)).toEqual([
      'manifest',
      'handoff',
    ]);
  });

  it('clean canonical input produces zero diagnostics', () => {
    const result = validatorEngine().validate(cleanValidateInput());
    expect(result.diagnostics).toEqual([]);
    expect(result.counts).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it('is deterministic and byte-stable', () => {
    const input = cleanValidateInput();
    const first = JSON.stringify(validatorEngine().validate(input));
    const second = JSON.stringify(validatorEngine().validate(input));
    expect(second).toBe(first);
  });
});

describe('doctorEngine (P09-03)', () => {
  const cleanEnv = (over: Partial<DoctorInput> = {}): DoctorInput => ({
    nodeVersion: '24.11.0',
    packageManagerName: 'pnpm',
    gitWorktreeDirty: false,
    promptFilesMissing: 0,
    ...over,
  });

  it('flags node < 24 (DOC-001) as an error and fails the result', () => {
    const result = doctorEngine().check(cleanEnv({ nodeVersion: '22.9.0' }));
    const doc = result.diagnostics.find((d) => d.code === 'DOC-001');
    expect(doc?.severity).toBe('error');
    expect(doc?.target).toBe('node');
    expect(result.counts.error).toBe(1);
    expect(result.result).toBe('fail');
  });

  it('warns on node 25+ ahead-of-LTS (DOC-002)', () => {
    const result = doctorEngine().check(cleanEnv({ nodeVersion: '25.3.0' }));
    const doc = result.diagnostics.find((d) => d.code === 'DOC-002');
    expect(doc?.severity).toBe('warning');
    expect(result.result).toBe('warn');
  });

  it('flags a non-pnpm package manager (DOC-003) when the project expects pnpm', () => {
    const result = doctorEngine().check(
      cleanEnv({ packageManagerName: 'npm', expectedPackageManager: 'pnpm' }),
    );
    const doc = result.diagnostics.find((d) => d.code === 'DOC-003');
    expect(doc?.severity).toBe('error');
    expect(doc?.target).toBe('packageManager');
    expect(result.result).toBe('fail');
  });

  it('does not invent a package-manager expectation (DOC-003 stays silent)', () => {
    // The engine used to hardcode "pnpm", so every non-pnpm project — a Python
    // service, a Go binary — was told its package manager was an error. With no
    // declared expectation there is nothing to judge, so it reports nothing and
    // the "clean environment reports nothing" property holds.
    const result = doctorEngine().check(cleanEnv({ packageManagerName: 'poetry' }));
    expect(result.diagnostics.find((d) => d.code === 'DOC-003')).toBeUndefined();
    expect(result.result).toBe('ok');
  });

  it('stays quiet when the declared expectation matches (DOC-003)', () => {
    const result = doctorEngine().check(
      cleanEnv({ packageManagerName: 'pnpm', expectedPackageManager: 'pnpm' }),
    );
    expect(result.diagnostics.find((d) => d.code === 'DOC-003')).toBeUndefined();
    expect(result.result).toBe('ok');
  });

  it('flags a dirty git worktree (DOC-004) as a warning', () => {
    const result = doctorEngine().check(cleanEnv({ gitWorktreeDirty: true }));
    const doc = result.diagnostics.find((d) => d.code === 'DOC-004');
    expect(doc?.severity).toBe('warning');
    expect(doc?.target).toBe('git');
    expect(result.result).toBe('warn');
  });

  it('reports fresh gate checks (DOC-005) as info only', () => {
    const result = doctorEngine().check(cleanEnv({ gateLastRunMinutes: 5 }));
    const doc = result.diagnostics.find((d) => d.code === 'DOC-005');
    expect(doc?.severity).toBe('info');
    expect(result.result).toBe('ok');
  });

  it('does not emit DOC-005 when gates are stale or never ran', () => {
    expect(
      doctorEngine()
        .check(cleanEnv({ gateLastRunMinutes: 60 }))
        .diagnostics.some((d) => d.code === 'DOC-005'),
    ).toBe(false);
    expect(
      doctorEngine()
        .check(cleanEnv())
        .diagnostics.some((d) => d.code === 'DOC-005'),
    ).toBe(false);
  });

  it('flags missing next-phase prompts (DOC-006) as an error', () => {
    const result = doctorEngine().check(cleanEnv({ promptFilesMissing: 2 }));
    const doc = result.diagnostics.find((d) => d.code === 'DOC-006');
    expect(doc?.severity).toBe('error');
    expect(doc?.target).toBe('prompts');
    expect(doc?.message).toContain('2');
    expect(result.result).toBe('fail');
  });

  it('clean environment produces zero diagnostics and a green result', () => {
    const result = doctorEngine().check(cleanEnv());
    expect(result.diagnostics).toEqual([]);
    expect(result.counts).toEqual({ error: 0, warning: 0, info: 0 });
    expect(result.result).toBe('ok');
  });

  it('is deterministic and byte-stable', () => {
    const input = cleanEnv({ gateLastRunMinutes: 5, gitWorktreeDirty: true });
    const first = JSON.stringify(doctorEngine().check(input));
    const second = JSON.stringify(doctorEngine().check(input));
    expect(second).toBe(first);
  });

  it('is read-only: repeated checks produce identical results without side effects', () => {
    const input = cleanEnv({ gateLastRunMinutes: 30 });
    const snap = JSON.stringify(input);
    doctorEngine().check(input);
    doctorEngine().check(input);
    expect(JSON.stringify(input)).toBe(snap);
  });
});

describe('shared diagnostic contract (P09-02/03)', () => {
  it('validate and doctor sort diagnostics by severity rank then code', () => {
    const doctorResult = doctorEngine().check({
      nodeVersion: '22.9.0',
      packageManagerName: 'npm',
      gitWorktreeDirty: true,
      gateLastRunMinutes: 5,
      promptFilesMissing: 1,
    });
    const codes = doctorResult.diagnostics.map((d) => `${d.severity}:${d.code}`);
    const severities = doctorResult.diagnostics.map((d) => d.severity);
    const rank = { error: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < severities.length; i += 1) {
      expect(rank[severities[i - 1] as keyof typeof rank]).toBeLessThanOrEqual(
        rank[severities[i] as keyof typeof rank],
      );
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every diagnostic carries a stable therapeutic code', () => {
    const validation = validatorEngine().validate({
      state: state({ currentPhase: '10', blockedTasks: ['P09-01'] }),
      documents: { state: '', tasks: '', manifest: '', handoff: '' },
      tasks: [],
    });
    for (const d of validation.diagnostics) {
      expect(d.code).toMatch(/^VLD-00[1-4]$/);
    }
    const doctorResult = doctorEngine().check({
      nodeVersion: '22.9.0',
      packageManagerName: 'npm',
      gitWorktreeDirty: true,
      gateLastRunMinutes: 5,
      promptFilesMissing: 1,
    });
    for (const d of doctorResult.diagnostics) {
      expect(d.code).toMatch(/^DOC-00[1-6]$/);
    }
  });

  it('rejects a non-canonical task id (VLD-005)', () => {
    const report = validatorEngine().validate({
      documents: { tasks: 'id,phase,title,status,priority\nT01,00,x,TODO,MUST\n' },
    });
    expect(report.diagnostics.map((d) => d.code)).toContain('VLD-005');
    expect(report.counts.error).toBe(1);
  });

  it('rejects a task id whose phase disagrees with its phase column (VLD-006)', () => {
    const report = validatorEngine().validate({
      documents: { tasks: 'id,phase,title,status,priority\nP07-01,03,x,TODO,MUST\n' },
    });
    expect(report.diagnostics.map((d) => d.code)).toContain('VLD-006');
  });

  it('accepts canonical task ids', () => {
    const report = validatorEngine().validate({
      documents: { tasks: 'id,phase,title,status,priority\nP03-01,03,x,TODO,MUST\n' },
    });
    expect(report.diagnostics).toEqual([]);
  });

  it('accepts a quoted title containing a comma', () => {
    const report = validatorEngine().validate({
      documents: {
        tasks:
          'id,phase,title,status,priority\nP03-01,03,"Define scope, users and risks",TODO,MUST\n',
      },
    });
    expect(report.diagnostics).toEqual([]);
  });
});
