import type {
  AdapterCapabilities,
  AgentAdapter,
  AgentInvocation,
  AgentRequest,
  CapabilityDegradation,
} from './contract.js';

/**
 * Generic adapter (P06-02).
 *
 * The agent-neutral adapter that ALWAYS works without a proprietary agent
 * (exit gate: "generic prompt output always works without a proprietary
 * agent"). It renders a complete, self-contained prompt — task, context
 * bundle, standards, execution packet — as its output; argv is empty.
 *
 * Pure and deterministic: rendering never executes a CLI, never reads the
 * filesystem, and emits no timestamps or randomness.
 */

export const GENERIC_ADAPTER_ID = 'generic' as const;

/** Fixed iteration order for degradation checks — deterministic output. */
const CAPABILITY_ORDER: readonly (keyof AdapterCapabilities)[] = [
  'supportsStructuredOutput',
  'supportsContextFiles',
  'supportsResume',
  'supportsInlineContext',
];

const CAPABILITIES: AdapterCapabilities = {
  supportsStructuredOutput: false,
  supportsContextFiles: false,
  supportsResume: false,
  supportsInlineContext: true,
};

/** Deterministic copy (never mutates the caller's array). */
function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

/** Render the full agent-neutral prompt (context bundle fully inline). */
function renderPrompt(
  request: AgentRequest,
  degradations: readonly CapabilityDegradation[],
): string {
  const { task, context, standards, packet } = request;
  const lines: string[] = [
    'You are executing a PlanMo task as the generic agent-neutral adapter.',
    'No proprietary agent, tool, or CLI is required: respond with the complete',
    'outcome directly in this message.',
    '',
    '# Task',
    task,
    '',
    '# Project context',
    `Project: ${context.project}`,
    `Context id: ${context.contextId}`,
    `Context capsule (L0): ${context.l0Capsule}`,
    `Context index (L1): ${context.l1Index}`,
    `Evidence (L2): ${context.l2Evidence}`,
    `Estimated context tokens: ${context.estimatedTokens}`,
    `Retrieval handles: ${sorted(context.retrievalHandles).join(', ')}`,
  ];

  if (standards.length > 0) {
    const ordered = [...standards].sort((a, b) => a.id.localeCompare(b.id));
    lines.push('', '# Selected standards');
    for (const standard of ordered) {
      lines.push(`- \`${standard.id}\` [${standard.precedence}]: ${standard.rule}`);
      if (standard.rationale !== undefined) {
        lines.push(`  Rationale: ${standard.rationale}`);
      }
      if (standard.references !== undefined && standard.references.length > 0) {
        lines.push(`  References: ${sorted(standard.references).join(', ')}`);
      }
    }
  }

  if (packet !== undefined) {
    lines.push(
      '',
      '# Execution packet',
      `Task id: ${packet.taskId}`,
      `Title: ${packet.title}`,
      `Scope: ${packet.scope}`,
      `Inputs: ${sorted(packet.inputs).join(', ')}`,
      `Outputs: ${sorted(packet.outputs).join(', ')}`,
      `Dependencies: ${sorted(packet.dependencies).join(', ')}`,
      `Status: ${packet.status}`,
    );
  }

  if (degradations.length > 0) {
    lines.push('', '# Capability notes');
    for (const degradation of degradations) {
      lines.push(`- ${degradation.capability}: ${degradation.note}`);
    }
  }

  lines.push(
    '',
    '# Report',
    'Summarize what you changed and why, and list every file you created or',
    'modified. Plain text is fine; no JSON output is required.',
  );

  return lines.join('\n');
}

/** PlanMo's generic agent-neutral adapter. */
export const genericAdapter: AgentAdapter = {
  id: GENERIC_ADAPTER_ID,
  capabilities: CAPABILITIES,
  render(request: AgentRequest): AgentInvocation {
    const degradations = this.degradations(request.requested);
    const prompt = renderPrompt(request, degradations);
    return {
      adapter: GENERIC_ADAPTER_ID,
      // argv empty: the prompt IS the output (agent-neutral).
      argv: [],
      cwd: request.root,
      prompt,
      allowedPaths: [],
      structuredOutput: null,
    };
  },
  degradations(request: Partial<AdapterCapabilities>): CapabilityDegradation[] {
    const notes: Record<keyof AdapterCapabilities, string> = {
      supportsStructuredOutput:
        'the generic adapter emits plain text; structured JSON output is not enforced.',
      supportsContextFiles:
        'the generic adapter has no file-attach mechanism; context is passed inline in the prompt.',
      supportsResume: 'the generic adapter is stateless; sessions cannot be resumed by id.',
      supportsInlineContext: '',
    };
    const out: CapabilityDegradation[] = [];
    for (const capability of CAPABILITY_ORDER) {
      if (request[capability] === true && !CAPABILITIES[capability]) {
        out.push({ capability, note: notes[capability] });
      }
    }
    return out.sort((a, b) => a.capability.localeCompare(b.capability));
  },
};
