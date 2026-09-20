import { describe, expect, it } from 'vitest';
import type { AgentRequest } from './contract.js';
import { codexAdapter } from './codex.js';

function baseRequest(): AgentRequest {
  return {
    task: 'Implement the retry client with exponential backoff.',
    context: {
      project: 'acme-web',
      contextId: 'phase-03',
      l0Capsule: 'Acme web; phase 03; branch feat/auth; blockers: none.',
      l1Index: 'REQ-GEN-004; ADR-0012; standards: sec-basic.',
      l2Evidence: 'Evidence row 1; Evidence row 2.',
      estimatedTokens: 1200,
      retrievalHandles: ['planning/TRACKER.md', 'docs/12-adrs/ADR-0012.md'],
    },
    standards: [
      {
        id: 'sec.deps.pinned',
        precedence: 'security',
        rule: 'All dependencies must be pinned with integrity digests.',
        references: ['docs/02-architecture/state-and-manifest.md'],
      },
      {
        id: 'project.chg.no-clocks',
        precedence: 'explicit-project-policy',
        rule: 'Pure modules must not read clocks, random, or the filesystem.',
        rationale: 'Byte-stable regeneration requires deterministic renderers.',
      },
    ],
    packet: {
      id: 'pkt-04',
      taskId: 'wk-02',
      title: 'Codex worker packet',
      scope: 'packages/adapters/src only',
      inputs: ['docs/12-adrs/ADR-0012.md'],
      outputs: ['packages/adapters/src/codex.ts'],
      dependencies: ['wk-01', 'wk-03'],
      status: 'in_progress',
    },
    root: 'C:/Users/demo/acme-web',
    requested: {},
  };
}

describe('codexAdapter (P06-04)', () => {
  it('registers as the codex extension adapter with declared capabilities', () => {
    expect(codexAdapter.id).toBe('codex');
    expect(codexAdapter.capabilities).toEqual({
      supportsStructuredOutput: false,
      supportsContextFiles: false,
      supportsResume: false,
      supportsInlineContext: true,
    });
  });

  it('renders the one-shot codex exec invocation in auto-approve mode', () => {
    const request = baseRequest();
    const invocation = codexAdapter.render(request);
    expect(invocation.adapter).toBe('codex');
    expect(invocation.argv[0]).toBe('codex');
    expect(invocation.argv[1]).toBe('exec');
    expect(invocation.argv[2]).toBe(invocation.prompt);
    // Sandboxed auto-approve mode (workspace-write).
    expect(invocation.argv[3]).toBe('--sandbox');
    expect(invocation.argv[4]).toBe('workspace-write');
    expect(invocation.argv).toHaveLength(5);
    expect(invocation.cwd).toBe(request.root);
    expect(invocation.allowedPaths).toEqual([]);
    expect(invocation.structuredOutput).toBeNull();
  });

  it('renders task, context bundle, standards, and packet into the prompt', () => {
    const prompt = codexAdapter.render(baseRequest()).prompt;
    expect(prompt).toContain('Implement the retry client with exponential backoff.');
    expect(prompt).toContain('Project: acme-web');
    expect(prompt).toContain('Context id: phase-03');
    expect(prompt).toContain('Context capsule (L0): Acme web; phase 03');
    expect(prompt).toContain('Context index (L1): REQ-GEN-004; ADR-0012');
    expect(prompt).toContain('Evidence (L2): Evidence row 1; Evidence row 2.');
    expect(prompt).toContain('Estimated context tokens: 1200');
    // Retrieval handles appear sorted (reversed input order in fixture).
    expect(prompt).toContain('docs/12-adrs/ADR-0012.md, planning/TRACKER.md');
    expect(prompt).toContain(
      '- `sec.deps.pinned` [security]: All dependencies must be pinned with integrity digests.',
    );
    expect(prompt).toContain('  References: docs/02-architecture/state-and-manifest.md');
    expect(prompt).toContain(
      '- `project.chg.no-clocks` [explicit-project-policy]: Pure modules must not read clocks, random, or the filesystem.',
    );
    expect(prompt).toContain(
      '  Rationale: Byte-stable regeneration requires deterministic renderers.',
    );
    expect(prompt).toContain('Task id: wk-02');
    expect(prompt).toContain('Status: in_progress');
    expect(prompt).toContain('Plain text only; no JSON output is required.');
  });

  it('declares the extension status and stays out of structured-output paths', () => {
    const prompt = codexAdapter.render(baseRequest()).prompt;
    expect(prompt).not.toContain('Output format (JSON only)');
    expect(prompt).not.toContain('schemaVersion');
  });

  it('renders cleanly without an execution packet and without optional fields', () => {
    const request = baseRequest();
    const { packet: _packet, ...withoutPacket } = request;
    withoutPacket.standards = [{ id: 'a.b', precedence: 'project', rule: 'Rule only.' }];
    const prompt = codexAdapter.render(withoutPacket).prompt;
    expect(prompt).not.toContain('# Execution packet');
    expect(prompt).not.toContain('Task id:');
    expect(prompt).toContain('- `a.b` [project]: Rule only.');
    expect(prompt).not.toContain('Rationale:');
    expect(prompt).not.toContain('References:');
  });

  it('is deterministic: identical and shuffled inputs render identical output', () => {
    const request = baseRequest();
    const first = codexAdapter.render(request);
    const second = codexAdapter.render(request);
    expect(first).toEqual(second);

    const shuffled = baseRequest();
    shuffled.context.retrievalHandles = [
      'docs/12-adrs/ADR-0012.md',
      'planning/TRACKER.md',
      'docs/08-security/threat-model.md',
    ];
    const packet = shuffled.packet;
    if (packet !== undefined) {
      shuffled.packet = { ...packet, outputs: [...packet.outputs].reverse() };
    }
    expect(codexAdapter.render(shuffled)).toEqual(codexAdapter.render(shuffled));
    // Shuffled variant still sorts in output.
    expect(codexAdapter.render(shuffled).prompt).toContain(
      'docs/08-security/threat-model.md, docs/12-adrs/ADR-0012.md, planning/TRACKER.md',
    );
  });

  it('never mutates the request arrays and never leaks absolute paths or CRLF', () => {
    const request = baseRequest();
    const handles = [...request.context.retrievalHandles];
    const inputs = request.packet ? [...request.packet.inputs] : [];
    codexAdapter.render(request);
    expect(request.context.retrievalHandles).toEqual(handles);
    expect(request.packet?.inputs).toEqual(inputs);

    const prompt = codexAdapter.render(request).prompt;
    expect(prompt).not.toContain(request.root);
    expect(prompt).not.toContain('\r');
    expect(prompt).not.toContain('\\');
  });

  it('degrades explicitly for every unsupported requested capability', () => {
    const degradations = codexAdapter.degradations({
      supportsStructuredOutput: true,
      supportsContextFiles: true,
      supportsResume: true,
      supportsInlineContext: true,
    });
    expect(degradations.map((d) => d.capability)).toEqual([
      'supportsContextFiles',
      'supportsResume',
      'supportsStructuredOutput',
    ]);
    for (const degradation of degradations) {
      expect(degradation.note.length).toBeGreaterThan(0);
    }
  });

  it('does not degrade for nothing requested or for supported capabilities', () => {
    expect(codexAdapter.degradations({})).toEqual([]);
    expect(codexAdapter.degradations({ supportsInlineContext: true })).toEqual([]);
    expect(
      codexAdapter.degradations({ supportsStructuredOutput: false, supportsResume: false }),
    ).toEqual([]);
  });
});
