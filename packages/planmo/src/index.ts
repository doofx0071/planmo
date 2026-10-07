import { createInterface } from 'node:readline/promises';
import { stdin as nodeStdin, stdout as nodeStdout } from 'node:process';
import { resolve } from 'node:path';
import { PRODUCT_SLUG } from '@planmo/shared';
import { cliVersion } from './version.js';
import { initWorkspace, readStatus } from '@planmo/core';
import { analyzeRepository, nodeFileReader } from '@planmo/scanner';
import type {
  AccessibilityLevel,
  AgentId,
  DesignDensity,
  DesignStyle,
  PhaseMode,
  PlanningDepth,
  ProjectLifecycle,
  ProjectRisk,
  ProjectType,
} from '@planmo/schema';

/**
 * PlanMo CLI — the real command surface (ADR-0010).
 *
 * Every command is a thin adapter: argv -> a deterministic core call ->
 * exit code. No business logic lives here; the core owns all behavior.
 */

export interface CliIO {
  out: (line: string) => void;
  err: (line: string) => void;
}

const defaultIO: CliIO = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

export const USAGE = [
  `Usage: ${PRODUCT_SLUG} <command> [options]`,
  '',
  'Commands:',
  `  ${PRODUCT_SLUG} init [dir]    create a PlanMo workspace (wizard, or flags)`,
  `  ${PRODUCT_SLUG} status        validate and summarize the workspace`,
  `  ${PRODUCT_SLUG} adopt [dir]    analyze an existing repo (dry-run report; writes nothing)`,
  `  ${PRODUCT_SLUG} --version     print the PlanMo version`,
  `  ${PRODUCT_SLUG} --help        show this help`,
  '',
  'init options:',
  '      --name <name>         project display name (default: directory name)',
  '      --type <type>         web-application | cli | library | service |',
  '                            mobile-application | desktop-application | other',
  '      --lifecycle <v>       greenfield | brownfield',
  '      --risk <v>            low | medium | high',
  '      --agent <v>           opencode | claude-code | generic',
  '      --style <v>           minimal | editorial | neobrutalism | soft-product |',
  '                            dense-dashboard | developer-tool | luxury | playful',
  '      --depth <v>           lean | standard | production | high-assurance | custom',
  '      --phase-mode <v>      gated | continuous',
  '      --yes                 accept defaults for anything not provided',
  '      --dry-run             print the plan and write nothing',
  '      --force               overwrite existing unmanaged files',
  '',
  'status options:',
  '      --dir <path>          project root (default: walk up from cwd)',
  '',
  'adopt options:',
  '      --dir <path>          repository root (default: cwd)',
  '',
  'Exit codes: 0 ok · 1 error · 2 collision refused · 3 no project found',
].join('\n');

/** Minimal `--flag value` / `--flag=value` parser (no external dep). */
function parseArgs(argv: string[]): { flags: Map<string, string>; positional: string[] } {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq >= 0) {
        flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags.set(arg.slice(2), next);
          i++;
        } else {
          flags.set(arg.slice(2), 'true');
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

interface WizardIO {
  prompt: (question: string, dflt?: string) => Promise<string>;
  out: (line: string) => void;
}

const terminalWizard: WizardIO = {
  prompt: async (question: string, dflt?: string) => {
    const rl = createInterface({ input: nodeStdin, output: nodeStdout });
    try {
      const suffix = dflt !== undefined ? ` [${dflt}]` : '';
      const answer = await rl.question(`${question}${suffix}: `);
      return answer.trim() === '' && dflt !== undefined ? dflt : answer.trim();
    } finally {
      rl.close();
    }
  },
  out: (line) => console.log(line),
};

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
      return runAdopt(argv.slice(1), io);
    default:
      io.err(`planmo: unknown command '${command}'`);
      io.err(`Run 'planmo --help' for usage.`);
      return 1;
  }
}

async function runInit(argv: string[], io: CliIO, wizard: WizardIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const root = resolve(flags.get('dir') ?? positional[0] ?? process.cwd());

  // Wizard flow: when a value was not provided on the command line, ask the
  // user. `--yes` skips every question and takes the documented defaults.
  const ask = async (
    question: string,
    dflt: string,
    supplied: string | undefined,
  ): Promise<string> => {
    if (supplied !== undefined || flags.has('yes')) return supplied ?? dflt;
    return wizard.prompt(question, dflt);
  };

  const name = await ask(
    'Project name',
    root.split(/[\\/]/).pop() ?? 'planmo-project',
    flags.get('name'),
  );
  const type = (await ask('Type', 'web-application', flags.get('type'))) as ProjectType;
  const lifecycle = (await ask(
    'Lifecycle',
    'greenfield',
    flags.get('lifecycle'),
  )) as ProjectLifecycle;
  const risk = (await ask('Risk', 'medium', flags.get('risk'))) as ProjectRisk;
  const primaryAgent = (await ask('Primary agent', 'opencode', flags.get('agent'))) as AgentId;

  const style = flags.get('style');
  const density = flags.get('density');
  const accessibility = flags.get('accessibility');
  const planningDepth = flags.get('depth');
  const phaseMode = flags.get('phase-mode');

  try {
    const result = await initWorkspace({
      root,
      name,
      type,
      lifecycle,
      risk,
      primaryAgent,
      ...(style !== undefined ? { style: style as DesignStyle } : {}),
      ...(density !== undefined ? { density: density as DesignDensity } : {}),
      ...(accessibility !== undefined
        ? { accessibility: accessibility as AccessibilityLevel }
        : {}),
      ...(planningDepth !== undefined ? { planningDepth: planningDepth as PlanningDepth } : {}),
      ...(phaseMode !== undefined ? { phaseMode: phaseMode as PhaseMode } : {}),
      allowOverwrite: flags.has('force'),
      dryRun: flags.has('dry-run'),
    });

    if (flags.has('dry-run')) {
      io.out(`[dry-run] would initialize PlanMo workspace in ${result.root}`);
      for (const w of result.written) io.out(`  write ${w}`);
      for (const c of result.collisions) io.out(`  collision   ${c} (existing, refused)`);
      if (result.diff) io.out(result.diff);
      return 0;
    }

    for (const w of result.written) io.out(`✓ wrote ${w}`);
    for (const c of result.collisions)
      io.err(`✗ collision  ${c} (existing, refused — use --force to overwrite)`);
    io.out(`PlanMo workspace initialized in ${result.root}`);
    return result.collisions.length > 0 ? 2 : 0;
  } catch (err) {
    io.err(`planmo init: ${(err as Error).message}`);
    return 1;
  }
}

async function runStatus(argv: string[], io: CliIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const startDir = resolve(flags.get('dir') ?? positional[0] ?? process.cwd());
  try {
    const status = await readStatus({ startDir });
    io.out(`PlanMo workspace: ${status.root}`);
    if (status.project) {
      io.out(
        `project: ${status.project.project.name} (${status.project.project.type}, ${status.project.project.lifecycle}, risk=${status.project.project.risk})`,
      );
    }
    if (status.state) {
      io.out(
        `state: phase=${status.state.currentPhase} status=${status.state.status} completed=[${status.state.completedPhases.join(', ')}]`,
      );
    }
    if (status.healthy) {
      io.out('status: HEALTHY');
      return 0;
    }
    for (const issue of status.issues) {
      io.err(`${issue.level}: ${issue.doc} — ${issue.message}`);
    }
    io.err(`status: ${status.issues.length} issue(s)`);
    return 1;
  } catch (err) {
    io.err(`planmo status: ${(err as Error).message}`);
    return 3;
  }
}

async function runAdopt(argv: string[], io: CliIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const root = resolve(flags.get('dir') ?? positional[0] ?? process.cwd());
  try {
    const { report } = await analyzeRepository(root, nodeFileReader());
    io.out(
      report.reportMarkdown.endsWith('\n') ? report.reportMarkdown : `${report.reportMarkdown}\n`,
    );
    if (report.injectionSummary.poisoned > 0) {
      io.err(
        `adopt: WARNING ${report.injectionSummary.poisoned} file(s) contain prompt-injection-like content ` +
          `(policy is immutable; repository text is treated as data, never instructions).`,
      );
    }
    if (report.injectionSummary.suspicious > 0) {
      io.err(
        `adopt: NOTE ${report.injectionSummary.suspicious} file(s) are suspicious (single marker).`,
      );
    }
    return 0;
  } catch (err) {
    io.err(`planmo adopt: ${(err as Error).message}`);
    return 1;
  }
}
