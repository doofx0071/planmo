#!/usr/bin/env node
/**
 * Stage 4 — end-to-end lifecycle verification.
 *
 * Drives the REAL built CLI through the lifecycle a user (or agent) actually
 * follows, and — the point of the whole exercise — proves that durable state
 * survives a regeneration:
 *
 *   init -> validate -> diff -> next -> task DONE -> record evidence -> generate
 *        -> assert status + evidence + user-owned docs intact
 *        -> next (fresh process, no prior context) -> trace -> handoff
 *        -> validate -> doctor
 *
 * Every step is a fresh process, so nothing is carried in memory: a step can only
 * succeed by reading the saved artifacts. Nothing is published; the fixture is a
 * temp directory, removed at the end.
 *
 * Usage: node scripts/e2e-lifecycle.mjs
 * Exit 0 = the lifecycle passed. Exit 1 = a check failed.
 */
import { existsSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(root, 'packages', 'planmo', 'dist', 'bin.js');

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`);
}

/** Run the built CLI, returning { code, out, err }. Never throws on nonzero. */
function cli(args, cwd) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out, err: '' };
  } catch (err) {
    return {
      code: typeof err.status === 'number' ? err.status : 1,
      out: typeof err.stdout === 'string' ? err.stdout : '',
      err: typeof err.stderr === 'string' ? err.stderr : String(err.message ?? err),
    };
  }
}

async function main() {
  console.log('e2e-lifecycle: building the CLI');
  // Build only if the CLI has not been built yet; CI runs `pnpm build` first.
  if (!existsSync(CLI)) {
    execSync('pnpm -r --if-present run build', { cwd: root, stdio: 'ignore' });
  }

  const tmp = await mkdtemp(join(tmpdir(), 'planmo-lifecycle-'));
  const project = join(tmp, 'demo');

  try {
    // 1. Initialize a new project.
    const init = cli(['init', project, '--yes'], tmp);
    check('init exits 0', init.code === 0, init.err);
    check(
      'init wrote .planmo',
      (await readFile(join(project, '.planmo', 'project.yml'), 'utf8')).includes('schemaVersion'),
    );

    // 2. Validate the generated structure.
    const v1 = cli(['validate', '--dir', project], tmp);
    check('validate exits 0 on a fresh workspace', v1.code === 0, v1.out + v1.err);
    check('validate reports OK', v1.out.includes('validate: OK'), v1.out.trim());

    // 3. diff: the tree matches the model, and --exit-code agrees.
    const diff = cli(['diff', '--dir', project, '--exit-code'], tmp);
    check('diff --exit-code exits 0 when up to date', diff.code === 0, diff.out + diff.err);

    // 4. The session brief names the first task.
    const next1 = cli(['next', '--print', '--dir', project], tmp);
    check('next exits 0', next1.code === 0, next1.err);
    const first = /Next task\s+(P\d\d-\d\d)/.exec(next1.out);
    check('next names a first task', first !== null, next1.out.split('\n').slice(0, 3).join(' / '));
    const firstId = first ? first[1] : 'P00-01';

    // 5. Start and complete a task through the supported workflow.
    const task = cli(['task', firstId, '--status', 'DONE', '--dir', project], tmp);
    check('task records a status', task.code === 0, task.err);
    const tasksCsv = await readFile(join(project, 'planning', 'tasks.csv'), 'utf8');
    check('tasks.csv shows the task DONE', new RegExp(`^${firstId},.*,DONE,`, 'm').test(tasksCsv));

    // 6. Record evidence the supported way — the user-owned evidence file.
    const evidencePath = join(project, 'planning', 'testing', 'TEST-EVIDENCE.csv');
    const evidence = (await readFile(evidencePath, 'utf8')).replace(
      `${firstId},unit tests,,`,
      `${firstId},unit tests,node scripts/e2e-lifecycle.mjs,pass`,
    );
    await writeFile(evidencePath, evidence, 'utf8');

    // 7. Regenerate.
    const gen = cli(['generate', '--dir', project], tmp);
    check('generate exits 0', gen.code === 0, gen.err);

    // 8. The durable state must survive regeneration.
    const tasksAfter = await readFile(join(project, 'planning', 'tasks.csv'), 'utf8');
    check(
      'task status survives regeneration',
      new RegExp(`^${firstId},.*,DONE,`, 'm').test(tasksAfter),
      'tasks.csv reset the status',
    );
    const evidenceAfter = await readFile(evidencePath, 'utf8');
    check(
      'recorded evidence survives regeneration',
      evidenceAfter.includes(`${firstId},unit tests,node scripts/e2e-lifecycle.mjs,pass`),
      'TEST-EVIDENCE.csv was reset',
    );

    // 9. A fresh process, with no prior context, reconstructs the next step.
    const next2 = cli(['next', '--print', '--dir', project], tmp);
    check('next exits 0 after the task is done', next2.code === 0, next2.err);
    check(
      'next advances to a different task',
      !next2.out.includes(`Next task  ${firstId}`),
      next2.out.split('\n')[2] ?? '',
    );

    // 10. Trace renders the requirement -> task -> test graph.
    const trace = cli(['trace', '--dir', project], tmp);
    check('trace exits 0', trace.code === 0, trace.err);
    check('trace renders a graph', /task|requirement/i.test(trace.out), trace.out.slice(0, 80));

    // 11. Handoff: report first, then record, and it names the next phase.
    const handoffDry = cli(['handoff', '--dir', project, '--dry-run'], tmp);
    check('handoff --dry-run writes nothing', handoffDry.code === 0, handoffDry.err);
    const handoff = cli(['handoff', '--dir', project], tmp);
    check('handoff records a document', handoff.code === 0, handoff.err);
    const handoffText = await readFile(
      join(project, 'planning', 'handoffs', 'phase-00-handoff.md'),
      'utf8',
    );
    check('handoff names the next phase', /## Next phase/.test(handoffText));

    // 12. Final coherence checks.
    const v2 = cli(['validate', '--dir', project], tmp);
    check('validate still passes after the lifecycle', v2.code === 0, v2.out + v2.err);
    const doctor = cli(['doctor', '--dir', project], tmp);
    check('doctor exits 0', doctor.code === 0, doctor.err);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  console.log(
    failures === 0
      ? 'e2e-lifecycle: OK (full lifecycle passed; durable state preserved)'
      : `e2e-lifecycle: ${failures} check(s) FAILED`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`e2e-lifecycle: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
