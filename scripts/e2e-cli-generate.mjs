/**
 * End-to-end: the REAL built CLI must produce the planning workspace.
 * Run after `pnpm -r build` from the repo root.
 *
 * The unit tests drive `run()` in-process; this drives the published entry
 * point (`packages/planmo/dist/bin.js`) exactly as a user would, so a broken
 * build or a missing export cannot hide behind the test runner.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../packages/planmo/dist/bin.js', import.meta.url));
const base = mkdtempSync(join(tmpdir(), 'planmo-cli-gen-'));
const target = join(base, 'demo');
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const init = run(['init', target, '--yes']);
check('init exits 0', init.status === 0, `exit ${init.status}`);

for (const rel of [
  ['.planmo', 'project.yml'],
  ['.planmo', 'state.yml'],
  ['.planmo', 'manifest.json'],
  ['planning', 'ROADMAP.md'],
  ['planning', 'TRACKER.md'],
  ['planning', 'STANDARDS.md'],
  ['planning', 'CONTEXT.md'],
  ['planning', 'handoffs', 'TEMPLATE.md'],
  ['planning', 'phases', 'phase-00.md'],
  ['planning', 'phases', 'phase-06.md'],
]) {
  check(`init writes ${rel.join('/')}`, existsSync(join(target, ...rel)));
}

const manifest = JSON.parse(readFileSync(join(target, '.planmo', 'manifest.json'), 'utf8'));
check(
  'manifest records 12 generated entries',
  manifest.entries.length === 12,
  `${manifest.entries.length}`,
);

check('status is HEALTHY', run(['status', '--dir', target]).stdout.includes('HEALTHY'));

const again = run(['generate', '--dir', target]);
check('regenerate without --force exits 0', again.status === 0, `exit ${again.status}`);
check('regenerate reports no collision', !again.stderr.includes('collision'), again.stderr.trim());

const dry = run(['generate', '--dir', target, '--dry-run']);
check('generate --dry-run exits 0', dry.status === 0, `exit ${dry.status}`);

const forced = run(['generate', '--dir', target, '--force']);
check('generate --force exits 0', forced.status === 0, `exit ${forced.status}`);

check(
  'generate without a workspace exits 3',
  run(['generate', '--dir', join(base, 'empty')]).status === 3,
);

check('help documents the generate command', run(['--help']).stdout.includes('generate'));

console.log(
  `\nCLI generate E2E: ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURE(S)`}`,
);
process.exit(failures === 0 ? 0 : 1);
