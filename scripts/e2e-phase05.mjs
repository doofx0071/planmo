import {
  buildIr,
  mediumAssuranceInput,
  compileWorkspace,
} from '../packages/generator/dist/index.js';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = await mkdtemp(join(tmpdir(), 'planmo-e2e-'));
await mkdir(join(root, '.planmo'), { recursive: true });
const ir = buildIr(mediumAssuranceInput());

// Gen 1
const first = await compileWorkspace(ir, { root });
console.log(
  'GEN1 written:',
  first.written.length,
  '| collisions:',
  first.collisions.length,
  '| safe:',
  first.preview.safe,
  '| diff bytes:',
  first.diff.length,
);
const manifest1 = await readFile(join(root, '.planmo/manifest.json'), 'utf8');
const m1 = JSON.parse(manifest1);
console.log(
  'MANIFEST schemaVersion:',
  m1.schemaVersion,
  '| revision:',
  m1.revision,
  '| entries:',
  m1.entries.length,
  '| sample ownership:',
  m1.entries[0].ownershipMode,
  '| lineage input marker:',
  m1.entries[0].sources.some((s) => s.startsWith('input:')),
);

// Gen 2 — same inputs
const second = await compileWorkspace(ir, { root, allowOverwrite: true });
const manifest2 = await readFile(join(root, '.planmo/manifest.json'), 'utf8');
console.log(
  'GEN2 written:',
  second.written.length,
  '| diff bytes:',
  second.diff.length,
  '| manifest identical:',
  manifest1 === manifest2,
);
