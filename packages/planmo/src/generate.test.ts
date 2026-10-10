import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
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
 * + 18 full-workspace documents (README, MASTER-PLAN, DECISIONS,
 *   OPEN-QUESTIONS, RISKS, REQUIREMENTS-TRACEABILITY, tasks.csv,
 *   architecture/{ARCHITECTURE,DOMAIN-MODEL,SECURITY-PRIVACY,STATE-MACHINES},
 *   compliance/POLICY-REGISTER, design/{DESIGN-BRIEF,DESIGN-SYSTEM},
 *   prompts/{README,phase-prompt}, requirements/PRODUCT-REQUIREMENTS,
 *   testing/TEST-STRATEGY)
 * = 30 artifacts.
 *
 * The first run also writes `.planmo/manifest.json`, so it reports 31 writes
 * while the manifest records the 30 artifacts. Six of the 30 are `seeded` —
 * created once, then owned by the user — so a second run writes 25.
 *
 * Policy documents are pack-derived, so a project declaring `packs: []` has
 * none. The golden fixtures declare packs and therefore emit more — that
 * difference is expected, not a regression.
 */
const EXPECTED_ARTIFACTS = 31;
/** The first run also writes `.planmo/manifest.json` itself. */
const EXPECTED_FIRST_RUN_WRITES = EXPECTED_ARTIFACTS + 1;
const EXPECTED_MANIFEST_ENTRIES = EXPECTED_ARTIFACTS;
/** Seeded documents are created once and never rewritten afterwards. */
const EXPECTED_SEEDED = 7;
const EXPECTED_SECOND_RUN_WRITES = EXPECTED_FIRST_RUN_WRITES - EXPECTED_SEEDED;

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
    expect(result.written).toContain('planning/MASTER-PLAN.md');
    expect(result.written).toContain('planning/tasks.csv');
    expect(result.written).toContain('planning/architecture/ARCHITECTURE.md');
    expect(result.written).toContain('planning/testing/TEST-STRATEGY.md');
    expect(result.written).toHaveLength(EXPECTED_FIRST_RUN_WRITES);
  });

  it('is idempotent — a second run produces no collisions', async () => {
    const root = await freshRoot();
    await generatePlanningWorkspace({ root, planmoVersion: '0.0.0-test' });
    // No allowOverwrite: a manifest-owned workspace regenerates cleanly, which
    // is the entire point of the ownership manifest. Passing `false` explicitly
    // would instead make the pre-existing .planmo/manifest.json a collision.
    const second = await generatePlanningWorkspace({
      root,
      planmoVersion: '0.0.0-test',
    });
    expect(second.collisions).toEqual([]);
    // Seeded documents are already on disk and belong to the user, so they are
    // skipped — everything else is refreshed.
    expect(second.written).toHaveLength(EXPECTED_SECOND_RUN_WRITES);
    expect(second.written).not.toContain('planning/DECISIONS.md');
    expect(second.written).not.toContain('planning/RISKS.md');
    // Evidence is recorded by the user; rewriting it would discard every result and
    // clear the `pass` the trace engine had already accepted.
    expect(second.written).not.toContain('planning/testing/TEST-EVIDENCE.csv');
    expect(second.written).toContain('planning/MASTER-PLAN.md');
  });

  it('preserves recorded evidence across a regeneration', async () => {
    const root = await freshRoot();
    await generatePlanningWorkspace({ root, planmoVersion: '0.0.0-test' });

    // Record a real result the way a user (or an agent) would.
    const evidencePath = join(root, 'planning', 'testing', 'TEST-EVIDENCE.csv');
    const before = await readFile(evidencePath, 'utf8');
    const recorded = before
      .split('\n')
      .map((line) =>
        line.startsWith('P00-01,unit tests,') ? 'P00-01,unit tests,bun run test,pass' : line,
      )
      .join('\n');
    await writeFile(evidencePath, recorded, 'utf8');

    await generatePlanningWorkspace({ root, planmoVersion: '0.0.0-test' });

    const after = await readFile(evidencePath, 'utf8');
    // The whole point: a generated file here would come back as a blank scaffold and
    // TRC-002 would fire again for every task that had been evidenced.
    expect(after).toContain('P00-01,unit tests,bun run test,pass');
  });

  it('dry-run writes nothing', async () => {
    const root = await freshRoot();
    const result = await generatePlanningWorkspace({
      root,
      planmoVersion: '0.0.0-test',
      dryRun: true,
    });
    expect(result.written).toHaveLength(EXPECTED_FIRST_RUN_WRITES);
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
