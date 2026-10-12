import { PRODUCT_SLUG } from '@planmo/shared';
import { cliVersion } from './version.js';
import { defaultIO, terminalWizard, type CliIO, type WizardIO } from './cli-io.js';
import { USAGE } from './usage.js';
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
export { USAGE } from './usage.js';

export async function run(
  argv: string[],
  io: CliIO = defaultIO,
  wizard: WizardIO = terminalWizard,
): Promise<number> {
  const [command] = argv;
  switch (command) {
    case '--version':
    case '-v':
      io.out(`${PRODUCT_SLUG} ${cliVersion()}`);
      return 0;
    case '--help':
    case '-h':
      io.out(USAGE);
      return 0;
    case undefined:
      io.out(USAGE);
      return 0;
    case 'init':
      return runInit(argv.slice(1), io, wizard);
    case 'status':
      return runStatus(argv.slice(1), io);
    case 'adopt':
      return runAdopt(argv.slice(1), io, wizard);
    case 'task':
      return runTask(argv.slice(1), io, wizard);
    case 'generate':
      return runGenerate(argv.slice(1), io);
    case 'diff':
      return runDiff(argv.slice(1), io);
    case 'validate':
      return runValidate(argv.slice(1), io);
    case 'doctor':
      return runDoctorCommand(argv.slice(1), io);
    case 'next':
      return runNext(argv.slice(1), io);
    case 'plan':
      return runPlanCommand(argv.slice(1), io);
    case 'trace':
      return runTrace(argv.slice(1), io);
    case 'handoff':
      return runHandoff(argv.slice(1), io);
    case 'pack':
      return runPack(argv.slice(1), io);
    case 'agent':
      return runAgent(argv.slice(1), io, wizard);
    default:
      io.err(`planmo: unknown command '${command}'`);
      io.err(`Run 'planmo --help' for usage.`);
      return 1;
  }
}
