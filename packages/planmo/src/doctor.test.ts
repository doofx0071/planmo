import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectPackageManager, gitWorktreeDirty, renderDoctor, runDoctor } from './doctor.js';
import { run } from './index.js';

/**
 * `planmo doctor` reports environment and workspace health. The tests that matter
 * most here are the negative ones: doctor must not fail a project for using a
 * package manager PlanMo happens not to use itself.
 *
 * The health word is host-dependent — DOC-002 warns on an ahead-of-LTS Node major,
 * and the project permits any major >= 24 — so the tests that assert "ok" pin a
 * supported Node version rather than inheriting the runner's. `runDoctor` still
 * judges the running Node by default; the injection is a test seam.
 */
const SUPPORTED_NODE = '24.11.0';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
}

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-doctor-'));
  expect(await run(['init', root, '--yes'], capture().io)).toBe(0);
  return root;
}

describe('detectPackageManager', () => {
  it('reports unknown when there is no lockfile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'planmo-doctor-bare-'));
    expect(await detectPackageManager(root)).toBe('unknown');
  });

  it('detects the manager from its lockfile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'planmo-doctor-lock-'));
    await writeFile(join(root, 'pnpm-lock.yaml'), '', 'utf8');
    expect(await detectPackageManager(root)).toBe('pnpm');
  });

  it('detects a non-Node manager too', async () => {
    const root = await mkdtemp(join(tmpdir(), 'planmo-doctor-py-'));
    await writeFile(join(root, 'poetry.lock'), '', 'utf8');
    expect(await detectPackageManager(root)).toBe('poetry');
  });

  it('prefers the more specific lockfile when several exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'planmo-doctor-both-'));
    await writeFile(join(root, 'package-lock.json'), '', 'utf8');
    await writeFile(join(root, 'pnpm-lock.yaml'), '', 'utf8');
    expect(await detectPackageManager(root)).toBe('pnpm');
  });
});

describe('gitWorktreeDirty', () => {
  it('reports clean, and never throws, outside a git repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'planmo-doctor-nogit-'));
    expect(gitWorktreeDirty(root)).toBe(false);
  });
});

describe('runDoctor', () => {
  it('reports a freshly generated workspace as ok on a supported Node', async () => {
    const root = await workspace();
    const outcome = await runDoctor({ root, nodeVersion: SUPPORTED_NODE });
    expect(outcome.result.result).toBe('ok');
    expect(outcome.result.counts.error).toBe(0);
  });

  it('judges the injected Node version, not the host running the tests', async () => {
    // The regression this seam exists for: asserting "ok" while reading the
    // host's process.version went red on every supported non-LTS major.
    const root = await workspace();
    const outcome = await runDoctor({ root, nodeVersion: '20.11.0' });
    expect(outcome.result.result).toBe('fail');
    expect(outcome.result.diagnostics.map((d) => d.code)).toContain('DOC-001');
  });

  it('resolves the environment facts it passes to the engine', async () => {
    const root = await workspace();
    const outcome = await runDoctor({ root });
    // The default is the running Node — that is the behaviour the seam preserves.
    expect(outcome.environment.nodeVersion).toBe(process.version);
    expect(outcome.environment.packageManager).toBe('unknown');
    expect(outcome.environment.promptFilesMissing).toBe(0);
  });

  it('does NOT fail a project for using a package manager PlanMo does not use', async () => {
    // The regression this whole change exists for: the engine hardcoded
    // "expected pnpm", so a Python or Go project was told its package manager was
    // an error. Nothing declares an expectation, so nothing is flagged.
    const root = await workspace();
    await writeFile(join(root, 'poetry.lock'), '', 'utf8');

    const outcome = await runDoctor({ root, nodeVersion: SUPPORTED_NODE });
    expect(outcome.environment.packageManager).toBe('poetry');
    expect(outcome.result.counts.error).toBe(0);
    expect(outcome.result.result).toBe('ok');
  });

  it('refuses a directory that is not a workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'planmo-doctor-empty-'));
    await expect(runDoctor({ root })).rejects.toThrow(/no PlanMo project found/);
  });
});

describe('renderDoctor', () => {
  it('shows the resolved environment even when nothing is wrong', async () => {
    const root = await workspace();
    const text = renderDoctor(await runDoctor({ root, nodeVersion: SUPPORTED_NODE }));
    expect(text).toContain('environment:');
    expect(text).toContain('package manager unknown');
    expect(text).toContain('doctor: OK');
  });
});

describe('planmo doctor — CLI', () => {
  it('exits 0 on a healthy workspace', async () => {
    const root = await workspace();
    const { io, out } = capture();
    expect(await run(['doctor', '--dir', root], io)).toBe(0);
    // The CLI judges the running Node, so the exact health word is host-dependent
    // (DOC-002 warns on an ahead-of-LTS major). Assert the contract a healthy
    // workspace must satisfy whatever the host: it never fails, and it always
    // reports the resolved environment.
    expect(out.join('\n')).toContain('doctor: ');
    expect(out.join('\n')).toContain('environment:');
  });

  it('exits 3 without a workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'planmo-doctor-none-'));
    const { io, err } = capture();
    expect(await run(['doctor', '--dir', root], io)).toBe(3);
    expect(err.join('\n')).toContain('planmo doctor:');
  });

  it('is documented in --help', async () => {
    const { io, out } = capture();
    await run(['--help'], io);
    expect(out.join('\n')).toContain('planmo doctor');
  });
});
