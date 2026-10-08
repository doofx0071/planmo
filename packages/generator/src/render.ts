import type { OwnershipMode } from '@planmo/schema';
import { taskId } from '@planmo/shared';
import type { GeneratedArtifact, Renderer } from './contracts.js';
import type { PhaseNode, PlanningIR } from './ir.js';

/**
 * Planning document renderer (P05-02).
 *
 * Renders the canonical, depth-pruned planning documents from the frozen
 * IR: ROADMAP.md (phase spine with objectives), TRACKER.md (deterministic
 * phase status table), one phase document per IR phase under
 * `planning/phases/`, and the reusable handoff template under
 * `planning/handoffs/`. Pure and deterministic: identical IR always
 * produces byte-identical artifacts — no clocks, no randomness, no
 * filesystem access, and no absolute paths in content.
 */

/**
 * Deterministic artifact lineage: locked pack refs, standards pack sources,
 * then the IR input-hash marker, deduped in first-seen order. Shared by all
 * renderers so every artifact records the same provenance convention.
 */
export function artifactSources(ir: PlanningIR): readonly string[] {
  const sources: string[] = [];
  const seen = new Set<string>();
  for (const ref of [
    ...ir.lockedPacks.map((p) => p.ref),
    ...ir.standards.sources,
    `inputHash:${ir.inputHash}`,
  ]) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    sources.push(ref);
  }
  return sources;
}

function planningDocument(
  path: string,
  content: string,
  ownership: OwnershipMode,
  ir: PlanningIR,
): GeneratedArtifact {
  return {
    path,
    content,
    kind: 'planning-doc',
    ownership,
    sources: artifactSources(ir),
  };
}

/**
 * The seeded task rows for one phase, in id order.
 *
 * The generator cannot know the work a project needs, so it emits the four
 * workstreams the product's own definition of done names — implement,
 * test/evidence, docs/traceability, handoff. Every surface that lists tasks
 * (`tasks.csv`, the phase document, the tracker, the traceability matrix)
 * derives from this one function, so they cannot disagree. Ids follow
 * `P<NN>-<NN>` (docs/02-architecture/identifier-scheme.md).
 */
export function phaseTasks(phase: PhaseNode): Array<[string, string]> {
  return [
    [taskId(phase.id, 1), `Implement ${phase.objective}`],
    [taskId(phase.id, 2), 'Tests & evidence for the phase exit gates'],
    [taskId(phase.id, 3), `Docs & traceability for ${phase.title}`],
    [taskId(phase.id, 4), 'Record the phase handoff'],
  ];
}

/** ROADMAP.md — the full depth-pruned phase spine with objectives. */
function renderRoadmap(ir: PlanningIR): string {
  const lines: string[] = ['# Detailed Roadmap', ''];
  for (const phase of ir.phases) {
    lines.push(`## Phase ${phase.id} — ${phase.title}`, '', `${phase.objective}.`, '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** TRACKER.md — canonical task list pointer plus a deterministic phase table. */
function renderTracker(ir: PlanningIR): string {
  const lines: string[] = [
    '# Implementation Tracker',
    '',
    'Canonical task list: `planning/tasks.csv`.',
    '',
    'Statuses: TODO / IN_PROGRESS / BLOCKED / REVIEW / DONE.',
    '',
    `Phase mode: ${ir.phaseMode}.`,
    '',
    '| Phase | Title | Tasks | Status |',
    '|---|---|---|---|',
  ];
  for (const phase of ir.phases) {
    const tasks = phaseTasks(phase);
    const first = tasks[0]?.[0] ?? '';
    const last = tasks[tasks.length - 1]?.[0] ?? '';
    lines.push(`| ${phase.id} | ${phase.title} | ${first}–${last} (${tasks.length}) | TODO |`);
  }
  lines.push(
    '',
    'A task is DONE only after acceptance criteria, tests/evidence, docs, and traceability are satisfied.',
  );
  return `${lines.join('\n').trimEnd()}\n`;
}

/** phase-NN.md — one document per IR phase, following the repo house style. */
function renderPhaseDoc(phase: PhaseNode, ir: PlanningIR): string {
  const gates = ir.profile ? ir.profile.gates : ['unit tests', 'typecheck', 'lint', 'format:check'];
  const stopRule =
    ir.phaseMode === 'gated'
      ? `**HARD STOP after Phase ${phase.id}. Do not start another phase in this session.**`
      : `**Record the phase handoff at the phase boundary before starting the next phase.**`;
  const lines: string[] = [
    `# Phase ${phase.id} — ${phase.title}`,
    '',
    '## Objective',
    `${phase.objective}.`,
    '',
    '## Tasks',
    '| Task | Title | Status |',
    '|---|---|---|',
    ...phaseTasks(phase).map(([id, title]) => `| ${id} | ${title} | TODO |`),
    '',
    '## Phase mode',
    ir.phaseMode === 'gated'
      ? 'Phases are gated: each phase finishes with a recorded handoff before the next begins.'
      : 'Phases run continuously; a handoff is still recorded at every phase boundary.',
    '',
    '## Test & evidence gate',
  ];
  for (const gate of gates) lines.push(`- ${gate}`);
  lines.push(
    '',
    '## Exit gates',
    '- [ ] Generation is byte-stable for identical inputs.',
    '- [ ] Generated artifacts are recorded in `.planmo/manifest.json`.',
    '- [ ] Regeneration preserves user-owned content.',
    '',
    '## Required phase handoff',
    `Create \`planning/handoffs/phase-${phase.id}-handoff.md\` containing completed task IDs, task statuses and blockers, material changes, tests and evidence, security and reliability findings, decisions/ADRs, current Git state, known debt, and exact next-phase instructions.`,
    '',
    '## Stop rule',
    stopRule,
  );
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Handoff template — the repo's canonical `planning/handoffs/TEMPLATE.md`.
 * Seeded ownership: PlanMo creates the template once; the per-phase handoff
 * copies are user-owned and recorded under `planning/handoffs/phase-NN-handoff.md`.
 */
function renderHandoffTemplate(): string {
  return [
    '# Phase XX Handoff',
    '',
    '## Status',
    'COMPLETE / PARTIAL / BLOCKED',
    '',
    '## Completed tasks',
    '- ...',
    '',
    '## Remaining / blocked',
    '- Task:',
    '- Reason:',
    '- Exact unblock action:',
    '',
    '## Material changes',
    '- packages/files:',
    '- schemas/contracts:',
    '- migrations:',
    '',
    '## Tests & evidence',
    '| Command/Test | Result | Notes |',
    '|---|---|---|',
    '',
    '## Security / reliability findings',
    '- ...',
    '',
    '## Decisions / ADRs',
    '- ...',
    '',
    '## Git',
    '- Branch:',
    '- Commits:',
    '- PR:',
    '',
    '## Known debt',
    '- ...',
    '',
    '## Next phase',
    '- Phase:',
    '- Read first:',
    '- Preconditions:',
    '',
  ].join('\n');
}

/**
 * Render the planning document set for a compiled IR (P05-02). Artifacts are
 * returned in deterministic order: ROADMAP, TRACKER, one phase doc per IR
 * phase (spine order), then the handoff template.
 */
export const renderPlanningDocuments: Renderer = (ir) => {
  const artifacts: GeneratedArtifact[] = [
    planningDocument('planning/ROADMAP.md', renderRoadmap(ir), 'generated', ir),
    planningDocument('planning/TRACKER.md', renderTracker(ir), 'generated', ir),
  ];
  for (const phase of ir.phases) {
    artifacts.push(
      planningDocument(
        `planning/phases/phase-${phase.id}.md`,
        renderPhaseDoc(phase, ir),
        'generated',
        ir,
      ),
    );
  }
  artifacts.push(
    planningDocument('planning/handoffs/TEMPLATE.md', renderHandoffTemplate(), 'seeded', ir),
  );
  return artifacts;
};
