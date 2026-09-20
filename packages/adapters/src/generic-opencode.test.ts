import { describe, expect, it } from 'vitest';
import { genericAdapter } from './generic.js';
import { opencodeAdapter } from './opencode.js';
import type { AgentRequest } from './contract.js';

/** Deterministic fixture request shared by adapter tests. */
function request(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    task: 'Implement the auth module',
    context: {
      project: 'acme',
      contextId: 'ct-1',
      l0Capsule: 'Acme web app; phase 03; branch feat/auth',
      l1Index: 'ADR-0012 accepted; standards selected',
      l2Evidence: '',
      estimatedTokens: 320,
      retrievalHandles: ['docs/ADR-0012.md', 'planning/TRACKER.md'],
    },
    standards: [
      {
        id: 'sec-basic',
        precedence: 'security',
        rule: 'No secrets in the repository.',
        references: ['docs/ref-sec.md'],
      },
      { id: 'fmt-prettier', precedence: 'language', rule: 'Prettier, printWidth 100.' },
    ],
    packet: {
      id: 'pk-1',
      taskId: 'P06-03',
      title: 'Auth module',
      scope: 'auth/',
      inputs: ['docs/ADR-0012.md'],
      outputs: ['src/auth/'],
      dependencies: ['stack/react'],
      status: 'in-progress',
    },
    root: 'C:/work/acme',
    requested: {},
    ...overrides,
  };
}

describe('generic adapter (P06-02)', () => {
  it('has the documented capability baseline', () => {
    expect(genericAdapter.id).toBe('generic');
    expect(genericAdapter.capabilities).toEqual({
      supportsStructuredOutput: false,
      supportsContextFiles: false,
      supportsResume: false,
      supportsInlineContext: true,
    });
  });

  it('renders argv empty (prompt is the output) with cwd = root', () => {
    const invocation = genericAdapter.render(request());
    expect(invocation.argv).toEqual([]);
    expect(invocation.cwd).toBe('C:/work/acme');
    expect(invocation.structuredOutput).toBeNull();
    expect(invocation.allowedPaths).toEqual([]);
  });

  it('embeds task, context, standards (sorted), and packet in the prompt', () => {
    const invocation = genericAdapter.render(request());
    expect(invocation.prompt).toContain('# Task');
    expect(invocation.prompt).toContain('Implement the auth module');
    expect(invocation.prompt).toContain('Context id: ct-1');
    expect(invocation.prompt).toContain('`fmt-prettier`');
    expect(invocation.prompt).toContain('`sec-basic`');
    expect(invocation.prompt).toContain('# Execution packet');
    expect(invocation.prompt).toContain('Retrieval handles: docs/ADR-0012.md, planning/TRACKER.md');
    // References rendered below their rule.
    expect(invocation.prompt.indexOf('References: docs/ref-sec.md')).toBeGreaterThan(
      invocation.prompt.indexOf('No secrets in the repository'),
    );
  });

  it('omits packet section when no packet is provided', () => {
    const { packet: _omit, ...rest } = request();
    void _omit;
    const invocation = genericAdapter.render({
      ...rest,
      packet: undefined,
    } as unknown as AgentRequest);
    expect(invocation.prompt).not.toContain('# Execution packet');
  });

  it('degradations are explicit for requested-but-unsupported capabilities', () => {
    const degradations = genericAdapter.degradations({
      supportsStructuredOutput: true,
      supportsContextFiles: true,
      supportsResume: true,
    });
    expect(degradations.map((d) => d.capability)).toEqual([
      'supportsContextFiles',
      'supportsResume',
      'supportsStructuredOutput',
    ]);
    for (const d of degradations) {
      expect(d.note.length).toBeGreaterThan(0);
    }
  });

  it('no degradations when everything requested is supported', () => {
    expect(genericAdapter.degradations({ supportsInlineContext: true })).toEqual([]);
  });

  it('is deterministic: identical input, identical prompt and argv', () => {
    const a = genericAdapter.render(request());
    const b = genericAdapter.render(request());
    expect(a.prompt).toBe(b.prompt);
    expect(a.argv).toEqual(b.argv);
  });

  it('capability notes appear in the prompt when degrading', () => {
    const invocation = genericAdapter.render(
      request({ requested: { supportsStructuredOutput: true } }),
    );
    expect(invocation.prompt).toContain('# Capability notes');
    expect(invocation.prompt).toContain('supportsStructuredOutput');
  });
});

describe('opencode adapter (P06-03)', () => {
  it('has the documented capability baseline (all supported)', () => {
    expect(opencodeAdapter.id).toBe('opencode');
    expect(opencodeAdapter.capabilities).toEqual({
      supportsStructuredOutput: true,
      supportsContextFiles: true,
      supportsResume: true,
      supportsInlineContext: true,
    });
  });

  it('renders a plain run invocation when nothing is requested', () => {
    const invocation = opencodeAdapter.render(request());
    expect(invocation.argv[0]).toBe('opencode');
    expect(invocation.argv[1]).toBe('run');
    expect(invocation.argv).toHaveLength(3); // opencode run <prompt>
    expect(invocation.structuredOutput).toBeNull();
    expect(invocation.allowedPaths).toEqual([]);
  });

  it('adds --format json after the prompt when structured output is requested', () => {
    const invocation = opencodeAdapter.render(
      request({ requested: { supportsStructuredOutput: true } }),
    );
    expect(invocation.argv[0]).toBe('opencode');
    expect(invocation.argv[1]).toBe('run');
    expect(invocation.argv).toContain('--format');
    expect(invocation.argv).toContain('json');
    expect(invocation.structuredOutput).toBe('json');
  });

  it('attaches retrieval handles as -f flags when context files are requested', () => {
    const invocation = opencodeAdapter.render(
      request({ requested: { supportsContextFiles: true } }),
    );
    const fileFlags = invocation.argv.filter((v) => v === '-f');
    const handles = invocation.argv.filter((v) =>
      ['docs/ADR-0012.md', 'planning/TRACKER.md'].includes(v),
    );
    expect(fileFlags).toHaveLength(2);
    expect(handles).toHaveLength(2);
    expect(invocation.allowedPaths).toEqual(['docs/ADR-0012.md', 'planning/TRACKER.md']);
  });

  it('adds -c when resume is requested', () => {
    const invocation = opencodeAdapter.render(request({ requested: { supportsResume: true } }));
    expect(invocation.argv).toContain('-c');
  });

  it('does not duplicate retrieval handles when requested alongside other flags', () => {
    const invocation = opencodeAdapter.render(
      request({
        requested: {
          supportsStructuredOutput: true,
          supportsContextFiles: true,
          supportsResume: true,
        },
      }),
    );
    expect(invocation.argv.filter((v) => v === '-f')).toHaveLength(2);
    expect(invocation.argv.filter((v) => v === '-c')).toHaveLength(1);
    expect(invocation.argv.filter((v) => v === '--format')).toHaveLength(1);
    expect(invocation.structuredOutput).toBe('json');
  });

  it('is deterministic: identical input, identical argv and prompt', () => {
    const a = opencodeAdapter.render(request({ requested: { supportsStructuredOutput: true } }));
    const b = opencodeAdapter.render(request({ requested: { supportsStructuredOutput: true } }));
    expect(a.argv).toEqual(b.argv);
    expect(a.prompt).toBe(b.prompt);
  });
});
