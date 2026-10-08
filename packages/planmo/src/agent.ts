import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readStatus, writeManaged } from '@planmo/core';
import { AGENT_COMMANDS, agentTarget, renderAgentFiles } from '@planmo/agent-bridge';

/**
 * Install PlanMo's command files into an agent's own directory.
 *
 * Thin adapter: the target table and the templates live in
 * `@planmo/agent-bridge`; this only picks a target and hands the rendered bytes
 * to the safe writer.
 *
 * Refresh safety works the way spec-kit's upgrade does — by content, not by the
 * manifest. A file PlanMo already wrote and the user has not touched is simply
 * current (a no-op); a file whose bytes differ is the user's and is reported as a
 * collision unless `--force` is passed. That keeps the command idempotent
 * without teaching the generation manifest about agent directories.
 */
export interface AgentInitOptions {
  root: string;
  /** Adapter id, e.g. `opencode`, `claude-code`, `codex`, `copilot`, `generic`. */
  agent: string;
  /** Overwrite files whose content differs (the user's edits). */
  allowOverwrite?: boolean;
  /** Compute the plan without writing anything. */
  dryRun?: boolean;
  /** Permit a target that installs outside the project (Hermes). Explicit consent. */
  global?: boolean;
  /** Home directory a global target resolves `~` against. Injectable for tests. */
  home?: string;
}

export interface AgentInitOutcome {
  target: string;
  files: { path: string; commandName: string }[];
  written: string[];
  collisions: string[];
}

/** sha256 hex of a string — the stamp that decides whether a refresh is safe. */
export function contentHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Files whose on-disk content still matches what PlanMo last wrote, i.e. safe to
 * refresh on upgrade. A file the user edited is theirs; a missing file is a
 * create, not a refresh. Deterministic (sorted) order.
 */
export function refreshable(
  files: readonly { path: string; content: string }[],
  onDisk: ReadonlyMap<string, string>,
): string[] {
  return files
    .filter((file) => onDisk.get(file.path) === file.content)
    .map((file) => file.path)
    .sort();
}

/** Read a file, or undefined when it is absent (a valid state). */
async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

export async function installAgentCommands(opts: AgentInitOptions): Promise<AgentInitOutcome> {
  const target = agentTarget(opts.agent);
  if (target === undefined) {
    throw new Error(`unknown agent '${opts.agent}'`);
  }
  if (target.global === true && opts.global !== true) {
    // Generation never writes outside the project root without explicit consent.
    throw new Error(
      `agent '${target.id}' installs outside the project (${target.commandDir}); ` +
        'pass --global to confirm',
    );
  }

  const status = await readStatus({ root: opts.root });
  if (status.project === null) {
    throw new Error(`no readable .planmo/project.yml in ${opts.root}`);
  }

  // A global target writes under the home directory, so `~` is resolved here and
  // the writer is pointed at the directory that contains the files. Its
  // containment check still applies — it just starts from home, not the root.
  const writeRoot = target.global === true ? (opts.home ?? homedir()) : opts.root;
  const files = renderAgentFiles(target, AGENT_COMMANDS).map((file) => ({
    ...file,
    path: target.global === true ? file.path.replace(/^~\//, '') : file.path,
  }));
  const onDisk = new Map<string, string>();
  for (const file of files) {
    const existing = await readIfPresent(join(writeRoot, file.path));
    if (existing !== undefined) onDisk.set(file.path, existing);
  }

  const force = opts.allowOverwrite ?? false;
  const writable: { path: string; content: string }[] = [];
  const collisions: string[] = [];

  for (const file of files) {
    const existing = onDisk.get(file.path);
    if (existing === undefined) {
      writable.push({ path: file.path, content: file.content }); // create
    } else if (existing === file.content) {
      // Already current — nothing to do, so a re-run is a clean no-op.
    } else if (force) {
      writable.push({ path: file.path, content: file.content }); // explicit consent
    } else {
      collisions.push(file.path);
    }
  }

  const dirs = [...new Set(writable.map((f) => f.path.slice(0, f.path.lastIndexOf('/'))))].sort();
  const written =
    writable.length === 0
      ? []
      : (
          await writeManaged(writeRoot, writable, {
            contentDirs: dirs,
            allowOverwrite: true,
            ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
          })
        ).written;

  return {
    target: target.id,
    files: files.map((file) => ({ path: file.path, commandName: file.commandName })),
    written,
    collisions,
  };
}
