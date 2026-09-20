import { describe, expect, it } from 'vitest';
import { validateProposal, proposalValidator } from './proposal.js';
import { createRegistry, createDefaultRegistry } from './registry.js';
import { compileContextBundle, createContextProvider } from './context-bundle.js';
import { renderStandardsBlock, standardsInjector } from './standards-injector.js';
import { createMemoryProvider, noMemoryRows } from './memory-provider.js';
import { renderExecutionPacket, packetRenderer } from './execution-packet.js';
import { genericAdapter, opencodeAdapter } from '@planmo/adapters';
import type { ContextView, PacketView, StandardView } from '@planmo/adapters';

// ---------------------------------------------------------------- proposals

describe('validateProposal (P06-06, critical)', () => {
  it('accepts a well-formed proposal', () => {
    const result = validateProposal({
      schemaVersion: 1,
      agent: 'opencode',
      requestId: 'req-1',
      items: [{ id: 'it-1', status: 'proposed', summary: 'Add auth routes' }],
    });
    expect(result.ok).toBe(true);
    expect(result.proposal?.agent).toBe('opencode');
    expect(result.proposal?.items[0]?.summary).toBe('Add auth routes');
  });

  it('rejects malformed proposals and reports diagnostics', () => {
    const result = validateProposal({ schemaVersion: 1, agent: 'opencode' });
    expect(result.ok).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('rejects a future schema version', () => {
    const result = validateProposal({
      schemaVersion: 99,
      agent: 'opencode',
      requestId: 'req-1',
      items: [],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an array where an object is expected (never throws)', () => {
    const result = validateProposal([1, 2, 3] as never);
    expect(result.ok).toBe(false);
  });
});

describe('proposalValidator', () => {
  it('exposes validate and never mutates the input', () => {
    const raw = { schemaVersion: 1, agent: 'opencode', requestId: 'req-1', items: [] };
    const snapshot = JSON.stringify(raw);
    expect(proposalValidator.validate(raw).ok).toBe(true);
    expect(JSON.stringify(raw)).toBe(snapshot);
  });
});

// ----------------------------------------------------------------- registry

describe('createRegistry (P06-01)', () => {
  it('registers and resolves adapters by id', () => {
    const registry = createRegistry();
    registry.register(genericAdapter);
    registry.register(opencodeAdapter);
    const result = registry.resolve('generic', {});
    if ('error' in result) throw new Error(result.error);
    expect(result.adapter.id).toBe('generic');
  });

  it('returns an explicit error for unknown adapter ids (not silent)', () => {
    const registry = createRegistry();
    registry.register(genericAdapter);
    const result = registry.resolve('claude-code', {});
    expect('error' in result).toBe(true);
  });

  it('lists registered ids deterministically', () => {
    const registry = createRegistry();
    registry.register(opencodeAdapter);
    registry.register(genericAdapter);
    expect(registry.ids()).toEqual(['generic', 'opencode']);
  });

  it('rejects duplicate id registration', () => {
    const registry = createRegistry();
    registry.register(genericAdapter);
    expect(() => registry.register(genericAdapter)).toThrow(/duplicate/i);
  });
});

describe('createDefaultRegistry', () => {
  it('registers all four adapters (three v1-primary + codex extension)', () => {
    const registry = createDefaultRegistry();
    expect(registry.ids()).toEqual(['claude-code', 'codex', 'generic', 'opencode']);
  });

  it('resolve works through the default registry', () => {
    const registry = createDefaultRegistry();
    const result = registry.resolve('codex', {});
    if ('error' in result) throw new Error(result.error);
    expect(result.adapter.id).toBe('codex');
  });
});

// ---------------------------------------------------------- context bundle

describe('compileContextBundle (P06-07)', () => {
  it('compiles a budget-bounded bundle with sorted handles', () => {
    const bundle = compileContextBundle({
      project: 'acme',
      contextId: 'ct-1',
      capsule: 'Acme; phase 03; branch feat/auth',
      indexEntries: ['ADR-0012 accepted', 'REQ-STD-001..004 applicable'],
      evidenceEntries: ['standard sec-basic: no secrets'],
      retrievalHandles: ['planning/TRACKER.md', 'docs/ADR-0012.md'],
    });
    expect(bundle.project).toBe('acme');
    expect(bundle.contextId).toBe('ct-1');
    expect(bundle.l1Index).toContain('ADR-0012');
    expect(bundle.retrievalHandles).toEqual(['docs/ADR-0012.md', 'planning/TRACKER.md']);
    expect(bundle.estimatedTokens).toBeGreaterThan(0);
  });

  it('caps index and evidence entries (progressive disclosure + budget)', () => {
    const bundle = compileContextBundle(
      {
        project: 'acme',
        contextId: 'ct-1',
        capsule: 'capsule',
        indexEntries: ['i1', 'i2', 'i3'],
        evidenceEntries: ['e1', 'e2'],
        retrievalHandles: [],
      },
      { indexMax: 2, evidenceMax: 1 },
    );
    expect(bundle.l1Index).toBe('i1\ni2');
    expect(bundle.l2Evidence).toBe('e1');
  });

  it('allows an empty evidence layer when budget forbids loading it', () => {
    const bundle = compileContextBundle({
      project: 'acme',
      contextId: 'ct-1',
      capsule: 'capsule',
      indexEntries: [],
      evidenceEntries: [],
      retrievalHandles: [],
    });
    expect(bundle.l2Evidence).toBe('');
  });

  it('is deterministic for identical inputs', () => {
    const input = {
      project: 'acme',
      contextId: 'ct-1',
      capsule: 'capsule',
      indexEntries: ['a', 'b'],
      evidenceEntries: ['c'],
      retrievalHandles: ['planning/TRACKER.md', 'docs/ADR-0012.md'],
    };
    expect(compileContextBundle(input)).toEqual(compileContextBundle(input));
  });

  it('createContextProvider reads through the injected reader', async () => {
    const provider = createContextProvider(async (contextId) => ({
      project: 'acme',
      contextId,
      capsule: 'capsule',
      indexEntries: ['x'],
      evidenceEntries: [],
      retrievalHandles: ['docs/ADR-0012.md'],
    }));
    const view = await provider.compile('ct-9');
    expect(view.contextId).toBe('ct-9');
    expect(await provider.resolveHandles('ct-9')).toEqual(['docs/ADR-0012.md']);
  });
});

// --------------------------------------------------------- standards inject

describe('renderStandardsBlock (P06-08)', () => {
  it('orders by precedence tier then id, deterministically', () => {
    const standards: readonly StandardView[] = [
      { id: 'z', precedence: 'language', rule: 'z' },
      { id: 'a', precedence: 'security', rule: 'a' },
      { id: 'b', precedence: 'security', rule: 'b' },
    ];
    const text = renderStandardsBlock(standards);
    expect(text.indexOf('`a`')).toBeLessThan(text.indexOf('`b`'));
    expect(text.indexOf('`b`')).toBeLessThan(text.indexOf('`z`'));
  });

  it('renders an explicit no-standards marker', () => {
    expect(renderStandardsBlock([])).toBe('(no applicable standards)');
  });

  it('standardsInjector delegates to the pure renderer', () => {
    expect(standardsInjector.render([])).toBe(renderStandardsBlock([]));
  });
});

// ------------------------------------------------------------ memory rows

describe('createMemoryProvider (P06-10)', () => {
  it('returns an explicit no-op row when nothing is available', async () => {
    const provider = createMemoryProvider([]);
    const rows = await provider.relevant('ct-1', 5);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('no-durable-memory');
    expect(rows[0]?.source).toBe('canonical-project-state');
  });

  it('returns rows bounded by limit, sorted by id', async () => {
    const provider = createMemoryProvider([
      { id: 'lesson-b', kind: 'lesson', summary: 'b', source: 'planning/handoffs/phase-03' },
      { id: 'fact-a', kind: 'fact', summary: 'a', source: 'docs/ADR-0012' },
      { id: 'fact-c', kind: 'fact', summary: 'c', source: 'docs/ADR-0013' },
    ]);
    const rows = await provider.relevant('ct-1', 2);
    expect(rows.map((r) => r.id)).toEqual(['fact-a', 'fact-c']);
  });

  it('noMemoryRows is explicit and honest for a missing source', () => {
    const rows = noMemoryRows('ct-1');
    expect(rows[0]?.summary).toContain('ct-1');
  });
});

// -------------------------------------------------------- execution packet

describe('renderExecutionPacket (P06-11)', () => {
  const packet: PacketView = {
    id: 'pk-1',
    taskId: 'P06-03',
    title: 'Auth module',
    scope: 'auth/',
    inputs: ['docs/ADR-0012.md'],
    outputs: ['src/auth/'],
    dependencies: ['stack/react'],
    status: 'in-progress',
  };
  const context: ContextView = {
    project: 'acme',
    contextId: 'ct-1',
    l0Capsule: 'capsule',
    l1Index: 'index',
    l2Evidence: '',
    estimatedTokens: 100,
    retrievalHandles: ['docs/ADR-0012.md'],
  };

  it('renders packet + context deterministically', () => {
    const text = renderExecutionPacket(packet, context);
    expect(text).toContain('Packet: pk-1');
    expect(text).toContain('Task: P06-03');
    expect(text).toContain('Context id: ct-1');
    expect(text).toContain('Retrieval handles: docs/ADR-0012.md');
  });

  it('omits empty optionals without placeholders', () => {
    const text = renderExecutionPacket(
      { ...packet, dependencies: [] },
      { ...context, l2Evidence: '' },
    );
    expect(text).not.toContain('Dependencies:');
    expect(text).not.toContain('Evidence:');
  });

  it('is deterministic for identical inputs', () => {
    expect(renderExecutionPacket(packet, context)).toBe(renderExecutionPacket(packet, context));
  });

  it('packetRenderer delegates to the pure renderer', () => {
    expect(packetRenderer.render(packet, context)).toBe(renderExecutionPacket(packet, context));
  });
});

// ----------------------------------------------------- bridge→adapter flow

describe('bridge → adapter end-to-end wiring', () => {
  it('renders an opencode invocation with a compiled bundle and validated proposal path', async () => {
    const provider = createContextProvider(async (contextId) => ({
      project: 'acme',
      contextId,
      capsule: 'capsule',
      indexEntries: ['selected: sec-basic'],
      evidenceEntries: [],
      retrievalHandles: ['docs/ref-sec.md'],
    }));
    const bundle = await provider.compile('ct-1');
    const standards: readonly StandardView[] = [
      { id: 'sec-basic', precedence: 'security', rule: 'No secrets.' },
    ];
    const invocation = opencodeAdapter.render({
      task: 'Add auth',
      context: bundle,
      standards,
      root: 'C:/work/acme',
      requested: { supportsStructuredOutput: true },
    });
    expect(invocation.adapter).toBe('opencode');
    expect(invocation.structuredOutput).toBe('json');
    expect(invocation.argv).toContain('--format');
    // The proposal the agent returns is schema-validated separately:
    expect(
      validateProposal({
        schemaVersion: 1,
        agent: 'opencode',
        requestId: 'req-1',
        items: [{ id: 'it-1', summary: 'auth' }],
      }).ok,
    ).toBe(true);
  });
});
