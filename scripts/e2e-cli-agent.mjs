/**
 * End-to-end: the REAL built CLI installs agent command files.
 * Run after `pnpm -r build` from the repo root.
 *
 * Drives `packages/planmo/dist/bin.js` exactly as a user would, so a broken
 * build or a missing export cannot hide behind the test runner.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

// Detection: with no --agent and no terminal, PlanMo decides from the project.
const detected = join(base, 'detected');
check('init exits 0 (detected project)', run(['init', detected, '--yes']).status === 0);
mkdirSync(join(detected, '.claude'), { recursive: true });
const auto = run(['agent', 'init', '--dir', detected]);
check('detection installs without --agent', auto.status === 0, `exit ${auto.status}`);
check('detection says what it found', auto.stdout.includes('Detected claude-code'));
check(
  "detection writes the detected agent's tree",
  existsSync(join(detected, '.claude', 'skills', 'planmo-next', 'SKILL.md')),
);
check(
  'nothing detected and no flag is an error, not a guess',
  run(['agent', 'init', '--dir', join(base, 'no-markers')]).status === 1,
);

const list = run(['agent', 'list']);
check('agent list exits 0', list.status === 0, `exit ${list.status}`);
check(
  'agent list names every supported agent',
  [
    'opencode',
    'claude-code',
    'codex',
    'commandcode',
    'copilot',
    'cursor',
    'gemini-cli',
    'kimi',
    'grok',
    'kiro',
    'kilo-code',
    'windsurf',
    'cline',
    'roo-code',
    'qwen-code',
    'junie',
    'trae',
    'augment',
    'tabnine',
    'zed',
    'amazon-q',
    'openhands',
    'amp',
    'goose',
    'continue',
    'codebuddy',
    'iflow',
    'factory-droid',
    'crush',
    'hermes',
    'generic',
  ].every((id) => list.stdout.includes(id)),
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

// Gemini CLI commands are TOML, not markdown.
const gemini = run(['agent', 'init', '--dir', target, '--agent', 'gemini-cli']);
check('agent init gemini-cli exits 0', gemini.status === 0, `exit ${gemini.status}`);
const toml = join(target, '.gemini', 'commands', 'planmo-next.toml');
check('gemini-cli gets <name>.toml', existsSync(toml));
check('the TOML declares a prompt', readFileSync(toml, 'utf8').includes("prompt = '''"));

// A skills agent that does not share the cross-client directory.
const kiro = run(['agent', 'init', '--dir', target, '--agent', 'kiro']);
check('agent init kiro exits 0', kiro.status === 0, `exit ${kiro.status}`);
check(
  'kiro gets .kiro/skills/<name>/SKILL.md',
  existsSync(join(target, '.kiro', 'skills', 'planmo-next', 'SKILL.md')),
);

// Cline keeps the extension as part of the command name.
const cline = run(['agent', 'init', '--dir', target, '--agent', 'cline']);
check(
  'cline gets .clinerules/workflows/<name>.md',
  existsSync(join(target, '.clinerules', 'workflows', 'planmo-next.md')),
);
check('cline shows the extension in the invocation', cline.stdout.includes('/planmo-next.md'));

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

// agent apply — the other half of the propose loop.
const proposalPath = join(base, 'proposal.json');
writeFileSync(
  proposalPath,
  JSON.stringify({
    schemaVersion: 1,
    agent: 'opencode',
    requestId: 'Add planmo next',
    items: [{ id: 'cli-next', summary: 'Wire the next command.' }],
  }),
);
const applied = run(['agent', 'apply', proposalPath, '--dir', target]);
check('agent apply exits 0', applied.status === 0, `exit ${applied.status}`);
check(
  'agent apply records the proposal',
  existsSync(join(target, '.planmo', 'proposals', 'add-planmo-next.json')),
);
check(
  'agent apply says plan documents were not rewritten',
  applied.stdout.includes('Plan documents were NOT rewritten'),
);
check(
  'a recorded proposal does not disturb validate',
  run(['validate', '--dir', target]).status === 0,
);

const reapplied = run(['agent', 'apply', proposalPath, '--dir', target]);
check('re-applying an unchanged proposal is refused', reapplied.status === 2);

const badProposal = join(base, 'bad-proposal.json');
writeFileSync(
  badProposal,
  JSON.stringify({
    schemaVersion: 1,
    agent: 'opencode',
    requestId: 'bad',
    items: [],
    unexpectedKey: true,
  }),
);
const rejected = run(['agent', 'apply', badProposal, '--dir', target]);
check('an invalid proposal is refused', rejected.status === 1);
check('the rejection names the offending key', rejected.stderr.includes('unexpectedKey'));
check('agent apply without a file explains itself', run(['agent', 'apply']).status === 1);
check('help documents agent apply', run(['--help']).stdout.includes('agent apply'));

console.log(`\nCLI agent E2E: ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
