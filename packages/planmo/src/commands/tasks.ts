import { stdin as nodeStdin, stdout as nodeStdout } from 'node:process';
import { resolve } from 'node:path';
import { TASK_STATUSES } from '@planmo/schema';
import { ProjectNotFoundError } from '@planmo/core';
import { parseArgs, type CliIO, type WizardIO } from '../cli-io.js';
import { cliVersion } from '../version.js';
import { readTaskRows, recordTaskStatus, renderTaskOutcome } from '../task.js';
import { buildHandoff } from '../handoff.js';
import { packReport, renderPackReport } from '../pack.js';
import { traceWorkspace } from '../trace.js';
import { nextBrief } from '../next.js';

/**
 * The working loop: what to do next, a task's durable status, and the records
 * around it — `next`, `task`, `trace`, `handoff` and `pack`.
 */
export async function runNext(argv: string[], io: CliIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const root = resolve(flags.get('dir') ?? positional[0] ?? process.cwd());
  try {
    const result = await nextBrief({ root });
    // `--print` is the documented default: print the brief, write nothing. The
    // flag exists because the command file PlanMo installs into every agent
    // passes it, so the instruction in that file is literally true.
    if (flags.has('json')) io.out(JSON.stringify(result.brief, null, 2));
    else io.out(result.text);
    return 0;
  } catch (err) {
    io.err(`planmo next: ${(err as Error).message}`);
    // 3 = there is no workspace here at all. 1 = a workspace that exists but is
    // not ready to be read (the planning tree was never generated).
    return err instanceof ProjectNotFoundError ? 3 : 1;
  }
}

export async function runTrace(argv: string[], io: CliIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const root = resolve(flags.get('dir') ?? process.cwd());
  const id = flags.get('id') ?? positional[0];
  try {
    const outcome = await traceWorkspace({ root, ...(id !== undefined ? { id } : {}) });
    // The trace engine renders the whole graph and offers no subgraph filtering,
    // so a focus id never narrows the output. Say so rather than implying it did.
    if (outcome.focusNote !== null) io.out(outcome.focusNote);
    io.out(outcome.text);
    return 0;
  } catch (err) {
    io.err(`planmo trace: ${(err as Error).message}`);
    return err instanceof ProjectNotFoundError ? 3 : 1;
  }
}

export async function runHandoff(argv: string[], io: CliIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const root = resolve(flags.get('dir') ?? positional[0] ?? process.cwd());
  const dryRun = flags.has('dry-run');
  try {
    const outcome = await buildHandoff({
      root,
      planmoVersion: cliVersion(),
      ...(dryRun ? { dryRun: true } : {}),
      ...(flags.has('force') ? { allowOverwrite: true } : {}),
    });
    for (const p of outcome.written) {
      io.out(`${dryRun ? '[dry-run] would write' : '✓ wrote'} ${p}`);
    }
    for (const c of outcome.collisions) {
      io.err(`✗ collision  ${c} (existing, refused — use --force to overwrite)`);
    }
    if (dryRun) io.out(outcome.text);
    // `missingForResume` is the engine's own answer to "is this handoff enough to
    // resume from?". It is legitimate information, not a failure: a phase with no
    // completed tasks yet genuinely cannot be resumed from, and that is the normal
    // state early in a phase. So it is a warning — the write still succeeded, and
    // exiting non-zero for work that happened would be a false failure. Only a
    // refused write (a file the user owns) is an error.
    if (outcome.missingForResume.length > 0) {
      io.err('handoff: warning — this handoff would not resume cleanly:');
      for (const missing of outcome.missingForResume) io.err(`  missing: ${missing}`);
    }
    if (outcome.collisions.length > 0) return 2;
    io.out(`handoff: OK — phase ${outcome.phase} recorded, next phase ${outcome.nextPhase}`);
    return 0;
  } catch (err) {
    io.err(`planmo handoff: ${(err as Error).message}`);
    return err instanceof ProjectNotFoundError ? 3 : 1;
  }
}

export async function runPack(argv: string[], io: CliIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const root = resolve(flags.get('dir') ?? positional[0] ?? process.cwd());
  const source = flags.get('source');
  try {
    const outcome = await packReport({
      root,
      planmoVersion: cliVersion(),
      ...(source !== undefined ? { source } : {}),
      ...(flags.has('dry-run') ? { dryRun: true } : {}),
    });
    io.out(renderPackReport(outcome));
    // Nothing resolved is a failure worth signalling: the project asked for packs
    // and the run could not place them.
    return outcome.resolution.ok ? 0 : 1;
  } catch (err) {
    io.err(`planmo pack: ${(err as Error).message}`);
    return err instanceof ProjectNotFoundError ? 3 : 1;
  }
}

export async function runTask(argv: string[], io: CliIO, wizard: WizardIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  // The positional argument is the TASK ID, not a directory — the root comes from
  // --dir or the working directory.
  const root = resolve(flags.get('dir') ?? process.cwd());
  try {
    const rows = await readTaskRows(root);
    let id = positional[0];

    // Interactive-first: with no id, choose from the tasks that are not done.
    // Without a terminal there is nobody to prompt, so fail with usage instead of
    // hanging on a prompt that can never be answered (the guard `agent` uses).
    const interactive = nodeStdin.isTTY === true && nodeStdout.isTTY === true;
    if (id === undefined) {
      const open = rows.filter((row) => row.status !== 'DONE');
      if (open.length === 0) {
        io.out('Every task is DONE.');
        return 0;
      }
      if (!interactive) {
        io.err('planmo task: a task id is required when not running interactively');
        io.err('  usage: planmo task <id> --status <value> [--dir <path>]');
        return 1;
      }
      const picked = await wizard.select(
        'Which task?',
        open.map((row) => ({
          value: row.id,
          label: `${row.id}  ${row.status}  ${row.title}`,
        })),
      );
      if (picked === undefined) return 1;
      id = picked;
    }

    const row = rows.find((candidate) => candidate.id === id);
    let status = flags.get('status');

    if (status === undefined) {
      if (!interactive) {
        io.err('planmo task: --status is required when not running interactively');
        io.err('  usage: planmo task <id> --status <value> [--dir <path>]');
        return 1;
      }
      // DONE first and recommended: closing the task is what the loop needs, and
      // it is the overwhelmingly common case.
      const ordered = ['DONE', ...TASK_STATUSES.filter((value) => value !== 'DONE')];
      const picked = await wizard.select(
        `Status for ${id}${row === undefined ? '' : ` (currently ${row.status})`}`,
        ordered.map((value) => ({
          value,
          label: value,
          ...(value === 'DONE' ? { hint: 'recommended' } : {}),
        })),
      );
      if (picked === undefined) return 1;
      status = picked;
    }

    // Narrowed explicitly: the assignment above happens inside a nested branch, so
    // TypeScript cannot prove the value is present from the earlier check alone.
    if (status === undefined) return 1;

    const outcome = await recordTaskStatus({
      root,
      id,
      status,
      ...(flags.has('dry-run') ? { dryRun: true } : {}),
    });
    io.out(renderTaskOutcome(outcome));
    if (flags.has('dry-run') && !outcome.unchanged) {
      io.out('[dry-run] nothing was written.');
    } else if (!outcome.unchanged) {
      io.out('Recorded in .planmo/state.yml — regeneration preserves it.');
    }
    return 0;
  } catch (err) {
    io.err(`planmo task: ${(err as Error).message}`);
    return 1;
  }
}
