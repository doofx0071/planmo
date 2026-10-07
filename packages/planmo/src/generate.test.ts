import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initWorkspace } from '@planmo/core';
import { generatePlanningWorkspace } from './generate.js';

/**
 * Artifacts for a fresh `init` workspace at standard depth:
 *   4 planning root docs (CONTEXT/ROADMAP/STANDARDS/TRACKER)
 * + 1 handoff template
 * + 7 phase docs (phase-00..06)
 * + 1 generation manifest
 * = 13.
 *
 * Policy documents are pack-derived, so a project declaring `packs: []` has
 * none. The golden fixtures declare packs and therefore emit 16 — that
 * difference is expected, not a regression.
 */
const EXPECTED_ARTIFACTS = 13;
const EXPECTED_MANIFEST_ENTRIES = 12;

async function freshRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'planmo-gen-'));
  await initWorkspace({ root, name: 'gen-fixture' });
  return root;
}

describe('generatePlanningWorkspace', () => {
  it('writes the planning tree for an initialized workspace', async () => {
    const root = await freshRoot();
    const result = await generatePlanningWorkspace({ root, planmoVersion: '0.0.0-test' });

    expect(result.collisions).toEqual([]);
    expect(result.written).toContain('planning/ROADMAP.md');
    expect(result.written).toContain('planning/TRACKER.md');
    expect(result.written).toContain('planning/handoffs/TEMPLATE.md');
    expect(result.written).toContain('planning/phases/phase-00.md');
    expect(result.written).toContain('.planmo/manifest.json');
    // Baseline artifact count; the Milestone 2 artifact set raises this.
    expect(result.written).toHaveLength(EXPECTED_ARTIFACTS);
  });

  it('is idempotent — a second run produces no collisions', async () => {
    const root = await freshRoot();
    await generatePlanningWorkspace({ root, planmoVersion: '0.0.0-test' });
    const second = await generatePlanningWorkspace({
      root,
      planmoVersion: '0.0.0-test',
      allowOverwrite: true,
    });
    expect(second.collisions).toEqual([]);
    expect(second.written).toHaveLength(EXPECTED_ARTIFACTS);
  });

  it('dry-run writes nothing', async () => {
    const root = await freshRoot();
    const result = await generatePlanningWorkspace({
      root,
      planmoVersion: '0.0.0-test',
      dryRun: true,
    });
    expect(result.written).toHaveLength(EXPECTED_ARTIFACTS);
    // Dry-run must not even create the directory.
    await expect(readdir(join(root, 'planning'))).rejects.toThrow();
  });

  it('rejects a directory with no .planmo workspace', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'planmo-empty-'));
    await expect(
      generatePlanningWorkspace({ root: empty, planmoVersion: '0.0.0-test' }),
    ).rejects.toThrow();
  });

  it('records the generated artifacts in the manifest', async () => {
    const root = await freshRoot();
    await generatePlanningWorkspace({ root, planmoVersion: '0.0.0-test' });
    const manifest = JSON.parse(await readFile(join(root, '.planmo/manifest.json'), 'utf8'));
    expect(manifest.entries).toHaveLength(EXPECTED_MANIFEST_ENTRIES);
    expect(manifest.entries.map((e: { path: string }) => e.path)).toContain('planning/ROADMAP.md');
  });
});
