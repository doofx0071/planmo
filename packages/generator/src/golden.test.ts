import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildIr } from './ir.js';
import { renderPlanningDocuments } from './render.js';
import { renderPlanWorkspace } from './plan-workspace.js';
import { renderStandardsAndContext } from './standards-context.js';
import { GOLDEN_LEVELS, inputForLevel } from './fixtures.js';

/**
 * Golden generated-repository fixtures (P05-04). The committed snapshots in
 * src/golden/<level>/ are produced by scripts/update-goldens.mjs from the
 * real pipeline; these tests assert the pipeline still produces EXACTLY
 * those bytes. Regenerating goldens is a separate, reviewed act — a
 * renderer change that alters output fails here first.
 */

const goldenRoot = join(import.meta.dirname, 'golden');

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await listFiles(p)));
    else files.push(p);
  }
  return files;
}

describe('golden generated-repository fixtures (P05-04)', () => {
  for (const level of GOLDEN_LEVELS) {
    it(`renders the ${level} assurance project byte-identically to its golden snapshot`, async () => {
      const ir = buildIr(inputForLevel(level));
      const artifacts = [
        ...renderPlanningDocuments(ir),
        ...renderStandardsAndContext(ir),
        ...renderPlanWorkspace(ir),
      ];

      // Guard: the committed golden must actually exist (non-empty snapshot).
      const goldenDir = join(goldenRoot, level);
      const committed = await listFiles(goldenDir);
      expect(committed.length).toBeGreaterThan(0);

      expect(artifacts.length).toBe(committed.length);
      for (const artifact of artifacts) {
        const goldenFile = join(goldenDir, artifact.path.replaceAll('/', '_'));
        const expected = await readFile(goldenFile, 'utf8');
        expect(artifact.content, `golden mismatch for ${artifact.path}`).toBe(expected);
      }
    });
  }

  it('covers at least low, medium, and high assurance levels (exit gate)', () => {
    expect(GOLDEN_LEVELS).toEqual(['low', 'medium', 'high']);
  });

  it('golden levels increase phase spine depth 4 → 7 → 13', () => {
    const counts = GOLDEN_LEVELS.map((l) => buildIr(inputForLevel(l)).phases.length);
    expect(counts).toEqual([4, 7, 13]);
  });
});
