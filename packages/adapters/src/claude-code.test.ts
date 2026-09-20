import { describe, expect, it } from 'vitest';
import type { AgentRequest } from './contract.js';
import { claudeCodeAdapter } from './claude-code.js';

function baseRequest(): AgentRequest {
  return {
    task: 'Author the phase-06 handoff with exact command results.',
    context: {
      project: 'acme-web',
      contextId: 'phase-06',
      l0Capsule: 'Acme web; bridge phase; blockers: none.',
      l1Index: 'REQ-AGENT-001; ADR-0008; standards: agent.deps.',
      l2Evidence: '',
      estimatedTokens: 900,
      retrievalHandles: ['planning/TRACKER.md', 'docs/12-adrs/ADR-0008.md'],
    },
    standards: [
      {
        id: 'agent.deps',
        precedence: 'security',
        rule: 'Adapter prompts must not execute CLI commands at render time.',
        rationale: 'Adapters are pure builders (P06-01).',
        references: ['docs/06-agent-engine/agent-engine.md'],
      },
    ],
    packet: {
      id: 'pkt-05',
      taskId: 'wk-03',
      title: 'Claude worker packet',
      scope: 'planning/handoffs only',
      inputs: ['planning/TRACKER.md'],
      outputs: ['planning/handoffs/phase-06-handoff.md'],
      dependencies: ['wk-01', 'wk-02'],
      status: 'queued',
    },
    root: 'C:/Users/demo/acme-web',
    requested: {},
  };
}

describe('claudeCodeAdapter (P06-05)', () => {
  it('registers as the claude-code adapter with declared capabilities', () => {
    expect(claudeCodeAdapter.id).toBe('claude-code');
    expect(claudeCodeAdapter.capabilities).toEqual({
      supportsStructuredOutput: true,
      supportsContextFiles: false,
      supportsResume: false,
      supportsInlineContext: true,
    });
  });

  it('renders the one-shot print-mode invocation with JSON output', () => {
    const request = baseRequest();
    const invocation = claudeCodeAdapter.render(request);
    expect(invocation.adapter).toBe('claude-code');
    expect(invocation.argv[0]).toBe('claude');
    expect(invocation.argv[1]).toBe('-p');
    expect(invocation.argv[2]).toBe(invocation.prompt);
    expect(invocation.argv[3]).toBe('--output-format');
    expect(invocation.argv[4]).toBe('json');
    expect(invocation.argv[5]).toBe('--allowedTools');
    expect(invocation.argv[6]).toBe('Bash Edit Glob Grep Read Write');
    expect(invocation.argv[7]).toBe('--max-turns');
    expect(invocation.argv[8]).toBe('40');
    expect(invocation.argv).toHaveLength(9);
    expect(invocation.cwd).toBe(request.root);
    expect(invocation.allowedPaths).toEqual([]);
    expect(invocation.structuredOutput).toBe('json');
  });

  it('instructs the agent to emit exactly one AiProposal-shaped JSON object', () => {
    const prompt = claudeCodeAdapter.render(baseRequest()).prompt;
    expect(prompt).toContain('# Output format (JSON only)');
    expect(prompt).toContain('"schemaVersion": 1,');
    expect(prompt).toContain('"agent": "claude-code",');
    expect(prompt).toContain('"requestId": "<context id here>",');
    expect(prompt).toContain('"id": "<stable short id>",');
    expect(prompt).toContain('"references": ["<requirement or packet refs>"]');
    expect(prompt).toContain('no markdown fences');
    expect(prompt).toContain('Items are DELTAS describing proposed changes, never commands.');
  });

  it('renders task, context bundle, standards, and packet into the prompt', () => {
    const prompt = claudeCodeAdapter.render(baseRequest()).prompt;
    expect(prompt).toContain('Author the phase-06 handoff with exact command results.');
    expect(prompt).toContain('Project: acme-web');
    expect(prompt).toContain('Context id: phase-06');
    expect(prompt).toContain('Estimated context tokens: 900');
    // Retrieval handles appear sorted (reversed input order in fixture).
    expect(prompt).toContain('docs/12-adrs/ADR-0008.md, planning/TRACKER.md');
    expect(prompt).toContain(
      '- `agent.deps` [security]: Adapter prompts must not execute CLI commands at render time.',
    );
    expect(prompt).toContain('  Rationale: Adapters are pure builders (P06-01).');
    expect(prompt).toContain('  References: docs/06-agent-engine/agent-engine.md');
    expect(prompt).toContain('Task id: wk-03');
    expect(prompt).toContain('Title: Claude worker packet');
    expect(prompt).toContain('Status: queued');
  });

  it('renders cleanly without an execution packet and with an empty evidence layer', () => {
    const request = baseRequest();
    const { packet: _packet, ...withoutPacket } = request;
    withoutPacket.standards = [
      { id: 'simple.rule', precedence: 'project', rule: 'A rule without extras.' },
    ];
    const prompt = claudeCodeAdapter.render(withoutPacket).prompt;
    expect(prompt).not.toContain('# Execution packet');
    expect(prompt).toContain('- `simple.rule` [project]: A rule without extras.');
    expect(prompt).not.toContain('Rationale:');
    expect(prompt).not.toContain('References:');
    expect(prompt).toContain('Evidence (L2): ');
  });

  it('is deterministic: identical requests render identical invocations', () => {
    const request = baseRequest();
    expect(claudeCodeAdapter.render(request)).toEqual(claudeCodeAdapter.render(request));
    expect(claudeCodeAdapter.render(request).prompt).toBe(claudeCodeAdapter.render(request).prompt);
  });

  it('never mutates the request arrays and never leaks absolute paths or CRLF', () => {
    const request = baseRequest();
    const handles = [...request.context.retrievalHandles];
    const outputs = request.packet ? [...request.packet.outputs] : [];
    claudeCodeAdapter.render(request);
    expect(request.context.retrievalHandles).toEqual(handles);
    expect(request.packet?.outputs).toEqual(outputs);

    const prompt = claudeCodeAdapter.render(request).prompt;
    expect(prompt).not.toContain(request.root);
    expect(prompt).not.toContain('\r');
    expect(prompt).not.toContain('\\');
  });

  it('degrades explicitly only for capabilities claude -p lacks in this surface', () => {
    const degradations = claudeCodeAdapter.degradations({
      supportsStructuredOutput: true,
      supportsContextFiles: true,
      supportsResume: true,
      supportsInlineContext: true,
    });
    // Structured output is supported, so it must NOT degrade.
    expect(degradations.map((d) => d.capability)).toEqual([
      'supportsContextFiles',
      'supportsResume',
    ]);
    for (const degradation of degradations) {
      expect(degradation.note.length).toBeGreaterThan(0);
    }
  });

  it('does not degrade for nothing requested or for supported capabilities', () => {
    expect(claudeCodeAdapter.degradations({})).toEqual([]);
    expect(claudeCodeAdapter.degradations({ supportsStructuredOutput: true })).toEqual([]);
    expect(
      claudeCodeAdapter.degradations({ supportsContextFiles: false, supportsInlineContext: true }),
    ).toEqual([]);
  });
});
