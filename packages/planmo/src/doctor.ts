import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { readStatus } from '@planmo/core';
import { doctorEngine, type DoctorResult } from '@planmo/trace';

/**
 * `planmo doctor` — environmental and workspace health.
 *
 * Thin adapter over `@planmo/trace`'s doctor engine, the same shape as `validate`:
 * the CLI resolves the environment facts the engine cannot know (Node version,
 * package manager, git state, missing prompt files), hands them over, and reports
 * what comes back. The engine owns every diagnostic.
 *
 * Two deliberate choices about the facts:
 *   - The package manager is DETECTED from the lockfile and passed with no
 *     expectation. The engine used to assume pnpm, which flagged every non-pnpm
 *     project as an error; it now only enforces a manager the project declares,
 *     and nothing declares one, so the detected manager is reported as info.
 *   - A failing `git status` (not a repo, or no git) is reported as "not dirty"
 *     rather than an error. Not having git is not a health problem here.
 */
export interface DoctorOptions {
  root: string;
  /**
   * The Node version to judge. Defaults to the running one, but is injectable so
   * the version band (DOC-001/DOC-002) is testable deterministically. A test that
   * asserts "a clean environment reports ok" must not inherit whatever Node the
   * test runner happens to use: the project permits any major >= 24, and DOC-002
   * warns on an ahead-of-LTS major, so a host-dependent assertion goes red on a
   * perfectly supported Node.
   */
  nodeVersion?: string;
}

export interface DoctorOutcome {
  root: string;
  result: DoctorResult;
  /** The environment facts the CLI resolved, for transparency in `--json`. */
  environment: {
    nodeVersion: string;
    packageManager: string;
    gitWorktreeDirty: boolean;
    promptFilesMissing: number;
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The package manager a project uses, from the lockfile it has. First match wins,
 * so the list is ordered most-specific first. `unknown` when there is no
 * lockfile — which is information, not a failure.
 */
export async function detectPackageManager(root: string): Promise<string> {
  const candidates: readonly [string, string][] = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
    ['uv.lock', 'uv'],
    ['poetry.lock', 'poetry'],
    ['Pipfile.lock', 'pipenv'],
    ['Cargo.lock', 'cargo'],
    ['go.sum', 'go'],
    ['Gemfile.lock', 'bundler'],
    ['composer.lock', 'composer'],
  ];
  for (const [file, name] of candidates) {
    if (await exists(join(root, file))) return name;
  }
  return 'unknown';
}

/** Whether the git worktree has uncommitted changes. Never throws. */
export function gitWorktreeDirty(root: string): boolean {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0 || typeof result.stdout !== 'string') return false;
  return result.stdout.trim() !== '';
}

export async function runDoctor(opts: DoctorOptions): Promise<DoctorOutcome> {
  const status = await readStatus({ root: opts.root });
  if (status.project === null) {
    throw new Error(`no readable .planmo/project.yml in ${opts.root}`);
  }

  // The workspace state names the prompt for the next phase. If it is missing,
  // that is a real gap; if the state names none, there is nothing to check.
  const nextPrompt = status.state?.nextPrompt;
  let promptFilesMissing = 0;
  if (typeof nextPrompt === 'string' && nextPrompt.trim() !== '') {
    if (!(await exists(join(status.root, nextPrompt)))) promptFilesMissing = 1;
  }

  const environment = {
    nodeVersion: opts.nodeVersion ?? process.version,
    packageManager: await detectPackageManager(status.root),
    gitWorktreeDirty: gitWorktreeDirty(status.root),
    promptFilesMissing,
  };

  return {
    root: status.root,
    result: doctorEngine().check({
      nodeVersion: environment.nodeVersion,
      packageManagerName: environment.packageManager,
      gitWorktreeDirty: environment.gitWorktreeDirty,
      promptFilesMissing: environment.promptFilesMissing,
    }),
    environment,
  };
}

/** Render a doctor outcome as plain text. */
export function renderDoctor(outcome: DoctorOutcome): string {
  const lines: string[] = [];
  for (const diagnostic of outcome.result.diagnostics) {
    const line = `${diagnostic.severity} ${diagnostic.code} ${diagnostic.target} — ${diagnostic.message}`;
    lines.push(line);
    if (diagnostic.remediation !== undefined) lines.push(`  fix: ${diagnostic.remediation}`);
  }
  // The resolved facts are shown whether or not they produced a diagnostic: the
  // engine stays silent about a package manager it has no expectation for, so
  // this is where the user still sees what was detected.
  lines.push(
    'environment:',
    `  node            ${outcome.environment.nodeVersion}`,
    `  package manager ${outcome.environment.packageManager}`,
    `  git worktree    ${outcome.environment.gitWorktreeDirty ? 'dirty' : 'clean'}`,
    `  prompts missing ${outcome.environment.promptFilesMissing}`,
  );
  const { error, warning, info } = outcome.result.counts;
  lines.push(
    `doctor: ${outcome.result.result.toUpperCase()} (${error} error(s), ${warning} warning(s), ${info} info)`,
  );
  return lines.join('\n');
}
