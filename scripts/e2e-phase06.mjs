/**
 * Phase 06 E2E proof — run: node scripts/e2e-phase06.mjs (from repo root).
 *
 * Proves the agent bridge end-to-end WITHOUT any real CLI execution:
 *   1. register all four adapters (generic, opencode, codex, claude-code);
 *   2. compile a context bundle from canonical source text;
 *   3. render an invocation per adapter (deterministic argv + prompt);
 *   4. validate a well-formed AI proposal → ok;
 *   5. reject a malformed proposal → diagnostics, nothing applied;
 *   6. re-render → byte-identical (determinism exit gate).
 */
import { createRegistry } from '../packages/agent-bridge/dist/index.js';
import { createContextProvider } from '../packages/agent-bridge/dist/index.js';
import { validateProposal } from '../packages/agent-bridge/dist/index.js';
import {
  genericAdapter,
  opencodeAdapter,
  codexAdapter,
  claudeCodeAdapter,
} from '../packages/adapters/dist/index.js';

const registry = createRegistry();
for (const adapter of [genericAdapter, opencodeAdapter, codexAdapter, claudeCodeAdapter]) {
  registry.register(adapter);
}

const provider = createContextProvider(async (contextId) => ({
  project: 'planmo-e2e',
  contextId,
  capsule: 'phase 06 agent bridge; branch feat/phase-06-agent-bridge; blockers: none',
  indexEntries: [
    'ADR-0008: v1 agents opencode/claude-code/generic; codex is extension',
    'REQ-CTX-001..005: token-budgeted context bundles',
    'REQ-STD-001..004: standards injector',
    'REQ-MEM-001..010: memory authority',
  ],
  evidenceEntries: ['AiProposalSchema is strict; unknown keys fail validation'],
  retrievalHandles: [
    'docs/12-adrs/ADR-0008-initial-supported-agents-platforms-styles.md',
    'planning/TRACKER.md',
  ],
}));

const bundle = await provider.compile('phase-06');
const standards = [
  { id: 'sec-basic', precedence: 'security', rule: 'No secrets in the repository.' },
  {
    id: 'det-core',
    precedence: 'explicit-project-policy',
    rule: 'Deterministic core works without an LLM API key.',
  },
];
const request = {
  task: 'Implement the agent capability registry and validate AI proposals',
  context: bundle,
  standards,
  packet: {
    id: 'pk-06-01',
    taskId: 'P06-01',
    title: 'Agent capability registry',
    scope: 'packages/agent-bridge/src/registry.ts',
    inputs: ['docs/12-adrs/ADR-0008-*.md'],
    outputs: ['packages/agent-bridge/dist/'],
    dependencies: ['@planmo/adapters'],
    status: 'in-progress',
  },
  root: 'C:/Users/Damascus/Videos/clel/planmo',
  requested: { supportsStructuredOutput: true, supportsContextFiles: true },
};

console.log('registered adapters:', registry.ids().join(', '));

for (const id of registry.ids()) {
  const invocation = registry.render(id, request);
  if (!invocation) throw new Error(`no invocation for ${id}`);
  const head = invocation.argv.slice(0, 3).join(' ');
  console.log(
    `  ${id}: argv=[${head}...${invocation.argv.length > 3 ? ` +${invocation.argv.length - 3}` : ''}] argvLen=${invocation.argv.length} promptLen=${invocation.prompt.length}`,
  );
}

const good = validateProposal({
  schemaVersion: 1,
  agent: 'opencode',
  requestId: 'P06-06',
  items: [
    { id: 'ap-1', status: 'proposed', summary: 'Add AiProposalSchema to @planmo/schema' },
    { id: 'ap-2', status: 'proposed', summary: 'Wire registry in agent-bridge index' },
  ],
});
if (!good.ok) throw new Error(`valid proposal rejected: ${JSON.stringify(good)}`);

const bad = validateProposal({ schemaVersion: 1, agent: 'opencode', items: [] });
if (bad.ok) throw new Error('malformed proposal accepted — validation gate broken');
console.log(
  'proposal gate: valid accepted, malformed rejected with',
  bad.errors.length,
  'diagnostic(s)',
);

const again = registry.render('opencode', request);
if (!again || again.prompt !== registry.render('opencode', request)?.prompt) {
  throw new Error('non-deterministic render detected');
}
console.log(
  'determinism: re-render byte-identical; generic argv empty (prompt = output) =>',
  registry.render('generic', request)?.argv.length === 0,
);
console.log('PHASE 06 E2E OK');
