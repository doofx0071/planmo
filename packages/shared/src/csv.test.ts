import { describe, expect, it } from 'vitest';
import { csvField, splitCsvLine } from './csv.js';

/**
 * `planning/tasks.csv` is written by the generator and read by the validator in
 * `@planmo/trace`. They must agree on the format, so both use these functions:
 * a title containing a comma is quoted on write and must not split on read.
 */
describe('csv helpers', () => {
  it('leaves plain fields unquoted', () => {
    expect(csvField('P00-01')).toBe('P00-01');
    expect(csvField('TODO')).toBe('TODO');
  });

  it('quotes fields containing a comma, quote or newline', () => {
    expect(csvField('Define scope, users and risks')).toBe('"Define scope, users and risks"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
  });

  it('splits a plain line', () => {
    expect(splitCsvLine('id,phase,title,status,priority')).toEqual([
      'id',
      'phase',
      'title',
      'status',
      'priority',
    ]);
  });

  it('does not split on a comma inside quotes', () => {
    expect(splitCsvLine('P00-01,00,"Define scope, users and risks",TODO,MUST')).toEqual([
      'P00-01',
      '00',
      'Define scope, users and risks',
      'TODO',
      'MUST',
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(splitCsvLine('P00-01,00,"say ""hi""",TODO,MUST')[2]).toBe('say "hi"');
  });

  it('round-trips any field through csvField and splitCsvLine', () => {
    for (const value of ['plain', 'with,comma', 'with "quotes"', 'both, and "quoted"', '']) {
      expect(splitCsvLine(csvField(value))).toEqual([value]);
    }
  });
});
