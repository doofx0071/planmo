import { PRODUCT_SLUG } from '@planmo/shared';
import { cliVersion } from './version.js';
import { defaultIO, terminalWizard, type CliIO, type WizardIO } from './cli-io.js';
import { USAGE, usageFor } from './usage.js';
import {
  runInit,
  runStatus,
  runAdopt,
  runGenerate,
  runDiff,
  runValidate,
  runDoctorCommand,
} from './commands/workspace.js';
import { runNext, runTask, runTrace, runHandoff, runPack } from './commands/tasks.js';
import { runPlanCommand } from './commands/plan.js';
import { runAgent } from './commands/agent.js';

/**
 * PlanMo CLI — the real command surface (ADR-0010).
 *
 * Every command is a thin adapter: argv -> a deterministic core call ->
 * exit code. No business logic lives here; the core owns all behavior and the
 * handlers live in `./commands/*`. This module is only the router.
 */

export type { CliIO, WizardIO } from './cli-io.js';
export { USAGE, usageFor } from './usage.js';

/**
 * The options each command accepts — the same set `usage.ts` documents.
 *
 * The router rejects anything else. Flags used to be parsed into a map and
 * simply ignored when a handler never read them, which made a typo
 * (`task P00-02 --stauts DONE`) indistinguishable from a deliberate no-op: the
 * status flag was dropped, the command fell through to its interactive prompt,
 * and the intended write never happened. An option a command cannot honor is a
 * usage error, not silence.
 */
const COMMAND_FLAGS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  init: [
    'name',
    'type',
    'lifecycle',
    'risk',
    'agent',
    'style',
    'density',
    'accessibility',
    'depth',
    'phase-mode',
    'yes',
    'dry-run',
    'force',
    'dir',
  ],
  status: ['dir'],
  adopt: ['dir', 'yes', 'dry-run'],
  plan: ['idea', 'dir', 'provider', 'model', 'base-url', 'dry-run', 'force'],
  generate: ['dir', 'dry-run', 'force'],
  diff: ['dir', 'exit-code'],
  validate: ['dir'],
  doctor: ['dir'],
  next: ['dir', 'print', 'json'],
  task: ['status', 'dir', 'dry-run'],
  trace: ['dir', 'id'],
  handoff: ['dir', 'dry-run', 'force'],
  pack: ['dir', 'source', 'dry-run'],
  agent: ['agent', 'dir', 'global', 'yes', 'force', 'dry-run'],
});

/** Every `--flag` (and `--flag=value`) in `argv` that `allowed` does not list. */
function unknownFlags(argv: readonly string[], allowed: readonly string[]): string[] {
  const known = new Set(allowed);
  const unknown = new Set<string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const name = arg.slice(2).split('=')[0] ?? '';
    if (name !== '' && !known.has(name)) unknown.add(name);
  }
  return [...unknown];
}

export async function run(
  argv: string[],
  io: CliIO = defaultIO,
  wizard: WizardIO = terminalWizard,
): Promise<number> {
  const [command] = argv;

  // Version and top-level help never touch the filesystem.
  if (command === '--version' || command === '-v') {
    io.out(`${PRODUCT_SLUG} ${cliVersion()}`);
    return 0;
  }
  if (command === '--help' || command === '-h' || command === undefined) {
    io.out(USAGE);
    return 0;
  }

  const allowed = COMMAND_FLAGS[command];
  if (allowed === undefined) {
    io.err(`${PRODUCT_SLUG}: unknown command '${command}'`);
    io.err(`Run '${PRODUCT_SLUG} --help' for usage.`);
    return 1;
  }

  // `--help` is per-command and ALWAYS wins: it prints that command's options and
  // never runs it. Before this, `init --help` ran the init wizard and
  // `adopt --help` scanned the entire repository.
  if (argv.includes('--help') || argv.includes('-h')) {
    io.out(usageFor(command));
    return 0;
  }

  const unknown = unknownFlags(argv.slice(1), allowed);
  if (unknown.length > 0) {
    io.err(
      `${PRODUCT_SLUG} ${command}: unknown option${unknown.length > 1 ? 's' : ''} ` +
        unknown.map((name) => `--${name}`).join(', '),
    );
    io.err(`Run '${PRODUCT_SLUG} ${command} --help' for the options it accepts.`);
    return 1;
  }

  // A prompt on a pipe cannot be answered and a handler that throws must not
  // escape as an unsettled top-level await — Node then exits 13 with an internal
  // warning and no explanation of what went wrong. Both surface as a plain
  // failure with the reason.
  try {
    switch (command) {
      case 'init':
        return await runInit(argv.slice(1), io, wizard);
      case 'status':
        return await runStatus(argv.slice(1), io);
      case 'adopt':
        return await runAdopt(argv.slice(1), io, wizard);
      case 'task':
        return await runTask(argv.slice(1), io, wizard);
      case 'generate':
        return await runGenerate(argv.slice(1), io);
      case 'diff':
        return await runDiff(argv.slice(1), io);
      case 'validate':
        return await runValidate(argv.slice(1), io);
      case 'doctor':
        return await runDoctorCommand(argv.slice(1), io);
      case 'next':
        return await runNext(argv.slice(1), io);
      case 'plan':
        return await runPlanCommand(argv.slice(1), io);
      case 'trace':
        return await runTrace(argv.slice(1), io);
      case 'handoff':
        return await runHandoff(argv.slice(1), io);
      case 'pack':
        return await runPack(argv.slice(1), io);
      case 'agent':
        return await runAgent(argv.slice(1), io, wizard);
      default:
        // Unreachable: `allowed` above proves `command` is one of the keys.
        io.err(`${PRODUCT_SLUG}: unknown command '${command}'`);
        io.err(`Run '${PRODUCT_SLUG} --help' for usage.`);
        return 1;
    }
  } catch (err) {
    io.err(`${PRODUCT_SLUG} ${command}: ${(err as Error).message}`);
    return 1;
  }
}
