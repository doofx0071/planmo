/**
 * End-to-end: the REAL built CLI must produce the planning workspace.
 * Run after `pnpm -r build` from the repo root.
 *
 * The unit tests drive `run()` in-process; this drives the published entry
 * point (`packages/planmo/dist/bin.js`) exactly as a user would, so a broken
 * build or a missing export cannot hide behind the test runner.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  ['planning', 'MASTER-PLAN.md'],
  ['planning', 'DECISIONS.md'],
  ['planning', 'OPEN-QUESTIONS.md'],
  ['planning', 'RISKS.md'],
  ['planning', 'REQUIREMENTS-TRACEABILITY.md'],
  ['planning', 'tasks.csv'],
  ['planning', 'architecture', 'ARCHITECTURE.md'],
  ['planning', 'architecture', 'DOMAIN-MODEL.md'],
  ['planning', 'architecture', 'SECURITY-PRIVACY.md'],
  ['planning', 'architecture', 'STATE-MACHINES.md'],
  ['planning', 'compliance', 'POLICY-REGISTER.md'],
  ['planning', 'design', 'DESIGN-BRIEF.md'],
  ['planning', 'design', 'DESIGN-SYSTEM.md'],
  ['planning', 'prompts', 'README.md'],
  ['planning', 'prompts', 'phase-prompt.md'],
  ['planning', 'requirements', 'PRODUCT-REQUIREMENTS.md'],
  ['planning', 'testing', 'TEST-STRATEGY.md'],
]) {
  check(`init writes ${rel.join('/')}`, existsSync(join(target, ...rel)));
}

const manifest = JSON.parse(readFileSync(join(target, '.planmo', 'manifest.json'), 'utf8'));
check(
  'manifest records 31 generated entries',
  manifest.entries.length === 31,
  `${manifest.entries.length}`,
);

check('status is HEALTHY', run(['status', '--dir', target]).stdout.includes('HEALTHY'));

const again = run(['generate', '--dir', target]);
check('regenerate without --force exits 0', again.status === 0, `exit ${again.status}`);
check('regenerate reports no collision', !again.stderr.includes('collision'), again.stderr.trim());

// Seeded documents belong to the user after first creation: editing one and
// regenerating must not lose the edit.
const decisions = join(target, 'planning', 'DECISIONS.md');
const edited = '# Decision Log\n\n## D-100 — a decision the user recorded\n';
writeFileSync(decisions, edited);
const afterEdit = run(['generate', '--dir', target]);
check('regenerate after a user edit exits 0', afterEdit.status === 0, `exit ${afterEdit.status}`);
check(
  'user-edited seeded document survives regeneration',
  readFileSync(decisions, 'utf8') === edited,
);
check(
  'generated documents are still refreshed',
  readFileSync(join(target, 'planning', 'MASTER-PLAN.md'), 'utf8').includes('# Master Plan'),
);

// The canonical identifier scheme holds end to end (docs/02-architecture/identifier-scheme.md).
const csv = readFileSync(join(target, 'planning', 'tasks.csv'), 'utf8')
  .trimEnd()
  .split('\n');
check(
  'tasks.csv has a header plus four tasks per phase',
  csv.length === 7 * 4 + 1,
  `${csv.length}`,
);
check(
  'every task id is P<NN>-<NN>',
  csv.slice(1).every((line) => /^P\d{2}-\d{2},/.test(line)),
);
check(
  'every task id phase matches its phase column',
  csv.slice(1).every((line) => {
    const [id, phase] = line.split(',');
    return id.slice(1, 3) === phase;
  }),
);
check(
  'a phase document lists its tasks',
  readFileSync(join(target, 'planning', 'phases', 'phase-03.md'), 'utf8').includes('| P03-01 |'),
);
check(
  'the tracker names the phase task range',
  readFileSync(join(target, 'planning', 'TRACKER.md'), 'utf8').includes('P03-01–P03-04 (4)'),
);

const dry = run(['generate', '--dir', target, '--dry-run']);
check('generate --dry-run exits 0', dry.status === 0, `exit ${dry.status}`);

const forced = run(['generate', '--dir', target, '--force']);
check('generate --force exits 0', forced.status === 0, `exit ${forced.status}`);

check(
  'generate without a workspace exits 3',
  run(['generate', '--dir', join(base, 'empty')]).status === 3,
);

check('help documents the generate command', run(['--help']).stdout.includes('generate'));

// validate — the CI gate. A generated workspace must pass its own validator.
const validated = run(['validate', '--dir', target]);
check(
  'validate exits 0 on a generated workspace',
  validated.status === 0,
  `exit ${validated.status}`,
);
check('validate reports OK', validated.stdout.includes('validate: OK'), validated.stderr.trim());
check(
  'validate exits 3 without a workspace',
  run(['validate', '--dir', join(base, 'empty')]).status === 3,
);
check('help documents the validate command', run(['--help']).stdout.includes('validate'));

// next — the session brief that the command file PlanMo installs into every
// agent tells the agent to run. If this breaks, that instruction is a lie.
const brief = run(['next', '--print', '--dir', target]);
check('next exits 0 on a generated workspace', brief.status === 0, `exit ${brief.status}`);
check('next names the first task', brief.stdout.includes('P00-01'));
check(
  'next names the phase document to read',
  brief.stdout.includes('planning/phases/phase-00.md'),
);
check('next reports progress', /Progress\s+0 of \d+ tasks done/.test(brief.stdout));
check('next tells the agent to validate when done', brief.stdout.includes('planmo validate'));
check('next exits 3 without a workspace', run(['next', '--dir', join(base, 'empty')]).status === 3);
check('help documents the next command', run(['--help']).stdout.includes('planmo next'));

const asJson = run(['next', '--json', '--dir', target]);
let parsedBrief;
try {
  parsedBrief = JSON.parse(asJson.stdout);
} catch {
  parsedBrief = undefined;
}
check('next --json emits parseable JSON', parsedBrief?.task?.id === 'P00-01');
check('next --json reports the phase', parsedBrief?.phase === '00');

// trace / handoff / pack — the engines that were unwired.
const empty = join(base, 'empty');

const trace = run(['trace', '--dir', target]);
check('trace exits 0', trace.status === 0, `exit ${trace.status}`);
check('trace renders the trace graph', trace.stdout.includes('TRACE REPORT'));
check('trace exits 3 without a workspace', run(['trace', '--dir', empty]).status === 3);

const handoffFile = join(target, 'planning', 'handoffs', 'phase-00-handoff.md');
const handoffDry = run(['handoff', '--dir', target, '--dry-run']);
check('handoff --dry-run prints the document', handoffDry.stdout.includes('# Phase 00 Handoff'));
check('handoff --dry-run writes nothing', handoffDry.status === 0 && !existsSync(handoffFile));

const handoff = run(['handoff', '--dir', target]);
check('handoff writes the phase document', handoff.status === 0 && existsSync(handoffFile));
check('handoff reports the next phase', handoff.stdout.includes('next phase 01'));
check('handoff exits 3 without a workspace', run(['handoff', '--dir', empty]).status === 3);
// A handoff is user-owned: a second run must refuse rather than overwrite it.
const handoffAgain = run(['handoff', '--dir', target]);
check(
  'handoff refuses to overwrite a user-owned handoff',
  handoffAgain.status === 2,
  `exit ${handoffAgain.status}`,
);

const pack = run(['pack', '--dir', target]);
check('pack exits 0 with no catalog source', pack.status === 0, `exit ${pack.status}`);
check(
  'pack states the missing catalog honestly',
  pack.stdout.includes('No pack catalog source is configured'),
);
check('pack exits 3 without a workspace', run(['pack', '--dir', empty]).status === 3);

check('help documents trace', run(['--help']).stdout.includes('planmo trace'));
check('help documents handoff', run(['--help']).stdout.includes('planmo handoff'));
check('help documents pack', run(['--help']).stdout.includes('planmo pack'));
check('help documents plan', run(['--help']).stdout.includes('planmo plan'));

// ---------------------------------------------------------------- plan
// The AI planning engine, exercised offline with the mock provider: no network, no
// credential. The point of this block is that the plan document, once recorded, is
// what `generate` compiles from — so the whole loop is checked, not just the write.
{
  const planFile = join(target, '.planmo', 'plan.yml');
  check('plan refuses to run without an idea', run(['plan', '--dir', target]).status === 1);

  // The dry run comes first, while no plan exists yet, so it exercises the happy
  // path. (After a plan exists it would report a collision — the same contract as
  // `generate --dry-run`, which is checked by the collision case below.)
  const dry = run(['plan', 'Build a demo', '--dir', target, '--provider', 'mock', '--dry-run']);
  check('plan --dry-run exits 0', dry.status === 0, `exit ${dry.status}`);
  check('plan --dry-run writes nothing', !existsSync(planFile));

  const planned = run(['plan', 'Build a demo', '--dir', target, '--provider', 'mock']);
  check('plan exits 0 with the mock provider', planned.status === 0, `exit ${planned.status}`);
  check('plan states that its output is simulated', planned.stderr.includes('simulated'));
  check('plan reports real counts', /phases: \d+\s+tasks: \d+/.test(planned.stdout));
  check('plan writes .planmo/plan.yml', existsSync(planFile));
  check(
    'plan names its author in the document',
    readFileSync(planFile, 'utf8').includes('provider:'),
  );

  // A plan you own is a collision, not a silent overwrite.
  const again = run(['plan', 'Build a demo', '--dir', target, '--provider', 'mock']);
  check('plan refuses to overwrite a plan you own', again.status === 2, `exit ${again.status}`);

  // The recorded plan is what generation compiles from.
  const regenerated = run(['generate', '--dir', target, '--force']);
  check('generate compiles from the plan', regenerated.status === 0, `exit ${regenerated.status}`);
  const csv = readFileSync(join(target, 'planning', 'tasks.csv'), 'utf8');
  check('tasks.csv carries the plan\u2019s task, not the seed', csv.includes('mock provider'));

  // And the whole workspace still validates with a plan in play.
  const validated = run(['validate', '--dir', target]);
  check(
    'a plan-driven workspace validates clean',
    validated.status === 0 && validated.stdout.includes('validate: OK'),
    `exit ${validated.status}`,
  );

  // `next` — the command agents consume — must see the plan's task.
  const brief = run(['next', '--dir', target]);
  check('next reports the plan\u2019s task', brief.stdout.includes('mock provider'));
}

console.log(
  `\nCLI generate E2E: ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURE(S)`}`,
);
process.exit(failures === 0 ? 0 : 1);
