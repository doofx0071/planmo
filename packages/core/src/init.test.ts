import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, StateSchema } from '@planmo/schema';
import { initWorkspace, workspaceDocuments } from './init.js';
import { tempRoot, tempWrite } from './test-utils.js';

describe('workspaceDocuments', () => {
  it('emits schema-valid project, state, and manifest documents', () => {
    const docs = workspaceDocuments({ root: '/tmp/foo' });
    expect(Object.keys(docs).sort()).toEqual([
      '.planmo/manifest.json',
      '.planmo/project.yml',
      '.planmo/state.yml',
    ]);
    const project = ProjectConfigSchema.parse(parseYaml(docs['.planmo/project.yml']!));
    expect(project.project.name).toBe('foo');
    expect(project.project.type).toBe('web-application');
    expect(project.packs).toEqual([]);
    const state = StateSchema.parse(parseYaml(docs['.planmo/state.yml']!));
    expect(state.status).toBe('planned');
    expect(state.completedPhases).toEqual([]);
    expect(JSON.parse(docs['.planmo/manifest.json']!)).toMatchObject({
      schemaVersion: 1,
      revision: 0,
      entries: [],
    });
  });

  it('defaults the project name to the root basename', () => {
    const docs = workspaceDocuments({ root: '/a/b/MyApp' });
    const project = ProjectConfigSchema.parse(parseYaml(docs['.planmo/project.yml']!));
    expect(project.project.name).toBe('MyApp');
  });

  it('honours explicit init options', () => {
    const docs = workspaceDocuments({
      root: '/tmp/x',
      name: 'Billing Service',
      type: 'service',
      lifecycle: 'brownfield',
      risk: 'high',
      primaryAgent: 'claude-code',
      planningDepth: 'production',
      phaseMode: 'continuous',
    });
    const project = ProjectConfigSchema.parse(parseYaml(docs['.planmo/project.yml']!));
    expect(project.project).toMatchObject({
      name: 'Billing Service',
      type: 'service',
      lifecycle: 'brownfield',
      risk: 'high',
    });
    expect(project.planning).toMatchObject({ depth: 'production', phaseMode: 'continuous' });
    expect(project.agents).toEqual({ primary: 'claude-code' });
  });

  it('rejects an invalid option at runtime', () => {
    // @ts-expect-error 'hovercraft' is not a ProjectType
    expect(() => workspaceDocuments({ root: '/tmp/x', type: 'hovercraft' })).toThrow();
  });
});

describe('initWorkspace', () => {
  it('creates a minimal valid workspace on disk', async () => {
    const root = await tempRoot();
    const result = await initWorkspace({ root });
    expect(result.written.sort()).toEqual([
      '.planmo/manifest.json',
      '.planmo/project.yml',
      '.planmo/state.yml',
    ]);
    expect(result.collisions).toEqual([]);
    expect(await readdir(join(root, '.planmo'))).toHaveLength(3);
    // Round-trip: what init wrote validates against the strict schemas.
    const project = ProjectConfigSchema.parse(
      parseYaml(await readFile(join(root, '.planmo', 'project.yml'), 'utf8')),
    );
    expect(project.project.name).toBe(root.split(/[\\/]/).pop());
    const state = StateSchema.parse(
      parseYaml(await readFile(join(root, '.planmo', 'state.yml'), 'utf8')),
    );
    expect(state.schemaVersion).toBe(1);
  });

  it('dry-run writes nothing', async () => {
    const root = await tempRoot();
    const result = await initWorkspace({ root, dryRun: true });
    expect(result.written.sort()).toEqual([
      '.planmo/manifest.json',
      '.planmo/project.yml',
      '.planmo/state.yml',
    ]);
    const { readdir } = await import('node:fs/promises');
    await expect(readdir(join(root, '.planmo'))).rejects.toThrow();
  });

  it('refuses to clobber an existing .planmo (collision)', async () => {
    const root = await tempRoot();
    await tempWrite(root, '.planmo/state.yml', 'user version');
    const result = await initWorkspace({ root });
    expect(result.collisions).toContain('.planmo/state.yml');
    expect(await readFile(join(root, '.planmo', 'state.yml'), 'utf8')).toBe('user version');
  });

  it('overwrites existing files only with allowOverwrite', async () => {
    const root = await tempRoot();
    await tempWrite(root, '.planmo/state.yml', 'old state');
    const result = await initWorkspace({ root, allowOverwrite: true });
    expect(result.collisions).toEqual([]);
    expect(result.written).toContain('.planmo/state.yml');
    const state = StateSchema.parse(
      parseYaml(await readFile(join(root, '.planmo', 'state.yml'), 'utf8')),
    );
    expect(state.status).toBe('planned');
  });
});
