import { describe, expect, it } from 'vitest';
import { isTaskId, phaseId, taskId, taskNumber, taskPhase } from './ids.js';

/**
 * The canonical identifier scheme (docs/02-architecture/identifier-scheme.md).
 * Fixed width is load-bearing: the task DAG orders ready work by comparing
 * task-id strings, so `P07-10` must sort after `P07-09`.
 */
describe('identifier scheme', () => {
  it('pads phases to two digits', () => {
    expect(phaseId(0)).toBe('00');
    expect(phaseId(7)).toBe('07');
    expect(phaseId('12')).toBe('12');
  });

  it('builds task ids as P<NN>-<NN>', () => {
    expect(taskId('03', 1)).toBe('P03-01');
    expect(taskId(12, 10)).toBe('P12-10');
  });

  it('sorts task ids by phase then task, lexicographically', () => {
    const ids = ['P07-10', 'P07-09', 'P12-01', 'P07-01'];
    expect([...ids].sort()).toEqual(['P07-01', 'P07-09', 'P07-10', 'P12-01']);
  });

  it('rejects unpadded and non-canonical ids', () => {
    for (const bad of ['P7-3', 'T01', 'P03', 'P03-1', 'phase-03', 'P03-01-extra']) {
      expect(isTaskId(bad), bad).toBe(false);
    }
    expect(isTaskId('P03-01')).toBe(true);
  });

  it('extracts phase and number', () => {
    expect(taskPhase('P03-07')).toBe('03');
    expect(taskNumber('P03-07')).toBe('07');
    expect(taskPhase('nope')).toBeUndefined();
    expect(taskNumber('nope')).toBeUndefined();
  });
});
