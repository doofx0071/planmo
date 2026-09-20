/**
 * Phase 08 E2E proof — run: node scripts/e2e-phase08.mjs (from repo root,
 * after `pnpm --filter @planmo/workflow build`).
 *
 * Proves the workflow/session engine end-to-end (all layers, no UI needed):
 * transition validation, handoff resume-sufficiency, planmo-next context
 * bundle, packet non-overlap, human gates, task DAG readiness, leases,
 * session-memory consolidation, change-engine lifecycle.
 */
import { transitionEngine, STANDARD_EXIT_GATES } from '../packages/workflow/dist/transition.js';
import { handoffBuilder } from '../packages/workflow/dist/handoff.js';
import { nextComposer } from '../packages/workflow/dist/next.js';
import { changeEngine } from '../packages/workflow/dist/change.js';

let failures = 0;
const check = (label, cond, extra = '') => {
  if (cond) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.log(`FAIL ${label} ${extra}`);
  }
};

// 1. Transitions (P08-01) — gates must pass before advancing.
const engine = transitionEngine();
const state = {
  schemaVersion: 1,
  currentPhase: '07',
  status: 'planned',
  completedPhases: ['00', '01', '02', '03', '04', '05', '06'],
  blockedTasks: [],
  nextPrompt: 'prompts/08-phase-07-frontend-design-engine.md',
};
const red = engine.advance(state, '08', [{ name: 'tests', phase: '07', passed: false }]);
check('transition blocked on red gate', !red.ok, red.ok ? '' : red.reason);
const green = engine.advance(
  state,
  '08',
  STANDARD_EXIT_GATES.map((n) => ({ name: n, phase: '07', passed: true })),
);
check('transition advances on green gates', green.ok && green.next.currentPhase === '08');

// 2. Handoff (P08-02) — schema-valid + resume-sufficient.
const hb = handoffBuilder();
const handoff = hb.build({
  phase: '07',
  status: 'COMPLETE',
  completedTasks: ['P07-01', 'P07-02', 'P07-03'],
  materialChanges: ['packages/design-engine', 'packages/schema'],
  decisions: ['ADR-0021'],
  testsRun: [{ command: 'pnpm run check', result: 'PASS' }],
  nextPhase: '08',
  instructions: ['Read the phase prompt.'],
});
check('handoff schema-valid + resume-sufficient', hb.missingForResume(handoff).length === 0);

// 3. planmo next (P08-03 + P08-10) — token-budgeted context bundle.
const nc = nextComposer();
const session = nc.compose({
  state,
  nextPromptText: '# Prompt\nInstructions.',
  budgetTokens: 2000,
});
check(
  'next directive + budgeted bundle',
  session.phase === '07' &&
    session.bundle.estimatedTokens > 0 &&
    session.bundle.l0Capsule.length > 0,
);

// 4. Change engine (P08-11) — new/apply/archive with deltas.
const ce = changeEngine();
const made = ce.newChange({
  id: 'CHG-002',
  slug: 'e2e',
  proposal: 'e2e proof',
  requirementDeltas: [{ kind: 'ADDED', requirementId: 'REQ-E2E', detail: 'e2e' }],
});
check('change new (proposed)', made.ok && made.change?.status === 'proposed');
if (made.ok && made.change) {
  const applied = ce.apply(made.change, 'ACCEPTED: e2e');
  check(
    'change apply (applied + decision)',
    applied.ok &&
      applied.change?.status === 'applied' &&
      applied.change?.decision === 'ACCEPTED: e2e',
  );
  if (applied.ok && applied.change) {
    const archived = ce.archive(applied.change);
    check('change archive (archived)', archived.ok && archived.change?.status === 'archived');
  }
}

// 5. Worker surfaces (P08-04/05/06/07/08/09) — dynamic import after build.
const dag = await import('../packages/workflow/dist/task-dag.js')
  .then((m) => m.createTaskDag())
  .catch(() => undefined);
const packets = await import('../packages/workflow/dist/packets.js')
  .then((m) => m.packetCompiler())
  .catch(() => undefined);
const gates = await import('../packages/workflow/dist/gates.js')
  .then((m) => m.gateEvaluator())
  .catch(() => undefined);
const leases = await import('../packages/workflow/dist/leases.js')
  .then((m) => m.leaseManager(() => 2000))
  .catch(() => undefined);
const consolidator = await import('../packages/workflow/dist/consolidate.js')
  .then((m) => m.memoryConsolidator())
  .catch(() => undefined);

if (!dag || !packets || !gates || !leases || !consolidator) {
  check('worker modules built', false, 'missing dist modules (workers not integrated yet)');
} else {
  // DAG (P08-06)
  const nodes = [
    { id: 'P08-01', status: 'DONE' },
    { id: 'P08-02', status: 'DONE', dependencies: ['P08-01'] },
    { id: 'P08-03', status: 'TODO', dependencies: ['P08-01', 'P08-02'] },
    { id: 'P08-04', status: 'TODO', dependencies: ['P08-03'] },
  ];
  check('DAG ready set', dag.ready(nodes).join(',') === 'P08-03');
  check('DAG acyclic', dag.cycles(nodes).length === 0);
  check(
    'DAG topological',
    (() => {
      const ids = dag.ordered(nodes).map((n) => n.id);
      const pos = Object.fromEntries(ids.map((id, i) => [id, i]));
      return (
        pos['P08-01'] < pos['P08-02'] &&
        pos['P08-02'] < pos['P08-03'] &&
        pos['P08-03'] < pos['P08-04']
      );
    })(),
  );

  // Packets (P08-04)
  const pk = packets.compile({
    taskIds: ['P08-01', 'P08-02'],
    ownership: [
      { owner: 'worker-a', paths: ['packages/workflow/src/task-dag.ts'] },
      { owner: 'worker-b', paths: ['packages/workflow/src/leases.ts'] },
    ],
  });
  check(
    'packets non-overlapping + schema-valid',
    pk.length === 2 &&
      pk.every((p) => p.status === 'planned') &&
      new Set(pk.map((p) => p.id)).size === 2,
  );

  // Gates (P08-05)
  const verdicts = gates.evaluate(
    [
      { id: 'g-tests', phase: '08', requirement: 'tests pass' },
      { id: 'g-human', phase: '08', requirement: 'human ok', humanApproval: true },
    ],
    { phase: '08', approvals: { 'g-tests': true } },
  );
  check(
    'gate auto-pass + human block',
    verdicts.find((v) => v.gate === 'g-tests')?.passed === true &&
      verdicts.find((v) => v.gate === 'g-human')?.passed === false,
  );

  // Leases (P08-07)
  const l = leases.claim({
    claimant: 'worker-a',
    taskId: 'P08-01',
    acquiredAt: 1000,
    expiresAt: 1500,
    branch: 'feat/x',
    paths: ['packages/workflow/src/task-dag.ts'],
  });
  check('lease claimed', l.ok === true);
  check(
    'lease expiry via injected time',
    leases.expired('P08-01').length === 1 && leases.activeFor('P08-01').length === 0,
  );

  // Consolidation (P08-09)
  const rows = consolidator.consolidate(handoff, { sessionId: 's1', now: 1234 });
  check(
    'consolidation maps handoff',
    rows.length >= 3 &&
      rows.every((r) => r.capturedAt === 1234) &&
      rows.every((r) => r.provenance.length > 0),
  );
}

console.log(failures === 0 ? 'PHASE 08 E2E OK' : `PHASE 08 E2E FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
