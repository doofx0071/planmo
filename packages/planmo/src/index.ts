import { createInterface } from 'node:readline/promises';
import { stdin as nodeStdin, stdout as nodeStdout } from 'node:process';
import * as clack from '@clack/prompts';
import { resolve } from 'node:path';
import { PRODUCT_SLUG } from '@planmo/shared';
import { cliVersion } from './version.js';
import { renderAdoptArtifacts } from './adopt-write.js';
import { readTaskRows, recordTaskStatus, renderTaskOutcome } from './task.js';
import { generatePlanningWorkspace } from './generate.js';
import { validateWorkspace } from './validate.js';
import { runPlan, renderPlanSummary } from './plan.js';
import { mockPlanResponse } from './plan-build.js';
import { createHttpProvider, createMockProvider, resolveProvider } from '@planmo/ai';
import { buildHandoff, renderHandoffDocument } from './handoff.js';
import { packReport, renderPackReport } from './pack.js';
import { traceWorkspace } from './trace.js';
import { installAgentCommands } from './agent.js';
import { applyProposal, renderApplyOutcome } from './apply.js';
import { detectAgents, detectForInit, type AgentDetection } from './detect.js';
import { diffWorkspace, renderDiff } from './diff.js';
import { renderDoctor, runDoctor } from './doctor.js';
import { nextBrief } from './next.js';
import { AGENT_TARGETS, agentTarget } from '@planmo/agent-bridge';
import { initWorkspace, ProjectNotFoundError, readStatus, writeManaged } from '@planmo/core';
import { analyzeRepository, nodeFileReader, DEFAULT_EXCLUDES } from '@planmo/scanner';
import {
  AGENT_IDS,
  PROJECT_LIFECYCLES,
  PROJECT_RISKS,
  PROJECT_TYPES,
  TASK_STATUSES,
} from '@planmo/schema';
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
  `  ${PRODUCT_SLUG} adopt [dir]    analyze an existing repo, then offer to record it`,
  `  ${PRODUCT_SLUG} plan "<idea>" author the plan document with a model (once)`,
  `  ${PRODUCT_SLUG} generate      generate/refresh the planning workspace`,
  `  ${PRODUCT_SLUG} diff          show what generate would change (writes nothing)`,
  `  ${PRODUCT_SLUG} validate      validate the workspace documents and invariants`,
  `  ${PRODUCT_SLUG} doctor        report environment and workspace health`,
  `  ${PRODUCT_SLUG} next          print the task to work next, and what to read`,
  `  ${PRODUCT_SLUG} task [id]     record a task's status (interactive without args)`,
  `  ${PRODUCT_SLUG} trace [id]    render the requirements -> tasks -> tests trace graph`,
  `  ${PRODUCT_SLUG} handoff       record the current phase's handoff document`,
  `  ${PRODUCT_SLUG} pack          inspect the pack catalog and reconcile the lockfile`,
  `  ${PRODUCT_SLUG} agent init    install command files for your coding agent`,
  `  ${PRODUCT_SLUG} agent list    list the supported agents and their layouts`,
  `  ${PRODUCT_SLUG} agent apply   validate and record a proposal from an agent`,
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
  '      --yes                 report only, never prompt (scripts and CI)',
  '      --dry-run             report only, never prompt',
  '',
  '  adopt prints a read-only report, then offers to write the reports to',
  '  .planmo/adopt/ and to create the workspace. Both prompts default to the safe',
  '  answer; --yes and --dry-run skip them and write nothing, as before.',
  '',
  'task options:',
  '      [id]                  task id, e.g. P00-01 (omit to choose interactively)',
  '      --status <v>          TODO | IN_PROGRESS | BLOCKED | REVIEW | DONE',
  '      --dir <path>          project root (default: cwd)',
  '      --dry-run             report the change and write nothing',
  '',
  '  Status is recorded in .planmo/state.yml, which regeneration preserves. Editing',
  '  the status column of planning/tasks.csv directly does NOT work: that file is',
  '  generated, and the next `planmo generate` resets it to TODO.',
  '',
  'generate options:',
  '      --dir <path>          project root (default: cwd)',
  '      --dry-run             print the plan and write nothing',
  '      --force               overwrite files the manifest already owns',
  '',
  'diff options:',
  '      --dir <path>          project root (default: cwd)',
  '      --exit-code           exit 1 when the planning tree is out of date',
  '',
  'validate options:',
  '      --dir <path>          project root (default: walk up from cwd)',
  '',
  'doctor options:',
  '      --dir <path>          project root (default: cwd)',
  '',
  'next options:',
  '      --dir <path>          project root (default: cwd)',
  '      --print               print the brief to stdout and write nothing (the default)',
  '      --json                emit the brief as machine-readable JSON',
  '',
  'plan options:',
  '      "<idea>"              the project idea, in quotes',
  '      --dir <path>          project root (default: cwd)',
  '      --provider <id>       tokenharbor | openai | anthropic | deepseek |',
  '                            moonshot | xai | openrouter | custom | mock',
  '                            (default: the first preset whose key is set)',
  '      --model <slug>        model id, e.g. deepseek/deepseek-v4-flash',
  '      --base-url <url>      override the preset endpoint (required for custom)',
  '      --dry-run             print the plan and write nothing',
  '      --force               overwrite a plan you have edited',
  '',
  '  Credentials come from the environment only, named per provider —',
  '  TOKENHARBOR_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY,',
  '  MOONSHOT_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY, PLANMO_AI_API_KEY.',
  "  PlanMo never reads another tool's credential store.",
  '',
  'trace options:',
  '      --dir <path>          project root (default: cwd)',
  '      [id]                  focus on a requirement/task id (the engine renders',
  '                            the whole graph; the note names the focused node)',
  '',
  'handoff options:',
  '      --dir <path>          project root (default: cwd)',
  '      --dry-run             print the document and write nothing',
  '      --force               overwrite an existing handoff you have edited',
  '',
  'pack options:',
  '      --dir <path>          project root (default: cwd)',
  '      --source <dir>        local directory of pack.yml files to use as the catalog',
  '                            (the only source; no remote registry is ever fetched)',
  '      --dry-run             show what the lockfile would become, write nothing',
  '',
  'agent options:',
  '      --agent <id>          any id from `planmo agent list` (comma-separated)',
  '                            omit it to detect and choose interactively',
  '      --dir <path>          project root (default: cwd)',
  '      --global              allow a target that installs outside the project',
  '      --yes                 never prompt: use detection, or --agent',
  '      --force               overwrite files you have edited',
  '      --dry-run             print the plan and write nothing',
  '',
  '  agent apply <proposal.json>  validate a proposal and record it under .planmo/proposals/',
  '                               (plan documents are never rewritten by this command)',
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

/** Prompt values must be primitives — that is all a terminal prompt can render. */
type WizardValue = string | boolean | number;

/** One choice in a select or multi-select prompt. */
interface WizardChoice<T extends WizardValue> {
  value: T;
  label: string;
  hint?: string;
}

interface WizardIO {
  prompt: (question: string, dflt?: string) => Promise<string>;
  /** Arrow-key single select. `undefined` means the user cancelled. */
  select: <T extends WizardValue>(
    question: string,
    choices: WizardChoice<T>[],
  ) => Promise<T | undefined>;
  /** Arrow-key multi select, with `initial` pre-checked. `undefined` = cancelled. */
  multiSelect: <T extends WizardValue>(
    question: string,
    choices: WizardChoice<T>[],
    initial: readonly T[],
  ) => Promise<T[] | undefined>;
  /** Yes/no confirmation. `undefined` means the user cancelled. */
  confirm: (question: string, dflt: boolean) => Promise<boolean | undefined>;
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
  select: async <T extends WizardValue>(
    question: string,
    choices: WizardChoice<T>[],
  ): Promise<T | undefined> => {
    // clack types its options as `Option<Value>`, a conditional type over `Value`
    // that TypeScript cannot reduce while `Value` is still a type parameter. The
    // shapes are identical, so the list passes through unchanged.
    const opts = { message: question, options: choices } as unknown as Parameters<
      typeof clack.select<T>
    >[0];
    const answer = await clack.select<T>(opts);
    return clack.isCancel(answer) ? undefined : answer;
  },
  multiSelect: async <T extends WizardValue>(
    question: string,
    choices: WizardChoice<T>[],
    initial: readonly T[],
  ): Promise<T[] | undefined> => {
    const opts = {
      message: question,
      options: choices,
      initialValues: [...initial],
      required: false,
    } as unknown as Parameters<typeof clack.multiselect<T>>[0];
    const answer = await clack.multiselect<T>(opts);
    return clack.isCancel(answer) ? undefined : answer;
  },
  confirm: async (question: string, dflt: boolean): Promise<boolean | undefined> => {
    const answer = await clack.confirm({ message: question, initialValue: dflt });
    return clack.isCancel(answer) ? undefined : answer;
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

async function runGenerate(argv: string[], io: CliIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const root = resolve(flags.get('dir') ?? positional[0] ?? process.cwd());
  const dryRun = flags.has('dry-run');
  try {
    const result = await generatePlanningWorkspace({
      root,
      planmoVersion: cliVersion(),
      ...(flags.has('force') ? { allowOverwrite: true } : {}),
      dryRun,
    });
    for (const w of result.written) {
      io.out(`${dryRun ? '[dry-run] would write' : '✓ wrote'} ${w}`);
    }
    for (const c of result.collisions) {
      io.err(`✗ collision  ${c} (existing, refused — use --force to overwrite)`);
    }
    for (const d of result.diagnostics) io.err(`note: ${d}`);
    if (dryRun) io.out(`[dry-run] ${result.written.length} artifact(s) planned in ${root}`);
    return result.collisions.length > 0 ? 2 : 0;
  } catch (err) {
    io.err(`planmo generate: ${(err as Error).message}`);
    // 3 is reserved for "no workspace here". A generic failure must not wear the
    // same code, or a broken workspace is indistinguishable from a missing one.
    return err instanceof ProjectNotFoundError ? 3 : 1;
  }
}

async function runDiff(argv: string[], io: CliIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const root = resolve(flags.get('dir') ?? positional[0] ?? process.cwd());
  try {
    const outcome = await diffWorkspace({ root, planmoVersion: cliVersion() });
    io.out(renderDiff(outcome));
    // `--exit-code` makes this usable as a check, the way `git diff --exit-code`
    // is. Without it, a diff is information, not a failure — so the default stays
    // exit 0 and the documented exit contract is untouched.
    if (flags.has('exit-code') && !outcome.upToDate) return 1;
    return 0;
  } catch (err) {
    io.err(`planmo diff: ${(err as Error).message}`);
    return err instanceof ProjectNotFoundError ? 3 : 1;
  }
}

async function runValidate(argv: string[], io: CliIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const startDir = resolve(flags.get('dir') ?? positional[0] ?? process.cwd());
  try {
    const result = await validateWorkspace({ root: startDir });
    for (const d of result.diagnostics) {
      const line = `${d.severity} ${d.code} ${d.target} — ${d.message}`;
      if (d.severity === 'error') io.err(line);
      else io.out(line);
      if (d.remediation !== undefined) io.out(`  fix: ${d.remediation}`);
    }
    const { error, warning, info } = result.counts;
    if (result.ok) {
      io.out(`validate: OK (${error} error(s), ${warning} warning(s), ${info} info)`);
      return 0;
    }
    io.err(`validate: FAILED (${error} error(s), ${warning} warning(s), ${info} info)`);
    return 1;
  } catch (err) {
    io.err(`planmo validate: ${(err as Error).message}`);
    return err instanceof ProjectNotFoundError ? 3 : 1;
  }
}

async function runDoctorCommand(argv: string[], io: CliIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const root = resolve(flags.get('dir') ?? positional[0] ?? process.cwd());
  try {
    const outcome = await runDoctor({ root });
    io.out(renderDoctor(outcome));
    // A report, so it exits 0 unless the environment genuinely fails — which is
    // what makes it usable as a pre-flight check.
    return outcome.result.result === 'fail' ? 1 : 0;
  } catch (err) {
    io.err(`planmo doctor: ${(err as Error).message}`);
    return err instanceof ProjectNotFoundError ? 3 : 1;
  }
}

async function runNext(argv: string[], io: CliIO): Promise<number> {
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

async function runPlanCommand(argv: string[], io: CliIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const root = resolve(flags.get('dir') ?? process.cwd());
  const idea = (flags.get('idea') ?? positional.join(' ')).trim();
  if (idea === '') {
    io.err('planmo plan: an idea is required');
    io.err('  usage: planmo plan "<idea>" [--dir <path>] [--provider <id>] [--model <slug>]');
    return 1;
  }

  // The workspace check comes BEFORE provider resolution, deliberately. A user in
  // the wrong directory should be told that, not told to set an API key — and it
  // keeps the documented exit contract (3 = no project found here) true regardless
  // of what credentials happen to be configured.
  try {
    await readStatus({ root });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      io.err(`planmo plan: ${(err as Error).message}`);
      return 3;
    }
    throw err;
  }

  const requested = flags.get('provider');
  const model = flags.get('model');
  const baseUrl = flags.get('base-url');

  let provider;
  let providerId: string;
  let modelId: string;

  if (requested === 'mock') {
    // Explicitly requested, never selected implicitly: the mock exists so the whole
    // path can be exercised offline, and it says plainly that it is simulated.
    provider = createMockProvider({ text: mockPlanResponse(idea) });
    providerId = 'mock';
    modelId = model ?? 'mock';
    io.err('note: using the mock provider — output is simulated, not a real model.');
  } else {
    const resolved = resolveProvider({
      ...(requested !== undefined ? { preset: requested } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(baseUrl !== undefined ? { baseUrl } : {}),
    });

    if (!resolved.configured) {
      io.err(`planmo plan: no model provider is configured (${resolved.reason}).`);
      if (resolved.reason === 'missing-credential' && resolved.preset !== undefined) {
        io.err(`  set ${resolved.preset.credentialEnv} to use ${resolved.preset.label}.`);
      } else if (resolved.reason === 'missing-base-url') {
        io.err('  the custom preset needs --base-url <url>.');
      } else {
        io.err('  set one of: TOKENHARBOR_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY,');
        io.err('             DEEPSEEK_API_KEY, MOONSHOT_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY');
      }
      io.err('  or run with --provider mock to exercise the flow offline.');
      return 1;
    }

    provider = createHttpProvider({
      baseUrl: resolved.baseUrl,
      apiKey: process.env[resolved.preset.credentialEnv] ?? '',
      model: resolved.model ?? '',
      wireFormat: resolved.wireFormat,
    });
    providerId = resolved.preset.id;
    modelId = resolved.model ?? '';
  }

  if (modelId === '') {
    io.err('planmo plan: a model is required — pass --model <slug>.');
    io.err('  e.g. --provider tokenharbor --model deepseek/deepseek-v4-flash');
    return 1;
  }

  try {
    const outcome = await runPlan({
      root,
      idea,
      provider,
      providerId,
      model: modelId,
      ...(flags.has('dry-run') ? { dryRun: true } : {}),
      ...(flags.has('force') ? { allowOverwrite: true } : {}),
    });
    io.out(renderPlanSummary(outcome));
    // A plan that failed validation is a failure of the command: nothing was
    // written, and the caller needs to know that. A refused overwrite is the
    // documented collision code, like every other writing command.
    if (!outcome.ok) return 1;
    return outcome.collisions.length > 0 ? 2 : 0;
  } catch (err) {
    io.err(`planmo plan: ${(err as Error).message}`);
    return err instanceof ProjectNotFoundError ? 3 : 1;
  }
}

async function runTrace(argv: string[], io: CliIO): Promise<number> {
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

async function runHandoff(argv: string[], io: CliIO): Promise<number> {
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

async function runPack(argv: string[], io: CliIO): Promise<number> {
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

async function runAgent(argv: string[], io: CliIO, wizard: WizardIO): Promise<number> {
  const [sub] = argv;
  const { flags } = parseArgs(argv.slice(1));
  const root = resolve(flags.get('dir') ?? process.cwd());

  if (sub === undefined || sub === 'list') {
    io.out(`${AGENT_TARGETS.length} supported agents (id, directory, format):`);
    for (const target of AGENT_TARGETS) {
      const format = target.layout === 'skills' ? 'skills' : target.format;
      io.out(`  ${target.id.padEnd(14)} ${target.commandDir.padEnd(28)} ${format}`);
    }
    return 0;
  }

  if (sub === 'apply') {
    return runAgentApply(argv.slice(1), io);
  }

  if (sub !== 'init') {
    io.err(`planmo agent: unknown subcommand '${sub}'`);
    io.err(`Run 'planmo --help' for usage.`);
    return 1;
  }

  // `--agent` stays for scripts and CI. With no flag the default is the guided
  // flow: detect what this project already uses, pre-check it, then ask.
  const explicit = flags.get('agent');
  const assumeYes = flags.has('yes');
  const allowGlobal = flags.has('global');
  const interactive =
    explicit === undefined && !assumeYes && nodeStdin.isTTY === true && nodeStdout.isTTY === true;

  let chosen: string[];
  if (explicit !== undefined) {
    chosen = explicit
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== '');
  } else {
    const detected = await detectAgents(root);
    if (interactive) {
      const picked = await askWhichAgents(wizard, detected);
      if (picked === undefined) {
        io.out('Cancelled — nothing was written.');
        return 0;
      }
      chosen = picked;
    } else if (detected.length > 0) {
      // No terminal (a pipe, CI) and no flag: do the obvious thing, and say so.
      // A global target is never auto-installed — it writes outside the project,
      // which needs the explicit `--global` consent.
      const isGlobalId = (id: string): boolean => agentTarget(id)?.global === true;
      const local = detected.filter((found) => !isGlobalId(found.id));
      for (const found of detected.filter((entry) => isGlobalId(entry.id))) {
        io.out(
          `Detected ${found.id}, which installs outside this project — pass --global to include it.`,
        );
      }
      if (local.length > 0) {
        io.out(
          `Detected ${local.map((found) => found.id).join(', ')} — installing without asking.`,
        );
      }
      chosen = local.map((found) => found.id);
    } else {
      io.err('planmo agent: no coding agent detected in this project.');
      io.err("Pass --agent <id> (see 'planmo agent list'), or run this in a terminal.");
      return 1;
    }
  }

  if (chosen.length === 0) {
    io.out('Nothing selected — nothing was written.');
    return 0;
  }

  let collisions = 0;
  let errors = 0;
  for (const agent of chosen) {
    const target = agentTarget(agent);
    if (target === undefined) {
      io.err(`planmo agent: unknown agent '${agent}'`);
      errors += 1;
      continue;
    }

    const isGlobal = target.global === true;
    if (isGlobal && !allowGlobal) {
      if (!interactive) {
        io.err(`planmo agent: '${agent}' installs outside the project; pass --global to confirm.`);
        errors += 1;
        continue;
      }
      const ok = await wizard.confirm(
        `'${agent}' installs outside this project, into ${target.commandDir}. Continue?`,
        false,
      );
      if (ok !== true) {
        io.out(`Skipped ${agent}.`);
        continue;
      }
    }

    try {
      const result = await installAgentCommands({
        root,
        agent,
        ...(flags.has('force') ? { allowOverwrite: true } : {}),
        ...(flags.has('dry-run') ? { dryRun: true } : {}),
        ...(isGlobal ? { global: true } : {}),
      });
      // A global target installs OUTSIDE the project, into the user's home. Printing
      // the bare relative path makes it indistinguishable from a project-local
      // install: two identical "✓ wrote .hermes/skills/…" lines for two different
      // destinations, one of which leaves the repository.
      const prefix = isGlobal ? '~/' : '';
      for (const path of result.written) io.out(`✓ wrote ${prefix}${path}`);
      for (const path of result.collisions) {
        io.err(`✗ collision  ${prefix}${path} (yours, kept — use --force to replace)`);
        collisions += 1;
      }
      io.out(
        `Installed for ${target.label}${isGlobal ? ' — outside this project, in your home directory' : ''}.`,
      );
      if (target.howToRun !== undefined) {
        io.out(`  ${target.howToRun}`);
      } else {
        io.out('  Invoke in your agent with:');
        for (const file of result.files) {
          io.out(`  ${target.invocation(file.commandName)}`);
        }
      }
    } catch (err) {
      io.err(`planmo agent: ${(err as Error).message}`);
      errors += 1;
    }
  }
  // 1 = a usage error (unknown agent, no workspace, a refused global write);
  // 2 = refused because a file is yours. Keeps the documented exit contract.
  return errors > 0 ? 1 : collisions > 0 ? 2 : 0;
}

async function runAgentApply(argv: string[], io: CliIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const root = resolve(flags.get('dir') ?? process.cwd());
  const file = positional[0];

  if (file === undefined) {
    io.err('planmo agent apply: a proposal file is required');
    io.err('  usage: planmo agent apply <proposal.json> [--dir <path>] [--force] [--dry-run]');
    return 1;
  }

  const dryRun = flags.has('dry-run');
  try {
    const outcome = await applyProposal({
      root,
      file,
      ...(flags.has('force') ? { allowOverwrite: true } : {}),
      dryRun,
    });

    // A collision means the proposal is already recorded. Say that plainly rather
    // than printing "Recorded" over a write that did not happen.
    if (outcome.collisions.length > 0) {
      for (const path of outcome.collisions) {
        io.err(`✗ collision  ${path} (already recorded — use --force to replace)`);
      }
      io.err('planmo agent apply: nothing changed.');
      return 2;
    }

    for (const path of outcome.written) {
      io.out(`${dryRun ? '[dry-run] would write' : '✓ wrote'} ${path}`);
    }
    io.out(renderApplyOutcome(outcome, dryRun));
    return 0;
  } catch (err) {
    io.err(`planmo agent apply: ${(err as Error).message}`);
    return err instanceof ProjectNotFoundError ? 3 : 1;
  }
}

/**
 * The guided default: show what was detected and WHY, pre-check it, and ask.
 * Detection is a suggestion the user can override — never a decision made for them.
 */
async function askWhichAgents(
  wizard: WizardIO,
  detected: AgentDetection[],
): Promise<string[] | undefined> {
  wizard.out('');
  if (detected.length > 0) {
    wizard.out('Detected in this project:');
    for (const found of detected) {
      const mark = found.state === 'installed' ? 'already installed' : 'detected';
      wizard.out(`  ${found.id} (${mark}) — ${found.evidence.join(', ')}`);
    }
  } else {
    wizard.out('No coding agent detected in this project — pick from the list.');
  }

  const choices = AGENT_TARGETS.map((target) => ({
    value: target.id,
    label: target.label,
    hint: target.global === true ? `${target.commandDir} (global)` : target.commandDir,
  }));

  const picked = await wizard.multiSelect(
    'Which agent(s) should PlanMo install commands for?',
    choices,
    detected.map((found) => found.id),
  );
  if (picked === undefined || picked.length === 0) return picked;

  const ok = await wizard.confirm(`Install ${picked.length} command set(s) now?`, true);
  return ok === true ? picked : undefined;
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

  /**
   * Ask for a value from a fixed set, as an arrow-key menu.
   *
   * `[]` in these prompts means the RECOMMENDED option — the one to accept unless
   * you have a specific reason not to — not merely "whatever the code happens to
   * default to". Three things follow from that, and they are the whole point:
   *
   *   - the recommended choice is labelled, so the user can see WHY it is suggested
   *     rather than having to trust a bare bracketed word;
   *   - it is listed first, so pressing Enter accepts it (Enter on a list means the
   *     highlighted entry, and the first entry is the highlighted one);
   *   - the alternatives are visible instead of having to be known or looked up.
   *
   * A cancelled menu keeps the recommended value rather than aborting the run;
   * Ctrl-C is still how you abort.
   */
  const choose = async <T extends string>(
    question: string,
    recommended: T,
    values: readonly T[],
    supplied: string | undefined,
    reason?: string,
  ): Promise<T> => {
    if (supplied !== undefined || flags.has('yes')) return (supplied ?? recommended) as T;
    const ordered = [recommended, ...values.filter((value) => value !== recommended)];
    const picked = await wizard.select<T>(
      question,
      ordered.map((value) => ({
        value,
        label: value,
        ...(value === recommended
          ? { hint: reason === undefined ? 'recommended' : `recommended · ${reason}` }
          : {}),
      })),
    );
    return picked ?? recommended;
  };

  // Detect BEFORE asking. The user should be confirming what PlanMo found, not
  // supplying what PlanMo can work out for itself: this wizard used to ask a
  // Next.js repository with 158 files whether it was greenfield.
  const detecting =
    !flags.has('yes') && !flags.has('dry-run')
      ? progressLine(io, `init: detecting ${root} …`)
      : () => {};
  const detected = await detectForInit(root);
  detecting(`— ${detected.fileCount} file(s)`);

  if (!flags.has('yes') && positional.length === 0 && !flags.has('name')) {
    const parts = [
      detected.stacks.length > 0 ? detected.stacks.join(', ') : 'no known stack',
      detected.testFrameworks.length > 0 ? `tests: ${detected.testFrameworks.join(', ')}` : '',
      detected.agents.length > 0 ? `agents: ${detected.agents.map((a) => a.id).join(', ')}` : '',
      `${detected.fileCount} file(s)`,
    ].filter((part) => part !== '');
    wizard.out(`Detected: ${parts.join(' · ')}`);
    wizard.out('Press Enter to accept the recommended value. Use arrow keys to choose.');
  }

  const name = await ask(
    'Project name',
    root.split(/[\\/]/).pop() ?? 'planmo-project',
    flags.get('name'),
  );
  const type = await choose<ProjectType>(
    'Type',
    detected.type as ProjectType,
    PROJECT_TYPES,
    flags.get('type'),
    detected.stacks.length > 0 ? `detected ${detected.stacks.join(', ')}` : undefined,
  );
  const lifecycle = await choose<ProjectLifecycle>(
    'Lifecycle',
    detected.lifecycle,
    PROJECT_LIFECYCLES,
    flags.get('lifecycle'),
    detected.lifecycle === 'brownfield'
      ? `${detected.fileCount} file(s) present`
      : 'empty directory',
  );
  const risk = await choose<ProjectRisk>('Risk', 'medium', PROJECT_RISKS, flags.get('risk'));
  const primaryAgent = await choose<AgentId>(
    'Primary agent',
    detected.primaryAgent,
    // ADR-0008: the v1 primary-agent matrix is three ids. The 31 agents in
    // @planmo/agent-bridge are for COMMAND INSTALLATION, and offering them here
    // would let the user pick a value project.yml then rejects.
    AGENT_IDS,
    flags.get('agent'),
    detected.agents.length > 0
      ? `detected ${detected.agents.map((a) => a.id).join(', ')}`
      : undefined,
  );

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

    // A fresh workspace is useless without its planning documents: compile them
    // in the same run. `.planmo/` collisions abort above, so this only runs for
    // a workspace we just wrote (or were explicitly allowed to overwrite).
    if (result.collisions.length === 0) {
      try {
        const generated = await generatePlanningWorkspace({
          root: result.root,
          planmoVersion: cliVersion(),
          ...(flags.has('force') ? { allowOverwrite: true } : {}),
        });
        for (const w of generated.written) io.out(`✓ wrote ${w}`);
        for (const d of generated.diagnostics) io.err(`note: ${d}`);
      } catch (err) {
        io.err(`planmo init: planning generation failed — ${(err as Error).message}`);
        return 1;
      }
    }

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

/**
 * A one-line progress indicator for operations long enough that a silent terminal
 * reads as a hang.
 *
 * On a TTY it animates in place, so the user sees the scan is alive; anywhere else
 * (a pipe, a CI log, a test) it prints the line once and never animates, because
 * carriage returns in a captured log are noise. Writing goes straight to stderr
 * rather than through `io` precisely so the animated frames cannot pollute captured
 * stdout.
 */
function progressLine(io: CliIO, text: string): (suffix?: string) => void {
  if (process.stdout.isTTY !== true) {
    io.err(text);
    return () => {};
  }
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frame = 0;
  const timer = setInterval(() => {
    process.stderr.write(`\r${frames[frame++ % frames.length]!} ${text}`);
  }, 80);
  timer.unref?.();
  return (suffix = '') => {
    clearInterval(timer);
    process.stderr.write(`\r${text} ${suffix}\n`);
  };
}

async function runTask(argv: string[], io: CliIO, wizard: WizardIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  // The positional argument is the TASK ID, not a directory — the root comes from
  // --dir or the working directory.
  const root = resolve(flags.get('dir') ?? process.cwd());
  try {
    const rows = await readTaskRows(root);
    let id = positional[0];

    // Interactive-first: with no id, choose from the tasks that are not done.
    if (id === undefined) {
      const open = rows.filter((row) => row.status !== 'DONE');
      if (open.length === 0) {
        io.out('Every task is DONE.');
        return 0;
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

async function runAdopt(argv: string[], io: CliIO, wizard: WizardIO): Promise<number> {
  const { flags, positional } = parseArgs(argv);
  const root = resolve(flags.get('dir') ?? positional[0] ?? process.cwd());
  // `adopt` is read-only by default and STAYS read-only unless the user answers the
  // prompt: --dry-run and --yes both mean "report only", so scripts and CI keep the
  // behaviour they had before the prompts existed.
  const reportOnly = flags.has('yes') || flags.has('dry-run');
  try {
    // A scan of a real project can take a while, and the user is staring at a
    // silent terminal while it happens. Say what is being scanned, to stderr so
    // stdout stays exactly the report.
    const scanning = progressLine(io, `adopt: scanning ${root} …`);
    const { report, scan, detection, injections } = await analyzeRepository(
      root,
      nodeFileReader(),
      {
        // Without this the scan walks node_modules and the findings describe your
        // dependencies rather than your code (see DEFAULT_EXCLUDES).
        scan: { exclude: DEFAULT_EXCLUDES },
      },
    );
    scanning(`— ${report.scanSummary.files} file(s)`);
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

    // The report above says "would-be artifacts" and then the command used to just
    // end — leaving the user to discover that nothing was written and that `init`
    // is a separate command. Ask instead.
    const artifacts = renderAdoptArtifacts({
      root,
      planmoVersion: cliVersion(),
      report,
      scan,
      detection,
      injections,
    });

    if (!reportOnly) {
      io.out('');
      const write = await wizard.confirm(
        `Write these ${artifacts.length} reports to .planmo/adopt/?`,
        true,
      );
      if (write === true) {
        const result = await writeManaged(root, [...artifacts], {
          contentDirs: ['.planmo/adopt'],
        });
        for (const path of result.written) io.out(`✓ wrote ${path}`);
        for (const path of result.collisions) {
          io.err(`✗ collision  ${path} (existing, refused — use --force to overwrite)`);
        }
      }

      // The workspace is what the user was actually expecting when they ran this.
      const create = await wizard.confirm('Create the PlanMo workspace here now?', false);
      if (create === true) {
        io.out('');
        return runInit([root, '--yes'], io, wizard);
      }
    }

    return 0;
  } catch (err) {
    io.err(`planmo adopt: ${(err as Error).message}`);
    return 1;
  }
}
