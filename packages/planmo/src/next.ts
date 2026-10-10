import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readStatus } from '@planmo/core';
import {
  TASKS_CSV_PATH,
  composeNextBrief,
  parseTaskList,
  phaseDocPath,
  phaseTitleFromDoc,
  type NextBrief,
} from '@planmo/workflow';

/**
 * `planmo next` — the session brief.
 *
 * Thin adapter over `@planmo/workflow`'s next-task composer, the same shape as
 * `validate` over `@planmo/trace`: read the canonical documents off disk, hand
 * them to the engine, print what it returns. No selection logic lives here, so
 * the same workspace always produces the same brief and the output is safe to
 * diff.
 */
export interface NextOptions {
  root: string;
}

export interface NextOutcome {
  root: string;
  brief: NextBrief;
  /** The brief as terminal text, ready to print. */
  text: string;
}

/** Read a file, or return undefined when it is absent (a valid state). */
async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** Render a brief as plain text. No colour, no width assumptions. */
export function renderNextBrief(
  brief: NextBrief,
  /**
   * Paths the workspace records as user-owned (manifest `seeded`), if known.
   *
   * Printed because the ownership boundary is the one rule an agent cannot infer
   * from the documents themselves: generated files look exactly like user-owned
   * ones, and an agent that does not know the difference either writes decisions
   * into a file regeneration will overwrite, or reverse-engineers the rule from
   * PlanMo's own source. One real `/planmo-next` run did the latter and cost 1.6M
   * tokens for four short decisions.
   */
  userOwned: readonly string[] = [],
): string {
  const lines: string[] = [];

  if (brief.phase !== null) {
    const title = brief.phaseTitle === null ? '' : ` — ${brief.phaseTitle}`;
    lines.push(`Phase ${brief.phase}${title}`, '');
  }

  if (brief.complete) {
    lines.push(`All ${brief.progress.total} tasks are DONE.`, '');
    lines.push(
      'Nothing left to work. Run `npx -y planmo validate` to confirm the workspace is consistent.',
    );
  } else if (brief.task === null) {
    lines.push('No workable task found.', '');
    lines.push('Every task is either DONE or BLOCKED — see below.');
  } else {
    lines.push(
      `Next task  ${brief.task.id}   ${brief.task.priority}   ${brief.task.status}`,
      `  ${brief.task.title}`,
      '',
      'Read before you start:',
    );
    for (const path of brief.read) lines.push(`  ${path}`);
    lines.push('');
    if (userOwned.length > 0) {
      lines.push(
        'Record decisions and durable notes in the documents you own — regeneration',
        'never touches these:',
      );
      for (const path of userOwned) lines.push(`  ${path}`);
      lines.push(
        '',
        'Every other file under planning/ is GENERATED: regeneration overwrites it, so',
        'anything written there is lost.',
      );
    } else {
      lines.push(
        'Every file under planning/ is GENERATED except the ones listed above:',
        'regeneration overwrites generated files, so do not record decisions in them.',
      );
    }
    lines.push(
      '',
      `Progress  ${brief.progress.done} of ${brief.progress.total} tasks done · ${brief.readyCount} ready`,
      '',
      'Change only what this task requires, and add no adjacent edits.',
      'Do not explore beyond the files listed above.',
      'When you are done, run `npx -y planmo validate`.',
    );
  }

  if (brief.blocked.length > 0) {
    lines.push('', `Blocked (${brief.blocked.length}):`);
    for (const task of brief.blocked) lines.push(`  ${task.id}  ${task.title}`);
  }

  // A row the reader could not use is never silently dropped.
  if (brief.skipped.length > 0) {
    lines.push(
      '',
      `Warning: ${brief.skipped.length} row(s) in ${TASKS_CSV_PATH} could not be read:`,
    );
    for (const row of brief.skipped) lines.push(`  ${row}`);
  }

  return lines.join('\n');
}

/**
 * Paths the generation manifest records as user-owned (`seeded`), sorted.
 *
 * A missing or unreadable manifest is not an error here: the brief still renders,
 * it just cannot name the user-owned files. The ownership boundary is a hint for
 * the agent, not a precondition for the command.
 */
async function readUserOwned(root: string): Promise<readonly string[]> {
  const raw = await readIfPresent(join(root, '.planmo', 'manifest.json'));
  if (raw === undefined) return [];
  try {
    const parsed = JSON.parse(raw) as {
      entries?: readonly { path?: unknown; ownershipMode?: unknown }[];
    };
    return (parsed.entries ?? [])
      .filter((entry) => entry.ownershipMode === 'seeded' && typeof entry.path === 'string')
      .map((entry) => entry.path as string)
      .sort();
  } catch {
    return [];
  }
}

export async function nextBrief(opts: NextOptions): Promise<NextOutcome> {
  const status = await readStatus({ root: opts.root });
  if (status.project === null) {
    throw new Error(`no readable .planmo/project.yml in ${opts.root}`);
  }

  const csv = await readIfPresent(join(status.root, TASKS_CSV_PATH));
  if (csv === undefined) {
    throw new Error(`no ${TASKS_CSV_PATH} in ${status.root} — run 'planmo generate' first`);
  }

  const parsed = parseTaskList(csv);

  // Phase titles are decoration. A missing or unreadable phase document must not
  // stop the brief, so the title is simply omitted rather than guessed.
  const phaseTitles: Record<string, string> = {};
  for (const phase of new Set(parsed.tasks.map((task) => task.phase))) {
    const doc = await readIfPresent(join(status.root, phaseDocPath(phase)));
    if (doc === undefined) continue;
    const title = phaseTitleFromDoc(doc);
    if (title !== undefined) phaseTitles[phase] = title;
  }

  const brief = composeNextBrief({
    tasks: parsed.tasks,
    skipped: parsed.skipped,
    phaseTitles,
  });

  return {
    root: status.root,
    brief,
    text: renderNextBrief(brief, await readUserOwned(status.root)),
  };
}
