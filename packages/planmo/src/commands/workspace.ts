import { resolve } from 'node:path';
import { AGENT_IDS, PROJECT_LIFECYCLES, PROJECT_RISKS, PROJECT_TYPES } from '@planmo/schema';
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
import { initWorkspace, ProjectNotFoundError, readStatus, writeManaged } from '@planmo/core';
import { analyzeRepository, nodeFileReader, DEFAULT_EXCLUDES } from '@planmo/scanner';
import { parseArgs, type CliIO, type WizardIO } from '../cli-io.js';
import { cliVersion } from '../version.js';
import { renderAdoptArtifacts } from '../adopt-write.js';
import { generatePlanningWorkspace, previewPlanningWorkspace } from '../generate.js';
import { validateWorkspace } from '../validate.js';
import { detectForInit } from '../detect.js';
import { diffWorkspace, renderDiff } from '../diff.js';
import { renderDoctor, runDoctor } from '../doctor.js';

/**
 * Workspace lifecycle commands: create, inspect, regenerate and adopt.
 *
 * `init`, `status`, `adopt`, `generate`, `diff`, `validate` and `doctor` all
 * answer questions about the same canonical workspace, so they live together.
 * `progressLine` is their shared progress indicator.
 */
export async function runGenerate(argv: string[], io: CliIO): Promise<number> {
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

export async function runDiff(argv: string[], io: CliIO): Promise<number> {
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

export async function runValidate(argv: string[], io: CliIO): Promise<number> {
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

export async function runDoctorCommand(argv: string[], io: CliIO): Promise<number> {
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

export async function runInit(argv: string[], io: CliIO, wizard: WizardIO): Promise<number> {
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
      // `init` compiles the whole planning tree in the same run, so the dry run
      // has to report those documents too. Listing only the three `.planmo/`
      // files under-reported the write set by roughly thirty documents.
      if (result.collisions.length === 0) {
        try {
          const preview = await previewPlanningWorkspace(result.project, {
            root: result.root,
            planmoVersion: cliVersion(),
          });
          for (const w of preview.written) io.out(`  write ${w}`);
          for (const d of preview.diagnostics) io.out(`  note ${d}`);
        } catch (err) {
          io.out(`  note: planning preview unavailable — ${(err as Error).message}`);
        }
      }
      if (result.diff) io.out(result.diff);
      return 0;
    }

    for (const w of result.written) io.out(`✓ wrote ${w}`);
    for (const c of result.collisions)
      io.err(`✗ collision  ${c} (existing, refused — use --force to overwrite)`);

    // Nothing was initialized when the marker files already exist: claiming
    // "initialized" contradicted both the ✗ lines above and the exit code.
    if (result.collisions.length > 0) {
      io.err(`planmo init: ${result.root} already has a workspace — nothing was initialized`);
      return 2;
    }

    io.out(`PlanMo workspace initialized in ${result.root}`);

    // A fresh workspace is useless without its planning documents: compile them
    // in the same run. `.planmo/` collisions returned above, so this only runs
    // for a workspace we just wrote (or were explicitly allowed to overwrite).
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

    return 0;
  } catch (err) {
    io.err(`planmo init: ${(err as Error).message}`);
    return 1;
  }
}

export async function runStatus(argv: string[], io: CliIO): Promise<number> {
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
      // `status` is documented as "validate and summarize the workspace", but it
      // only ever inspected the three `.planmo/` documents — a `planning/tasks.csv`
      // that does not parse left it reporting HEALTHY while `validate` reported
      // FAILED on the very same workspace. Ask the same engine, report the same
      // verdict.
      const parseIssues = await documentParseIssues(status.root);
      if (parseIssues.length === 0) {
        io.out('status: HEALTHY');
        return 0;
      }
      for (const issue of parseIssues) {
        io.err(`${issue.level}: ${issue.doc} — ${issue.message}`);
      }
      io.err(`status: ${parseIssues.length} issue(s)`);
      return 1;
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
 * The document-parse failures `status` used to miss.
 *
 * `status` inspects only the three `.planmo/` documents, so a `planning/tasks.csv`
 * that does not parse left it reporting HEALTHY while `validate` reported FAILED
 * on the same workspace. Same engine, same verdict — filtered to the
 * document-parse errors so the summary stays a summary.
 */
async function documentParseIssues(
  root: string,
): Promise<{ level: string; doc: string; message: string }[]> {
  const report = await validateWorkspace({ root }).catch(() => null);
  if (report === null) return [];
  return report.diagnostics
    .filter((diagnostic) => diagnostic.code === 'VLD-004' && diagnostic.severity === 'error')
    .map((diagnostic) => ({
      level: 'error',
      doc: diagnostic.target ?? 'document',
      message: diagnostic.message,
    }));
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

export async function runAdopt(argv: string[], io: CliIO, wizard: WizardIO): Promise<number> {
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
