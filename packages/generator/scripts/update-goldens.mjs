import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIr } from '../dist/ir.js';
import { renderPlanningDocuments } from '../dist/render.js';
import { renderPlanWorkspace } from '../dist/plan-workspace.js';
import { renderStandardsAndContext } from '../dist/standards-context.js';
import { GOLDEN_LEVELS, inputForLevel } from '../dist/fixtures.js';

/**
 * Regenerate the committed golden snapshots from the REAL pipeline
 * (P05-04). Run via `pnpm --filter @planmo/generator exec node
 * scripts/update-goldens.mjs` after building. The golden test then
 * byte-compares renderer output against these committed files, so a
 * renderer regression fails the suite instead of silently updating goldens.
 */

const here = dirname(fileURLToPath(import.meta.url));
const goldenRoot = join(here, '..', 'src', 'golden');

for (const level of GOLDEN_LEVELS) {
  const ir = buildIr(inputForLevel(level));
  const artifacts = [
    ...renderPlanningDocuments(ir),
    ...renderStandardsAndContext(ir),
    ...renderPlanWorkspace(ir),
  ];
  const outDir = join(goldenRoot, level);
  await mkdir(outDir, { recursive: true });
  for (const artifact of artifacts) {
    const target = join(outDir, artifact.path.replaceAll('/', '_'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, artifact.content, 'utf8');
  }
  console.log(`golden-${level}: ${artifacts.length} artifacts`);
}
console.log('goldens regenerated');
