/**
 * Phase 09 E2E proof — run: node scripts/e2e-phase09.mjs (from repo root,
 * after `pnpm --filter @planmo/trace build`).
 *
 * Proves the trace/validate/doctor/drift engine end-to-end (no UI needed):
 * trace graph on the drift fixture, validate cross-document invariants,
 * doctor environment health, quality findings, debt, memory health,
 * standards drift + architecture fitness (lead-owned).
 */
let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
};

const trace = await import('../packages/trace/dist/index.js');
const { driftFixture, driftFixtureExpectedOrphans, driftFixtureExpectedMissingEvidence } =
  await import('../packages/trace/dist/fixtures/drift.js');

// 1. Trace graph on the drift fixture.
const graph = trace.createTraceGraphEngine().build(driftFixture);
check(
  'trace: orphan REQ-C flagged',
  driftFixtureExpectedOrphans.every((o) =>
    graph.diagnostics.some((d) => d.code === 'TRC-001' && d.target === o),
  ),
);
check(
  'trace: untested P03-01 flagged',
  driftFixtureExpectedMissingEvidence.every((t) =>
    graph.diagnostics.some((d) => d.code === 'TRC-002' && d.target === t),
  ),
);
check(
  'trace: deterministic codes + counts',
  graph.counts.requirements === 3 && graph.counts.tasks === 4,
);

// 2. Renderer.
const rendered = trace.traceRenderer().render(graph);
check(
  'render: header + counts + result',
  rendered.includes('TRACE REPORT -') &&
    rendered.includes('result: WARN') &&
    rendered.includes('counts: requirements=3'),
);

// 3. Validate — clean canonical workspace.
const validator = trace.validatorEngine();
const cleanValidation = validator.validate({
  state: {
    schemaVersion: 1,
    currentPhase: '09',
    status: 'planned',
    completedPhases: ['00', '01', '02', '03', '04', '05', '06', '07', '08'],
    blockedTasks: [],
  },
  documents: { state: '', tasks: '', manifest: '', handoff: '' },
  tasks: [],
});
check(
  'validate: clean canonical input → zero diagnostics',
  cleanValidation.diagnostics.length === 0,
);

// 4. Doctor — clean environment.
const doctor = trace.doctorEngine();
const cleanDoctor = doctor.check({
  nodeVersion: '24.11.0',
  packageManagerName: 'pnpm',
  gitWorktreeDirty: false,
  promptFilesMissing: 0,
});
check('doctor: clean env → zero diagnostics', cleanDoctor.diagnostics.length === 0);

// 5. Quality — no vanity score, findings only.
const quality = trace.qualityEngine();
const qualityResult = quality.analyze({ files: [], packages: {}, cycles: [] });
check(
  'quality: no score field',
  !('score' in qualityResult) && !('score' in Object(qualityResult)),
);
check('quality: clean input → zero findings', qualityResult.diagnostics.length === 0);

// 6. Debt — clean records.
const debt = trace.debtEngine();
const debtResult = debt.analyze({ records: [], doneTasks: [], currentPhase: '09' });
check('debt: clean → zero diagnostics', debtResult.diagnostics.length === 0);

// 7. Memory health — clean index.
const memory = trace.memoryHealthEngine();
const memResult = memory.analyze({ rows: [], currentHashes: {}, indexEntries: [] });
check(
  'memory: empty index → MEM-003 info only',
  memResult.diagnostics.every((d) => d.code === 'MEM-003'),
);

// 8. Standards drift — clean (declared == selected).
const drift = trace.standardsDriftEngine().analyze({
  declared: [
    { id: 's.one', class: 'language', precedence: 'global-default', rule: 'r', rationale: 'why' },
  ],
  selected: [
    { id: 's.one', class: 'language', precedence: 'global-default', rule: 'r', rationale: 'why' },
  ],
  knownClasses: ['language'],
});
check('standards drift: clean → zero diagnostics', drift.diagnostics.length === 0);

// 9. Architecture fitness — clean boundary.
const fitness = trace.fitnessEngine().evaluate({
  id: 'boundary',
  allowedEdges: { core: ['shared', 'schema'] },
  observedEdges: { core: ['shared'] },
});
check('fitness: clean boundary → zero violations', fitness.diagnostics.length === 0);

console.log(failures === 0 ? 'PHASE 09 E2E OK' : `PHASE 09 E2E FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
