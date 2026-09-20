import type {
  AdapterCapabilities,
  AgentAdapter,
  AgentInvocation,
  AgentRequest,
  CapabilityDegradation,
} from './contract.js';

/**
 * Claude Code adapter (P06-05).
 *
 * v1-primary target (ADR-0008; docs/11-research/support-matrix.md).
 *
 * CLI surface (pinned in Phase 06 from the verified claude-code skill):
 *   claude -p '<prompt>' --output-format json --allowedTools <tools> --max-turns <n>
 * - `-p` runs the one-shot (print) mode non-interactively.
 * - `--output-format json` requests machine-readable output; the prompt
 *   instructs the agent to emit exactly one AiProposal-shaped JSON object
 *   (fields mirror packages/schema AiProposalSchema; the bridge
 *   schema-validates the result BEFORE any state change — the adapter never
 *   imports the schema package, per the boundary graph).
 * - `--allowedTools` bounds the agent to a fixed, deterministic tool set.
 * - `--max-turns` bounds each run so one task cannot loop forever.
 * - Resume flags (`--continue`/`--resume`) are NOT emitted: PlanMo defaults
 *   to one fresh session per phase (session-model.md) and AgentRequest
 *   carries no session id, so resume degrades explicitly when requested.
 * - No context-file attach flag in this surface: the context bundle is
 *   passed inline in the prompt.
 *
 * Pure and deterministic: rendering never executes the CLI, never reads the
 * filesystem, and emits no timestamps or randomness.
 */

export const CLAUDE_CODE_ADAPTER_ID = 'claude-code' as const;

/** Fixed, deterministic tool allowlist (sorted; space-joined for the flag). */
const ALLOWED_TOOLS: readonly string[] = ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write'];

/** Turn cap so a single task cannot run unbounded. */
const MAX_TURNS = 40;

/** Fixed iteration order for degradation checks — deterministic output. */
const CAPABILITY_ORDER: readonly (keyof AdapterCapabilities)[] = [
  'supportsStructuredOutput',
  'supportsContextFiles',
  'supportsResume',
  'supportsInlineContext',
];

const CAPABILITIES: AdapterCapabilities = {
  supportsStructuredOutput: true,
  supportsContextFiles: false,
  supportsResume: false,
  supportsInlineContext: true,
};

/** Deterministic copy (never mutates the caller's array). */
function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

/** Render the full prompt handed to Claude Code (context bundle inline). */
function renderPrompt(request: AgentRequest): string {
  const { task, context, standards, packet } = request;
  const lines: string[] = [
    'You are executing a PlanMo task (adapter: claude-code). Follow the task and the',
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
    '# Output format (JSON only)',
    'Reply with exactly one JSON object matching this shape — no prose before',
    'or after it, no markdown fences:',
    '{',
    '  "schemaVersion": 1,',
    '  "agent": "claude-code",',
    '  "requestId": "<context id here>",',
    '  "items": [',
    '    {',
    '      "id": "<stable short id>",',
    '      "summary": "<what changes and why>",',
    '      "rationale": "<why this is the right change (optional)>",',
    '      "references": ["<requirement or packet refs>"]',
    '    }',
    '  ]',
    '}',
    '',
    'Items are DELTAS describing proposed changes, never commands. The PlanMo',
    'bridge schema-validates this object and rejects anything that does not',
    'match the shape exactly.',
  );

  return lines.join('\n');
}

/** PlanMo's driven Claude Code CLI configuration. */
export const claudeCodeAdapter: AgentAdapter = {
  id: CLAUDE_CODE_ADAPTER_ID,
  capabilities: CAPABILITIES,
  render(request: AgentRequest): AgentInvocation {
    const prompt = renderPrompt(request);
    return {
      adapter: CLAUDE_CODE_ADAPTER_ID,
      argv: [
        'claude',
        '-p',
        prompt,
        '--output-format',
        'json',
        '--allowedTools',
        [...ALLOWED_TOOLS].sort().join(' '),
        '--max-turns',
        String(MAX_TURNS),
      ],
      // The workspace root doubles as cwd; permitted access is cwd-scoped,
      // so no additional allowed paths are needed ([] means cwd-scoped).
      cwd: request.root,
      prompt,
      allowedPaths: [],
      structuredOutput: 'json',
    };
  },
  degradations(request: Partial<AdapterCapabilities>): CapabilityDegradation[] {
    const notes: Record<keyof AdapterCapabilities, string> = {
      supportsStructuredOutput: '',
      supportsContextFiles:
        'claude -p passes the context bundle inline in the prompt; no file-attach flag is used in this surface.',
      supportsResume:
        'PlanMo defaults to one fresh session per phase (session-model.md) and AgentRequest carries no session id; claude -p resume flags are not emitted.',
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
