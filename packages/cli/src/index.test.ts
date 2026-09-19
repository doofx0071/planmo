import { describe, expect, it } from 'vitest';
import { run } from './index.js';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
  };
  return { io, out, err };
}

describe('planmo smoke CLI', () => {
  it('prints the version and exits 0 for --version', () => {
    const { io, out } = capture();
    const code = run(['--version'], io);
    expect(code).toBe(0);
    expect(out[0]).toMatch(/^planmo \d+\.\d+\.\d+$/);
  });

  it('supports -v as a version alias', () => {
    const { io, out } = capture();
    const code = run(['-v'], io);
    expect(code).toBe(0);
    expect(out[0]).toMatch(/^planmo \d+\.\d+\.\d+$/);
  });

  it('prints usage and exits 0 for --help', () => {
    const { io, out, err } = capture();
    const code = run(['--help'], io);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('Usage: planmo <command>');
    expect(err).toHaveLength(0);
  });

  it('prints usage when invoked with no arguments', () => {
    const { io, out } = capture();
    const code = run([], io);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('Usage:');
  });

  it('rejects unknown commands on stderr with a non-zero exit code', () => {
    const { io, out, err } = capture();
    const code = run(['frobnicate'], io);
    expect(code).toBe(1);
    expect(err.join('\n')).toContain("unknown command 'frobnicate'");
    expect(err.join('\n')).toContain('--help');
    expect(out).toHaveLength(0);
  });
});
