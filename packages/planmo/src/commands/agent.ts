import { stdin as nodeStdin, stdout as nodeStdout } from 'node:process';
import { resolve } from 'node:path';
import { AGENT_TARGETS, agentTarget } from '@planmo/agent-bridge';
import { ProjectNotFoundError } from '@planmo/core';
import { parseArgs, type CliIO, type WizardIO } from '../cli-io.js';
import { installAgentCommands } from '../agent.js';
import { applyProposal, renderApplyOutcome } from '../apply.js';
import { detectAgents, type AgentDetection } from '../detect.js';

/**
 * `planmo agent` — install the command files a coding agent runs, and record a
 * proposal it produces. Proposals are validated and recorded, never applied
 * (ADR-0026).
 */
export async function runAgent(argv: string[], io: CliIO, wizard: WizardIO): Promise<number> {
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
