/**
 * End-to-end: the REAL built CLI installs agent command files.
 * Run after `pnpm -r build` from the repo root.
 *
 * Drives `packages/planmo/dist/bin.js` exactly as a user would, so a broken
 * build or a missing export cannot hide behind the test runner.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../packages/planmo/dist/bin.js', import.meta.url));
const base = mkdtempSync(join(tmpdir(), 'planmo-cli-agent-'));
const target = join(base, 'demo');
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

check('init exits 0', run(['init', target, '--yes']).status === 0);

const list = run(['agent', 'list']);
check('agent list exits 0', list.status === 0, `exit ${list.status}`);
check(
  'agent list names every supported agent',
  ['opencode', 'claude-code', 'codex', 'copilot', 'generic'].every((id) =>
    list.stdout.includes(id),
  ),
);

// opencode: flat markdown commands.
const opencode = run(['agent', 'init', '--dir', target, '--agent', 'opencode']);
check('agent init opencode exits 0', opencode.status === 0, `exit ${opencode.status}`);
for (const name of ['planmo-next', 'planmo-status', 'planmo-propose']) {
  check(
    `opencode gets ${name}.md`,
    existsSync(join(target, '.opencode', 'commands', `${name}.md`)),
  );
}
check(
  'the command body tells the agent to run the CLI',
  readFileSync(join(target, '.opencode', 'commands', 'planmo-next.md'), 'utf8').includes(
    'npx planmo next --print',
  ),
);

// codex: Agent Skills layout, name must equal the directory.
const codex = run(['agent', 'init', '--dir', target, '--agent', 'codex']);
check('agent init codex exits 0', codex.status === 0, `exit ${codex.status}`);
const skill = join(target, '.agents', 'skills', 'planmo-next', 'SKILL.md');
check('codex gets <name>/SKILL.md', existsSync(skill));
check(
  'the skill name matches its directory',
  readFileSync(skill, 'utf8').includes('name: planmo-next'),
);

// Idempotent: a second run is a clean no-op.
const again = run(['agent', 'init', '--dir', target, '--agent', 'opencode']);
check('re-running agent init exits 0', again.status === 0, `exit ${again.status}`);
check('re-running agent init reports no collision', !again.stderr.includes('collision'));
check('re-running agent init writes nothing', !again.stdout.includes('✓ wrote'));

// A user edit is theirs.
const edited = join(target, '.opencode', 'commands', 'planmo-next.md');
writeFileSync(edited, 'my own command\n');
const afterEdit = run(['agent', 'init', '--dir', target, '--agent', 'opencode']);
check('a user-edited command is a collision', afterEdit.stderr.includes('collision'));
check('the user edit survives', readFileSync(edited, 'utf8') === 'my own command\n');

// Refusals.
check(
  'a global agent needs --global',
  run(['agent', 'init', '--dir', target, '--agent', 'hermes']).status === 1,
);
check(
  'an unknown agent is refused',
  run(['agent', 'init', '--dir', target, '--agent', 'nope']).status === 1,
);
check(
  'agent init without a workspace exits 1',
  run(['agent', 'init', '--dir', join(base, 'empty'), '--agent', 'opencode']).status === 1,
);
check('help documents the agent command', run(['--help']).stdout.includes('agent init'));

console.log(`\nCLI agent E2E: ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
