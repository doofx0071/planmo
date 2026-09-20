import type {
  AdapterCapabilities,
  AgentAdapter,
  AgentInvocation,
  AgentRequest,
  CapabilityDegradation,
} from './contract.js';

/**
 * Codex adapter (P06-04).
 *
 * EXTENSION adapter: the Codex CLI is NOT a v1-primary target (ADR-0008
 * "Codex CLI is explicitly not targeted in v1"; see also
 * docs/11-research/support-matrix.md). It still implements the full
 * AgentAdapter contract so the bridge can drive it like any other agent —
 * the generic contract allows adding adapters without architecture change.
 *
 * CLI surface (pinned in Phase 06 from the verified codex skill):
 *   codex exec '<prompt>' --sandbox workspace-write
 * - `exec` runs the one-shot task non-interactively and exits when done.
 * - `--sandbox workspace-write` is auto-approve mode: Codex may write
 *   anywhere inside the workspace (cwd) without prompting. PlanMo workflows
 *   are non-interactive (session-model.md: one fresh session per phase), so
 *   auto-approve within the workspace sandbox is the standard mode; the
 *   sandbox keeps the agent from touching anything outside the workspace.
 *   The contract has no approval toggle, so the flag is unconditional.
 * - No structured output: `exec` prints prose. `structuredOutput` is null
 *   and a requested `supportsStructuredOutput` degrades explicitly.
 * - No context-file attach and no session resume in this surface: the
 *   context bundle is passed inline in the prompt.
 *
 * Pure and deterministic: rendering never executes the CLI, never reads the
 * filesystem, and emits no timestamps or randomness.
 */

export const CODEX_ADAPTER_ID = 'codex' as const;

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

/** Render the full prompt handed to Codex (context bundle fully inline). */
function renderPrompt(request: AgentRequest): string {
  const { task, context, standards, packet } = request;
  const lines: string[] = [
    'You are executing a PlanMo task (adapter: codex). Follow the task and the',
    'selected standards exactly; do not change the canonical meaning of the project.',
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

  lines.push(
    '',
    '# Report',
    'Summarize what you changed and why, and list every file you created or',
    'modified. Plain text only; no JSON output is required.',
  );

  return lines.join('\n');
}

/** PlanMo's driven Codex CLI configuration. */
export const codexAdapter: AgentAdapter = {
  id: CODEX_ADAPTER_ID,
  capabilities: CAPABILITIES,
  render(request: AgentRequest): AgentInvocation {
    const prompt = renderPrompt(request);
    return {
      adapter: CODEX_ADAPTER_ID,
      // `--sandbox workspace-write` = sandboxed auto-approve mode.
      argv: ['codex', 'exec', prompt, '--sandbox', 'workspace-write'],
      // The workspace root doubles as cwd; the sandbox is scoped to it, so
      // no additional allowed paths are needed ([] means cwd-scoped).
      cwd: request.root,
      prompt,
      allowedPaths: [],
      structuredOutput: null,
    };
  },
  degradations(request: Partial<AdapterCapabilities>): CapabilityDegradation[] {
    const notes: Record<keyof AdapterCapabilities, string> = {
      supportsStructuredOutput:
        'codex exec prints plain text; structured JSON output is not part of this surface.',
      supportsContextFiles:
        'codex exec has no file-attach flag in this surface; context is passed inline in the prompt.',
      supportsResume: 'codex exec one-shot sessions cannot be resumed by id in this surface.',
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
