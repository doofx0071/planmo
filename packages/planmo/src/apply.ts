import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  validateProposal,
  PROPOSALS_DIR,
  proposalRecordPath,
  renderProposalRecord,
} from '@planmo/agent-bridge';
import { readStatus, writeManaged } from '@planmo/core';
import type { AiProposal } from '@planmo/schema';

/**
 * `planmo agent apply <proposal.json>` — accept an agent's plan delta.
 *
 * What this deliberately does NOT do is rewrite the planning documents. A
 * proposal item is a statement of intent (`summary` + optional `rationale`), not
 * a mechanical edit: `AiProposalSchema` says the workflow engine interprets and
 * approves items, and the agent bridge never applies them directly. So `apply`
 * does the two things it can do safely and honestly — validate the proposal at
 * the bridge boundary, and record it durably so the decision is traceable.
 *
 * Nothing is partially applied: an invalid proposal writes nothing at all.
 */
export interface ApplyOptions {
  root: string;
  /** The proposal file as the user named it; resolved against the cwd. */
  file: string;
  allowOverwrite?: boolean;
  dryRun?: boolean;
}

export interface ApplyOutcome {
  root: string;
  /** The validated, normalised proposal (schema defaults applied). */
  proposal: AiProposal;
  /** Workspace-relative path the proposal was recorded at. */
  recordPath: string;
  written: string[];
  collisions: string[];
}

export async function applyProposal(opts: ApplyOptions): Promise<ApplyOutcome> {
  const status = await readStatus({ root: opts.root });
  if (status.project === null) {
    throw new Error(`no readable .planmo/project.yml in ${opts.root}`);
  }

  const path = resolve(opts.file);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(`cannot read ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${(err as Error).message}`);
  }

  // The bridge boundary: agent output never reaches canonical state unvalidated.
  // Strict objects, so a proposal cannot smuggle commands or unknown fields past
  // this point.
  const validation = validateProposal(parsed);
  if (!validation.ok || validation.proposal === undefined) {
    const errors = validation.errors ?? ['unknown validation failure'];
    throw new Error(`proposal rejected, nothing was written:\n  ${errors.join('\n  ')}`);
  }
  const proposal = validation.proposal;
  // The path is derived from a slug of free-text `requestId`, so it cannot name
  // a location outside `.planmo/proposals/`.
  const recordPath = proposalRecordPath(proposal.requestId);

  const result = await writeManaged(
    status.root,
    [{ path: recordPath, content: renderProposalRecord(proposal) }],
    {
      contentDirs: [PROPOSALS_DIR],
      ...(opts.allowOverwrite !== undefined ? { allowOverwrite: opts.allowOverwrite } : {}),
      ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
    },
  );

  return {
    root: status.root,
    proposal,
    recordPath,
    written: result.written,
    collisions: result.collisions,
  };
}

/** Render the outcome as plain text. States plainly what was and was not done. */
export function renderApplyOutcome(outcome: ApplyOutcome, dryRun: boolean): string {
  const { proposal } = outcome;
  const lines = [
    `${dryRun ? '[dry-run] would record' : 'Recorded'} proposal "${proposal.requestId}" from ${proposal.agent}`,
    `  ${outcome.recordPath}`,
    '',
    `${proposal.items.length} item(s):`,
  ];

  for (const item of proposal.items) {
    lines.push(`  ${item.id}  ${item.status}  ${item.summary}`);
    if (item.rationale !== undefined) lines.push(`      why: ${item.rationale}`);
    for (const reference of item.references) lines.push(`      ref: ${reference}`);
  }

  lines.push(
    '',
    'Plan documents were NOT rewritten. An item states what should change, not a',
    'mechanical edit, so changing the plan stays a human decision — that is the',
    'invariant that keeps agent output out of canonical state.',
    '',
    'Work the accepted items with `npx planmo next --print`.',
  );

  return lines.join('\n');
}
