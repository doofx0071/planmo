import { readdir, readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { run, USAGE } from './index.js';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
  };
  return { io, out, err };
}

const tempDirs: string[] = [];
async function tempRoot(prefix = 'planmo-cli-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  while (tempDirs.length > 0) await rm(tempDirs.pop()!, { recursive: true, force: true });
});

describe('planmo CLI — version/help', () => {
  it('prints the version and exits 0 for --version', async () => {
    const { io, out } = capture();
    const code = await run(['--version'], io);
    expect(code).toBe(0);
    expect(out[0]).toMatch(/^planmo \d+\.\d+\.\d+$/);
  });

  it('supports -v as a version alias', async () => {
    const { io, out } = capture();
    const code = await run(['-v'], io);
    expect(code).toBe(0);
    expect(out[0]).toMatch(/^planmo \d+\.\d+\.\d+$/);
  });

  it('prints usage and exits 0 for --help', async () => {
    const { io, out, err } = capture();
    const code = await run(['--help'], io);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('Usage: planmo <command>');
    expect(err).toHaveLength(0);
  });

  it('prints usage when invoked with no arguments', async () => {
    const { io, out } = capture();
    const code = await run([], io);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('Usage:');
  });

  it('rejects unknown commands on stderr with a non-zero exit code', async () => {
    const { io, out, err } = capture();
    const code = await run(['frobnicate'], io);
    expect(code).toBe(1);
    expect(err.join('\n')).toContain("unknown command 'frobnicate'");
    expect(err.join('\n')).toContain('--help');
    expect(out).toHaveLength(0);
  });
});

describe('planmo init', () => {
  it('creates a valid workspace non-interactively with defaults', async () => {
    const root = await tempRoot();
    const { io, out } = capture();
    const wizard = {
      prompt: async () => {
        throw new Error('should not prompt');
      },
      out: () => {},
    };
    const code = await run(['init', root, '--yes'], io, wizard);
    expect(code).toBe(0);
    const files = (await readdir(join(root, '.planmo'))).sort();
    expect(files).toEqual(['manifest.json', 'project.yml', 'state.yml']);
    expect(out.join('\n')).toContain('workspace initialized');
  });

  it('accepts project options via flags', async () => {
    const root = await tempRoot();
    const { io } = capture();
    const code = await run(
      ['init', root, '--yes', '--name', 'Billing', '--type', 'service', '--risk', 'high'],
      io,
      {
        prompt: async () => {
          throw new Error('should not prompt');
        },
        out: () => {},
      },
    );
    expect(code).toBe(0);
    const yaml = await readFile(join(root, '.planmo', 'project.yml'), 'utf8');
    expect(yaml).toContain('name: Billing');
    expect(yaml).toContain('type: service');
    expect(yaml).toContain('risk: high');
  });

  it('prompts for values only when interactive', async () => {
    const root = await tempRoot();
    const { io } = capture();
    const asked: string[] = [];
    const answers: Record<string, string> = {
      'Project name': 'Prompter-Project',
      Type: 'service',
      Lifecycle: 'greenfield',
      Risk: 'medium',
      'Primary agent': 'opencode',
    };
    const wizard = {
      prompt: async (q: string) => {
        asked.push(q);
        return answers[q] ?? 'minimal';
      },
      out: () => {},
    };
    const code = await run(['init', root], io, wizard);
    expect(code).toBe(0);
    expect(asked.length).toBeGreaterThan(0);
    const yaml = await readFile(join(root, '.planmo', 'project.yml'), 'utf8');
    expect(yaml).toContain('name: Prompter-Project');
    expect(yaml).toContain('type: service');
  });

  it('dry-run writes nothing', async () => {
    const root = await tempRoot();
    const { io, out } = capture();
    const code = await run(['init', root, '--yes', '--dry-run'], io, {
      prompt: async () => 'x',
      out: () => {},
    });
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('[dry-run]');
    const { readdir } = await import('node:fs/promises');
    await expect(readdir(join(root, '.planmo'))).rejects.toThrow();
  });

  it('refuses to overwrite an existing workspace without --force', async () => {
    const root = await tempRoot();
    await run(['init', root, '--yes'], capture().io, { prompt: async () => 'x', out: () => {} });
    const { io, err } = capture();
    const code = await run(['init', root, '--yes'], io, { prompt: async () => 'x', out: () => {} });
    expect(code).toBe(2);
    expect(err.join('\n')).toContain('collision');
    expect(err.join('\n')).toContain('--force');
  });

  it('overwrites existing files with --force', async () => {
    const root = await tempRoot();
    await run(['init', root, '--yes'], capture().io, { prompt: async () => 'x', out: () => {} });
    const { io } = capture();
    const code = await run(['init', root, '--yes', '--force'], io, {
      prompt: async () => 'x',
      out: () => {},
    });
    expect(code).toBe(0);
    const yaml = await readFile(join(root, '.planmo', 'project.yml'), 'utf8');
    expect(yaml).toContain('schemaVersion: 1');
  });

  it('reports an invalid flag value as an error', async () => {
    const root = await tempRoot();
    const { io, err } = capture();
    const code = await run(['init', root, '--yes', '--type', 'hovercraft'], io, {
      prompt: async () => 'x',
      out: () => {},
    });
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('planmo init:');
  });
});

describe('planmo status', () => {
  it('reports a healthy workspace', async () => {
    const root = await tempRoot();
    await run(['init', root, '--yes'], capture().io, { prompt: async () => 'x', out: () => {} });
    const { io, out } = capture();
    const code = await run(['status', '--dir', root], io);
    expect(code).toBe(0);
    expect(out.join('\n')).toContain('HEALTHY');
  });

  it('reports missing documents as invalid', async () => {
    const root = await tempRoot();
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(root, '.planmo'));
    const { io, err } = capture();
    const code = await run(['status', '--dir', root], io);
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('project.yml');
  });

  it('exits 3 when no workspace exists', async () => {
    const root = await tempRoot();
    const { io, err } = capture();
    const code = await run(['status', '--dir', root], io);
    expect(code).toBe(3);
    expect(err.join('\n')).toContain('no PlanMo project found');
  });
});

describe('USAGE', () => {
  it('documents init and status commands', () => {
    expect(USAGE).toContain('init');
    expect(USAGE).toContain('status');
    expect(USAGE).toContain('--dry-run');
    expect(USAGE).toContain('--force');
  });

  it('documents the generate command', () => {
    expect(USAGE).toContain('generate');
  });
});

describe('planmo generate', () => {
  const wizard = { prompt: async () => 'x', out: () => {} };

  it('writes the planning tree for an initialized workspace and exits 0', async () => {
    const root = await tempRoot();
    await run(['init', root, '--yes'], capture().io, wizard);
    const { io, out } = capture();
    expect(await run(['generate', '--dir', root], io)).toBe(0);
    expect(out.join('\n')).toContain('planning/ROADMAP.md');
  });

  it('exits 3 without a workspace', async () => {
    const root = await tempRoot();
    const { io, err } = capture();
    expect(await run(['generate', '--dir', root], io)).toBe(3);
    expect(err.join('\n')).toContain('planmo generate:');
  });

  it('--dry-run plans without writing anything', async () => {
    const root = await tempRoot();
    await run(['init', root, '--yes'], capture().io, wizard);
    const { rm } = await import('node:fs/promises');
    await rm(join(root, 'planning'), { recursive: true, force: true });
    const { io, out } = capture();
    expect(await run(['generate', '--dir', root, '--dry-run'], io)).toBe(0);
    expect(out.join('\n')).toContain('[dry-run]');
    await expect(readdir(join(root, 'planning'))).rejects.toThrow();
  });
});

describe('planmo init — planning workspace', () => {
  const wizard = { prompt: async () => 'x', out: () => {} };

  it('generates the planning tree alongside .planmo', async () => {
    const root = await tempRoot();
    expect(await run(['init', root, '--yes'], capture().io, wizard)).toBe(0);
    const planning = await readdir(join(root, 'planning'));
    expect(planning).toContain('ROADMAP.md');
    expect(planning).toContain('TRACKER.md');
    expect(planning).toContain('phases');
    expect(planning).toContain('handoffs');
  });

  it('still writes exactly the three .planmo documents', async () => {
    const root = await tempRoot();
    await run(['init', root, '--yes'], capture().io, wizard);
    expect((await readdir(join(root, '.planmo'))).sort()).toEqual([
      'manifest.json',
      'project.yml',
      'state.yml',
    ]);
  });
});
