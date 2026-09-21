import type { TraceInput } from '../contracts.js';

/**
 * P09-05 canonical drift/orphan diagnostics fixtures.
 *
 * A deliberately imperfect input: one orphaned requirement, one untested task,
 * one DONE task lacking evidence, one stale (non-DONE) task with evidence, and
 * a decision linked to nothing. Mirrors the exit-gate shapes:
 * "Orphaned requirements, stale tasks and missing test evidence are
 * diagnosable."
 */

export const driftFixture: TraceInput = {
  requirements: ['REQ-A', 'REQ-B', 'REQ-C'],
  tasks: [
    { id: 'P01-01', phase: '01', title: 'Repo setup', status: 'DONE' },
    { id: 'P01-02', phase: '01', title: 'Pack scaffolding', status: 'DONE' },
    { id: 'P02-01', phase: '02', title: 'Canonical model', status: 'DONE' },
    { id: 'P03-01', phase: '03', title: 'CLI foundation', status: 'IN_PROGRESS' },
  ],
  decisions: ['ADR-0001', 'ADR-0009'],
  tests: [
    { name: 'repo creates workspace', file: 'init.test.ts', task: 'P01-01', passing: true },
    { name: 'packs resolve', file: 'packs.test.ts', task: 'P01-02', passing: true },
    { name: 'model round-trips', file: 'project.test.ts', task: 'P02-01', passing: true },
    // P03-01 has a stale test that fails — evidence exists but is red.
    { name: 'cli claps back', file: 'cli.test.ts', task: 'P03-01', passing: false },
  ],
  links: [
    { from: 'REQ-A', to: 'P01-01' },
    { from: 'REQ-B', to: 'P01-02' },
    // REQ-C has no link (orphan).
  ],
};

/** Expected orphan set for the fixture. */
export const driftFixtureExpectedOrphans = ['REQ-C'];
/** Expected untested tasks (no test row at all). */
export const driftFixtureExpectedUntested: string[] = [];
/** Expected missing evidence (DONE tasks with no PASSING test). */
export const driftFixtureExpectedMissingEvidence = ['P03-01'];
