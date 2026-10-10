import type { OwnershipMode, TaskRecord } from '@planmo/schema';
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

/** End a sentence with exactly one full stop. Objectives already carry one. */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * The gates a phase exit requires when the profile declares none. Mirrors the
 * fallback `renderPhaseDoc` uses, so the document and the records agree.
 */
export const DEFAULT_GATE_CHECKS = ['unit tests', 'typecheck', 'lint', 'format:check'] as const;

/**
 * A criterion must not contain `;` — `tasks.csv` joins criteria with `;` inside
 * one RFC 4180 cell, so a semicolon would split one criterion into two on read.
 * The generator guarantees this for derived text rather than trusting it, and a
 * test asserts the invariant across every generated workspace.
 */
function criterion(text: string): string {
  return text.replaceAll(';', ',');
}

/**
 * The four seed tasks for a phase, as full task records (schema v2).
 *
 * The generator cannot know the work a project needs, so it emits the four
 * workstreams the product's own definition of done names — implement,
 * test/evidence, docs/traceability, handoff — now carrying acceptance criteria
 * and a verification policy derived from what it DOES know: the phase objective,
 * the phase document, and the profile's exit gates.
 *
 * This is a deterministic FLOOR, not task decomposition. It gives every task at
 * least one checkable criterion and marks the gate-bearing tasks
 * `verification.required`, which is what makes "verified" mechanically different
 * from "reported complete". Raising this to real, project-specific criteria is
 * the AI planner's job, not this function's.
 *
 * Every surface that lists tasks (`tasks.csv`, the phase document, the tracker,
 * the traceability matrix, TEST-EVIDENCE.csv) derives from this one function, so
 * they cannot disagree. Ids follow `P<NN>-<NN>`
 * (docs/02-architecture/identifier-scheme.md).
 */
export function phaseTasks(
  phase: PhaseNode,
  gates: readonly string[] = DEFAULT_GATE_CHECKS,
): TaskRecord[] {
  const checks = [...gates];
  const phaseDoc = `planning/phases/phase-${phase.id}.md`;
  return [
    {
      id: taskId(phase.id, 1),
      phase: phase.id,
      // The objective is already an imperative sentence ("Implement init, safe
      // filesystem writer…"), so it is used verbatim — prefixing it produced
      // "Implement Implement init…".
      title: phase.objective,
      status: 'TODO',
      priority: 'MUST',
      acceptance: [
        criterion(`The phase objective is met: ${sentence(phase.objective)}`),
        criterion(`Every exit gate named in ${phaseDoc} passes`),
      ],
      verification: { required: true, checks },
    },
    {
      id: taskId(phase.id, 2),
      phase: phase.id,
      title: 'Tests & evidence for the phase exit gates',
      status: 'TODO',
      priority: 'MUST',
      acceptance: [
        'Each exit gate has a recorded result in planning/testing/TEST-EVIDENCE.csv',
        'Any check that was not run is marked as not run, not left blank',
      ],
      verification: { required: true, checks },
    },
    {
      id: taskId(phase.id, 3),
      phase: phase.id,
      title: `Docs & traceability for ${phase.title}`,
      status: 'TODO',
      priority: 'SHOULD',
      acceptance: [
        criterion(
          `planning/TRACKER.md and planning/REQUIREMENTS-TRACEABILITY.md reflect phase ${phase.id}`,
        ),
      ],
      verification: { required: false, checks: ['docs updated'] },
    },
    {
      id: taskId(phase.id, 4),
      phase: phase.id,
      title: 'Record the phase handoff',
      status: 'TODO',
      priority: 'SHOULD',
      acceptance: [
        criterion(
          `planning/handoffs/phase-${phase.id}-handoff.md is recorded and names the next phase`,
        ),
      ],
      verification: { required: false, checks: ['handoff recorded'] },
    },
  ];
}

/**
 * The tasks for a phase: the plan's own when the project has a plan covering it,
 * otherwise the deterministic seed.
 *
 * One function, so every surface — `tasks.csv`, the phase document, the tracker,
 * the traceability matrix and the evidence file — still derives from a single
 * definition and cannot disagree. A plan replaces the seed for the phases it
 * covers, and only those.
 *
 * `PlanTask.requirements` is deliberately not carried into the task record: the
 * plan document is the canonical home for requirement references, and duplicating
 * them into `tasks.csv` would create two sources that can drift. The references
 * are validated when the plan is written (`PLN-007`).
 */
export function tasksForPhase(ir: PlanningIR, phase: PhaseNode): TaskRecord[] {
  const planned = ir.plan?.phases.find((candidate) => candidate.id === phase.id);
  if (planned === undefined) return phaseTasks(phase, ir.profile?.gates);
  return planned.tasks.map((task) => ({
    id: task.id,
    phase: phase.id,
    title: task.title,
    status: 'TODO',
    priority: task.priority,
    acceptance: [...task.acceptance],
    verification: {
      required: task.verification.required,
      checks: [...task.verification.checks],
    },
  }));
}

/** ROADMAP.md — the full depth-pruned phase spine with objectives. */
function renderRoadmap(ir: PlanningIR): string {
  const lines: string[] = ['# Detailed Roadmap', ''];
  for (const phase of ir.phases) {
    lines.push(`## Phase ${phase.id} — ${phase.title}`, '', sentence(phase.objective), '');
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
    const tasks = tasksForPhase(ir, phase);
    const first = tasks[0]?.id ?? '';
    const last = tasks[tasks.length - 1]?.id ?? '';
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
  const gates = ir.profile ? ir.profile.gates : [...DEFAULT_GATE_CHECKS];
  const tasks: TaskRecord[] = tasksForPhase(ir, phase);
  const stopRule =
    ir.phaseMode === 'gated'
      ? `**HARD STOP after Phase ${phase.id}. Do not start another phase in this session.**`
      : `**Record the phase handoff at the phase boundary before starting the next phase.**`;
  const lines: string[] = [
    `# Phase ${phase.id} — ${phase.title}`,
    '',
    '## Objective',
    sentence(phase.objective),
    '',
    '## Tasks',
    '| Task | Title | Priority | Status |',
    '|---|---|---|---|',
    ...tasks.map((task) => `| ${task.id} | ${task.title} | ${task.priority} | ${task.status} |`),
    '',
    '### Acceptance criteria',
    '',
    'A task is DONE only when every criterion below holds. A task whose verification',
    'is `required` also needs a recorded result in `planning/testing/TEST-EVIDENCE.csv`.',
  ];
  for (const task of tasks) {
    lines.push(
      '',
      `**${task.id}** — verification ${task.verification.required ? '**required**' : 'optional'}`,
    );
    for (const item of task.acceptance) lines.push(`- [ ] ${item}`);
  }
  lines.push(
    '',
    '## Phase mode',
    ir.phaseMode === 'gated'
      ? 'Phases are gated: each phase finishes with a recorded handoff before the next begins.'
      : 'Phases run continuously; a handoff is still recorded at every phase boundary.',
    '',
    '## Test & evidence gate',
  );
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
