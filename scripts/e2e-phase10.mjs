/**
 * Phase 10 E2E proof — run: node scripts/e2e-phase10.mjs (from repo root,
 * after `pnpm --filter @planmo/scanner build`).
 *
 * Proves the existing-repository adoption engine end-to-end:
 *  - path-safety primitives (traversal, symlink escape analysis)
 *  - safe scan of a REAL untrusted brownfield tree (fixtures)
 *  - evidence-backed detection (stack/test/CI) over that tree
 *  - prompt-injection isolation on the poisoning fixture tree
 *  - adopt dry-run planning (never writes, rewritesApplicationCode=false)
 *  - standards discovery precedence
 */
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { readFileSync } from 'node:fs';

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
};

const s = await import('../packages/scanner/dist/index.js');
const {
  nodeFileReader,
  analyzeRepository,
  safeScanner,
  isSafeRelativePath,
  linkEscapes,
  constructorReader,
  standardsDiscovery,
  policy,
  promptIsolation,
  brownfieldDescription,
} = s;

const here = dirname(fileURLToPath(import.meta.url));
const brownfieldRoot = resolve(here, '../packages/scanner/src/fixtures/trees/brownfield');
const poisoningRoot = resolve(here, '../packages/scanner/src/fixtures/trees/poisoning');

// 1. Path-safety primitives (pure).
check('path: rejects ../ traversal', !isSafeRelativePath('../etc/passwd'));
check('path: rejects nested ../', !isSafeRelativePath('src/../../out'));
check('path: rejects absolute', !isSafeRelativePath('/etc/passwd'));
check('path: rejects windows drive', !isSafeRelativePath('C:/Windows/System32'));
check('path: rejects backslash', !isSafeRelativePath('src\\..\\evil'));
check('path: rejects NUL', !isSafeRelativePath('a\x00b'));
check('path: rejects empty', !isSafeRelativePath(''));
check('path: accepts normal', isSafeRelativePath('src/index.ts'));
check('link: escape ../../', linkEscapes('src/lib', '../../../etc/passwd'));
check('link: escape absolute', linkEscapes('', '/etc/passwd'));
check('link: escape windows drive', linkEscapes('', 'C:\\secret'));
check('link: safe relative', !linkEscapes('', 'lib/x'));
check('link: safe child', !linkEscapes('src', '../src/lib/x'));

// 2. Safe scan of the REAL brownfield fixture tree.
const scan = await safeScanner().scan(brownfieldRoot, nodeFileReader());
check('scan: found fixture files', scan.entries.length >= 15);
check('scan: all paths safe', scan.entries.every((f) => isSafeRelativePath(f.path)));
check(
  'scan: deterministic order',
  scan.entries.every((f, i) => i === 0 || scan.entries[i - 1].path < f.path),
);

// 3. Full pipeline on brownfield (real fs).
const brownfield = await analyzeRepository(brownfieldRoot, nodeFileReader());
const stackNames = brownfield.detection.stacks.map((x) => x.id);
check('detect: node stack (manifest evidence)', stackNames.includes('node'));
check('detect: typescript stack', stackNames.includes('typescript'));
check(
  'detect: github-actions CI declared',
  brownfield.detection.ciSystems.includes('github-actions'),
);
check('detect: evidence paths present', brownfield.detection.stacks.every((x) => x.evidence.length >= 1));
if (!brownfield.detection.stacks.every((x) => x.evidence.length >= 1)) {
  console.log('     stacks:', JSON.stringify(brownfield.detection.stacks));
}
check('adopt: dry-run, never rewrites', brownfield.report.rewritesApplicationCode === false);
check(
  'adopt: changes confined to .planmo/adopt/',
  brownfield.report.changes.every((c) => c.path.startsWith('.planmo/adopt/')),
);
check(
  'adopt: report markdown has stable headings',
  brownfield.report.reportMarkdown.includes('# PlanMo adoption plan') &&
    brownfield.report.reportMarkdown.includes('## Scan summary') &&
    brownfield.report.reportMarkdown.includes('## Detection summary') &&
    brownfield.report.reportMarkdown.includes('## Injection summary'),
);
check('adopt: benign fixture repo has no poisoned files', brownfield.report.injectionSummary.poisoned === 0);

// 4. Poisoning fixture tree: prompt-injection isolation.
const poisoned = await analyzeRepository(poisoningRoot, nodeFileReader());
check(
  'inject: poisoned file detected',
  poisoned.report.injectionSummary.poisoned >= 1,
);
check('inject: policy immutable', promptIsolation.policyIsImmutable === true);
const doc = policy();
check('inject: policy document non-empty', doc.markerPhrases.length >= 5 && doc.rules.length >= 1);
const poisonedFiles = poisoned.injections.filter((i) => i.classification === 'poisoned').map((i) => i.path);
console.log(`     poisoned files: ${poisonedFiles.join(', ')}`);
check(
  'inject: authority-override + comment-injection files flagged',
  poisonedFiles.includes('AGENTS.instructions.md') && poisonedFiles.includes('src/comment.ts'),
);
check('inject: benign README stays benign', poisoned.injections.some((i) => i.path === 'README.md' && i.classification === 'benign'));
check('fixture: brownfield description declared', typeof brownfieldDescription === 'string' && brownfieldDescription.length > 10);

// 5. Standards discovery precedence (pure paths, no fs).
const standards = await standardsDiscovery.discover([
  'README.md',
  'CLAUDE.md',
  'apps/x/AGENTS.md',
  'AGENTS.md',
]);
check('standards: root AGENTS.md wins', standards.policyDocs[0].path === 'AGENTS.md');
check(
  'standards: nested AGENTS.md ranks below root',
  standards.policyDocs.map((d) => d.path).indexOf('apps/x/AGENTS.md') > 0,
);
check('standards: README is informational', standards.informationalDocs.some((d) => d.path === 'README.md'));

// 6. Fail-closed symlink handling with the virtual reader.
const symlinkTree = {
  'a.txt': 'x',
  'abs-link': { type: 'symlink' },
  'esc-link': { type: 'symlink' },
  'safe-link': { type: 'symlink' },
};
const withTargets = constructorReader(symlinkTree, {
  symlinks: new Map([
    ['abs-link', '/etc/passwd'],
    ['esc-link', '../../out'],
    ['safe-link', 'a.txt'],
  ]),
});
const withTargetsScan = await safeScanner().scan('', withTargets);
check(
  'scan: escaping symlinks refused by default (SCN-003)',
  withTargetsScan.warnings.filter((w) => w.code === 'SCN-003').length === 2 &&
    withTargetsScan.entries.some((e) => e.path === 'safe-link'),
);
// A reader WITHOUT the linkTarget capability cannot verify any symlink —
// fails CLOSED with SCN-003 instead of assuming safe.
const blindReader = {
  readDir: async () => ['a.txt', 'link'],
  readFile: async (p) => {
    if (p.endsWith('a.txt')) return 'x';
    throw new Error('closed');
  },
  stat: async (p) =>
    p.endsWith('link') ? { type: 'symlink', size: 0 } : { type: 'file', size: 1 },
  exists: async () => true,
};
const blindScan = await safeScanner().scan('', blindReader);
check(
  'scan: unverifiable symlink fails closed (SCN-003)',
  blindScan.warnings.some((w) => w.code === 'SCN-003' && w.message.includes('cannot be verified')),
);

console.log('');
console.log(failures === 0 ? 'E2E PHASE 10: ALL CHECKS PASSED' : `E2E PHASE 10: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);