import type {
  AdapterCapabilities,
  AgentAdapter,
  AgentInvocation,
  AgentRequest,
  CapabilityDegradation,
} from './contract.js';

/**
 * OpenCode adapter (P06-03).
 *
 * CLI surface (pinned in Phase 06 from the verified opencode skill):
 *   opencode run '<prompt>' [--format json] [-f <file>...] [-c]
 * - `run` runs the one-shot task non-interactively and exits when done.
 * - `--format json` requests machine-readable output when the caller asked
 *   for structured output (requested.supportsStructuredOutput).
 * - `-f/--file` attaches context files the caller asked to attach
 *   (requested.supportsContextFiles) — one flag per retrieval handle.
 * - `-c/--continue` resumes the last session when the caller asked for it
 *   (requested.supportsResume).
 *
 * Flags are added ONLY when requested; requested-but-unsupported capabilities
 * degrade explicitly through `degradations()`. Argv is assembled in a
 * deterministic order (flags after the prompt, in the pinned order above).
 *
 * Pure and deterministic: rendering never executes the CLI, never reads the
 * filesystem, and emits no timestamps or randomness.
 */

export const OPENCODE_ADAPTER_ID = 'opencode' as const;

/** Fixed iteration order for degradation checks — deterministic output. */
const CAPABILITY_ORDER: readonly (keyof AdapterCapabilities)[] = [
  'supportsStructuredOutput',
  'supportsContextFiles',
  'supportsResume',
  'supportsInlineContext',
];

const CAPABILITIES: AdapterCapabilities = {
  supportsStructuredOutput: true,
  supportsContextFiles: true,
  supportsResume: true,
  supportsInlineContext: true,
};

/** Deterministic copy (never mutates the caller's array). */
function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

/** Render the full prompt handed to OpenCode (context bundle fully inline). */
function renderPrompt(request: AgentRequest): string {
  const { task, context, standards, packet } = request;
  const lines: string[] = [
    'You are executing a PlanMo task (adapter: opencode). Follow the task and the',
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

/** PlanMo's configured OpenCode CLI adapter. */
export const opencodeAdapter: AgentAdapter = {
  id: OPENCODE_ADAPTER_ID,
  capabilities: CAPABILITIES,
  render(request: AgentRequest): AgentInvocation {
    const prompt = renderPrompt(request);
    const argv: string[] = ['opencode', 'run', prompt];

    // Flags are request-driven in a pinned order (deterministic argv).
    if (request.requested.supportsStructuredOutput === true) {
      argv.push('--format', 'json');
    }
    if (request.requested.supportsContextFiles === true) {
      for (const handle of sorted(request.context.retrievalHandles)) {
        argv.push('-f', handle);
      }
    }
    if (request.requested.supportsResume === true) {
      argv.push('-c');
    }

    return {
      adapter: OPENCODE_ADAPTER_ID,
      argv,
      cwd: request.root,
      prompt,
      // OpenCode runs inside cwd; retrieval handles are attached as files.
      allowedPaths: request.requested.supportsContextFiles
        ? sorted(request.context.retrievalHandles)
        : [],
      structuredOutput: request.requested.supportsStructuredOutput === true ? 'json' : null,
    };
  },
  degradations(request: Partial<AdapterCapabilities>): CapabilityDegradation[] {
    const notes: Record<keyof AdapterCapabilities, string> = {
      supportsStructuredOutput: '',
      supportsContextFiles: '',
      supportsResume: '',
      supportsInlineContext:
        'opencode receives context inline in the prompt; an attach flag is not requested separately.',
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
