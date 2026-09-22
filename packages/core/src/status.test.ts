import { readFile, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initWorkspace } from './init.js';
import { readStatus } from './status.js';
import { ProjectNotFoundError } from './errors.js';
import { tempRoot, tempWrite } from './test-utils.js';

describe('readStatus', () => {
  it('reports a healthy workspace created by init', async () => {
    const root = await tempRoot();
    await initWorkspace({ root });
    const status = await readStatus({ root });
    expect(status.healthy).toBe(true);
    expect(status.issues).toEqual([]);
    expect(status.project?.project.name).toBeTruthy();
    expect(status.state?.status).toBe('planned');
  });

  it('finds the root by walking up when started from a nested dir', async () => {
    const root = await tempRoot();
    await initWorkspace({ root });
    const { mkdir } = await import('node:fs/promises');
    const nested = join(root, 'src', 'deep');
    await mkdir(nested, { recursive: true });
    const status = await readStatus({ startDir: nested });
    // Canonicalize both sides (macOS /var -> /private/var; Windows 8.3 names).
    expect(realpathSync(status.root)).toBe(realpathSync(root));
    expect(status.healthy).toBe(true);
  });

  it('reports missing documents as issues', async () => {
    const root = await tempRoot();
    await (await import('node:fs/promises')).mkdir(join(root, '.planmo'), { recursive: true });
    const status = await readStatus({ root });
    expect(status.healthy).toBe(false);
    const docs = status.issues.map((i) => i.doc);
    expect(docs).toEqual(['project.yml', 'state.yml', 'manifest.json']);
    expect(status.issues.every((i) => i.level === 'error')).toBe(true);
  });

  it('flags schema-invalid documents', async () => {
    const root = await tempRoot();
    await (await import('node:fs/promises')).mkdir(join(root, '.planmo'), { recursive: true });
    await tempWrite(root, '.planmo/project.yml', 'project: {}\n');
    await tempWrite(root, '.planmo/state.yml', 'currentPhase: 99\nstatus: nope\n');
    await tempWrite(
      root,
      '.planmo/manifest.json',
      '{"schemaVersion":1,"revision":-1,"entries":[]}',
    );
    const status = await readStatus({ root });
    expect(status.healthy).toBe(false);
    expect(status.issues.length).toBeGreaterThanOrEqual(1);
  });

  it('never writes: file mtimes and content are untouched', async () => {
    const root = await tempRoot();
    await initWorkspace({ root });
    const projectPath = join(root, '.planmo', 'project.yml');
    const before = await readFile(projectPath, 'utf8');
    const mtimeBefore = (await stat(projectPath)).mtimeMs;
    await readStatus({ root });
    expect(await readFile(projectPath, 'utf8')).toBe(before);
    expect((await stat(projectPath)).mtimeMs).toBe(mtimeBefore);
  });

  it('throws ProjectNotFoundError when no .planmo exists', async () => {
    const root = await tempRoot();
    await expect(readStatus({ root })).rejects.toThrow(ProjectNotFoundError);
  });
});
